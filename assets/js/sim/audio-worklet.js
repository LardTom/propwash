// Audio thread of the drone motor sound: renders audio/MotorSynth (the mod's synthesizer) in an AudioWorklet, the way
// the mod's MotorStream feeds it to an OpenAL streaming channel. The main thread (audio.js) owns the voice logic
// (client.DroneVoice) and posts what DroneVoice publishes into the MotorControl; this side only renders.
//
// Messages in (port.onmessage, all optional fields sanitised by MotorControl's setters):
//   { type: 'timbre', values }   MotorTimbre components in MotorTimbre.COMPONENTS order; used by the next 'start'
//   { type: 'control', rpm: [4], load: [4], wash, airflow, doppler, gain, brightnessHz, smoothingSeconds, active,
//     onboard, impulseCount, impulseStrength }   one MotorControl.publish()
//   { type: 'start', seed }      new MotorSynth (MotorSoundInstance.open: a fresh synth per started sound)
//   { type: 'stop' }             drop the synth: silence (stopInstances)
//   { type: 'dispose' }          end the processor
// Messages out: { type: 'error', message } once per failed synth (render threw; the voice falls silent like a failed
// MotorStream and audio.js restarts it).
//
// The module is also importable outside a worklet (main thread, Node): it then only defines the class. audio.js imports
// PROCESSOR_NAME and WORKLET_URL from here, so the cache-busting stamp of this file reaches audio.js too.

import { MotorControl } from './audio/MotorControl.js?v=e5eb5688';
import { MotorSynth } from './audio/MotorSynth.js?v=0a4826ce';
import { MotorTimbre } from './audio/MotorTimbre.js?v=d8807f99';

export const PROCESSOR_NAME = 'propwash-motors';
export const WORKLET_URL = import.meta.url;

const Base = typeof AudioWorkletProcessor === 'function' ? AudioWorkletProcessor : class {};

function timbreOf(values) {
  if (!Array.isArray(values) || values.length !== MotorTimbre.COMPONENTS.length) {
    return MotorTimbre.DEFAULT;
  }
  return new MotorTimbre(...values);
}

export class PropwashMotorsProcessor extends Base {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.rate = typeof sampleRate === 'number' ? sampleRate : MotorSynth.SAMPLE_RATE;
    this.control = new MotorControl();
    this.timbre = timbreOf(opts.timbre);
    this.synth = null;
    this.disposed = false;
    if (this.port) {
      this.port.onmessage = (e) => this.onMessage(e.data);
    }
  }

  onMessage(msg) {
    if (!msg || typeof msg !== 'object') {
      return;
    }
    try {
      switch (msg.type) {
        case 'control':
          this.applyControl(msg);
          break;
        case 'timbre':
          this.timbre = timbreOf(msg.values);
          break;
        case 'start':
          this.synth = new MotorSynth(this.timbre, this.control, Number(msg.seed) || 0, this.rate);
          break;
        case 'stop':
          this.synth = null;
          break;
        case 'dispose':
          this.synth = null;
          this.disposed = true;
          break;
        default:
          break;
      }
    } catch (e) {
      this.fail(e);
    }
  }

  applyControl(msg) {
    const c = this.control;
    const rpm = msg.rpm;
    const load = msg.load;
    if (rpm && load) {
      for (let m = 0; m < MotorControl.MOTORS; m++) {
        c.setMotor(m, Number(rpm[m]), Number(load[m]));
      }
    }
    c.setWash(Number(msg.wash));
    c.setAirflow(Number(msg.airflow));
    c.setDoppler(Number(msg.doppler));
    c.setGain(Number(msg.gain));
    c.setBrightnessHz(Number(msg.brightnessHz));
    c.setSmoothingSeconds(Number(msg.smoothingSeconds));
    c.setActive(!!msg.active);
    c.setOnboard(!!msg.onboard);
    c._impulseStrength = MotorControl.sanitize(Number(msg.impulseStrength), 0.0, 1.0);
    c._impulseCount = Number(msg.impulseCount) | 0;
    c.publish();
  }

  fail(e) {
    this.synth = null;
    if (this.port) {
      try {
        this.port.postMessage({ type: 'error', message: String(e && e.message ? e.message : e) });
      } catch (ignored) {
        // nothing to report to
      }
    }
  }

  process(inputs, outputs) {
    if (this.disposed) {
      return false;
    }
    const output = outputs[0];
    if (!output || output.length === 0 || this.synth === null) {
      return true;
    }
    const out = output[0];
    try {
      this.synth.render(out, out.length);
    } catch (e) {
      out.fill(0);
      this.fail(e);
    }
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(out);
    }
    return true;
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor(PROCESSOR_NAME, PropwashMotorsProcessor);
}
