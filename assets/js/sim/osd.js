// On-screen display over the FPV image, Betaflight style: white monospaced text with a black outline on a 30×16 grid
// of the 16:9 image (analog OSD), plus crosshair and artificial horizon.

const COLS = 30;
const ROWS = 16;

const BLOCKER_TEXT = {
  ARM_SWITCH_NOT_RESET: 'ARM SWITCH',
  THROTTLE_NOT_LOW: 'THROTTLE',
  TILTED: 'ANGLE',
  PACK_DEPLETED: 'BATTERY',
  BUILD_INVALID: 'BUILD',
  CRASH_COOLDOWN: 'CRASH',
  FAILSAFE: 'FAILSAFE',
  REBOOTING: 'REBOOT',
  IN_FLUID: 'WATER',
  HARDWARE_FAULT: 'HARDWARE',
  THROTTLE_NOT_CENTERED: 'THROTTLE',
  TURTLE_AIRBORNE: 'AIRBORNE',
};

const MODE_TEXT = { ACRO: 'ACRO', ANGLE: 'ANGL', HORIZON: 'HOR' };

export class Osd {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.flash = 0;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
  }

  /**
   * @param {object} s { telemetry, armed, mode, blockers: string[], flightTime, message, messageUntil, now, fpv, cells,
   *   crosshair, horizon, droneName, inputName }
   */
  draw(s) {
    const c = this.canvas;
    if (c.width !== Math.round(c.clientWidth * (this.dpr || 1)) || !this.dpr) this.resize();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    // The OSD grid covers the 16:9 image, centred in the window.
    let w = c.width;
    let h = c.height;
    let x0 = 0;
    let y0 = 0;
    if (w / h > 16 / 9) {
      const iw = h * 16 / 9;
      x0 = (w - iw) / 2;
      w = iw;
    } else {
      const ih = w * 9 / 16;
      y0 = (h - ih) / 2;
      h = ih;
    }
    const cw = w / COLS;
    const ch = h / ROWS;
    const size = Math.round(ch * 0.62);
    ctx.font = `600 ${size}px "PW Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const text = (col, row, str, align = 'left', color = '#fff') => {
      ctx.textAlign = align;
      const x = x0 + col * cw;
      const y = y0 + (row + 0.5) * ch;
      ctx.strokeText(str, x, y);
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    };
    const t = s.telemetry;
    const blink = Math.floor(s.now * 2.5) % 2 === 0;

    // Battery: average cell voltage and pack voltage, mAh used.
    const cell = t.batteryCellVoltage;
    const low = t.batteryState && t.batteryState.name !== 'OK';
    text(1, 1, `${(t.batteryVoltage || 0).toFixed(1)}V`, 'left', low && blink ? '#ff5a3c' : '#fff');
    text(1, 2, `${(cell || 0).toFixed(2)}V/C`, 'left', low && blink ? '#ff5a3c' : '#fff');
    text(1, ROWS - 2, `${Math.round(t.batteryMahUsed || 0)}MAH`);
    text(1, ROWS - 3, `${(t.batteryCurrentA || 0).toFixed(1)}A`);
    // Flight time and mode.
    const sec = Math.floor(s.flightTime);
    text(COLS - 1, 1, `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, 'right');
    text(COLS - 1, 2, MODE_TEXT[s.mode] || s.mode, 'right');
    if (t.airmodeActive) text(COLS - 1, 3, 'AIR', 'right');
    // Throttle, speed, altitude.
    text(COLS - 1, ROWS - 2, `THR ${Math.round((t.throttleOut || 0) * 100)}%`, 'right');
    text(COLS - 1, ROWS - 3, `${Math.round((t.speed || 0) * 3.6)}KM/H`, 'right');
    const alt = s.altitude;
    text(COLS - 1, ROWS - 4, `${alt >= 0 ? '' : '-'}${Math.abs(alt).toFixed(1)}M`, 'right');

    // Centre: crosshair, horizon, messages.
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    if (s.crosshair) {
      ctx.lineWidth = Math.max(2, size * 0.14);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.moveTo(cx - cw * 0.8, cy);
      ctx.lineTo(cx + cw * 0.8, cy);
      ctx.moveTo(cx, cy - ch * 0.35);
      ctx.lineTo(cx, cy + ch * 0.35);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.lineWidth = Math.max(2, size * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    }
    if (!s.armed) {
      text(COLS / 2, ROWS / 2 - 3, 'DISARMED', 'center');
      if (s.blockers.length) text(COLS / 2, ROWS / 2 + 3, s.blockers.map((b) => BLOCKER_TEXT[b] || b).join(' '), 'center', blink ? '#ffbb00' : '#fff');
    }
    if (s.message && s.now < s.messageUntil) text(COLS / 2, ROWS / 2 - 2, s.message, 'center', s.messageColor || '#fff');
    else if (low && s.armed) text(COLS / 2, ROWS / 2 + 4, blink ? (t.batteryState.name === 'LOW' ? 'LOW BATTERY' : 'LAND NOW') : '', 'center', '#ff5a3c');
    // Craft name, Betaflight style: upper case, bottom centre.
    if (s.craftName) text(COLS / 2, ROWS - 1, s.craftName.toUpperCase().slice(0, 18), 'center');
  }
}

export { BLOCKER_TEXT };
