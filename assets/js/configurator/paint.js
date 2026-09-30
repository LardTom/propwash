// Paint of the drone viewer, as in Propwash 0.4.0: every paintable model has tint groups (drone_paint.json), each
// group belongs to a paint channel with a reference grey. A painted part swaps to its "_paint" model and multiplies
// each tint group with PaintChannel.tint(colour); parts without any painted group keep the unpainted model.

import { PROP_SLOTS } from './assembly.js';

const CHANNEL_SLOT = Object.freeze({
  frame: 'frame', tpu: 'tpu', motor: 'motors', stack: 'stack', battery: 'battery', camera: 'camera', antenna: 'antenna',
  accessory: 'accessories',
});

/** Paint slot of a channel (PaintSlot.of): the prop channel maps to the prop slot of the position. */
export function slotOf(channel, propPosition = 0) {
  if (channel === 'prop') return PROP_SLOTS[propPosition] || PROP_SLOTS[0];
  return CHANNEL_SLOT[channel] || null;
}

export function rgbOf(hex) {
  return parseInt(String(hex).replace('#', ''), 16) & 0xffffff;
}

export function hexOf(rgb) {
  return '#' + (rgb & 0xffffff).toString(16).padStart(6, '0');
}

/**
 * PaintSwatch: the 16 dye colours, then the 5 finishes, in the order of the paint screen. A swatch paints its RGB
 * value like any other colour (finishes too), so a swatch and the same custom colour give the same share code.
 */
export const PAINT_SWATCHES = Object.freeze([
  ['white', 0xf9fffe], ['light_gray', 0x9d9d97], ['gray', 0x474f52], ['black', 0x1d1d21],
  ['brown', 0x835432], ['red', 0xb02e26], ['orange', 0xf9801d], ['yellow', 0xfed83d],
  ['lime', 0x80c71f], ['green', 0x5e7c16], ['cyan', 0x169c9c], ['light_blue', 0x3ab3da],
  ['blue', 0x3c44aa], ['purple', 0x8932b8], ['magenta', 0xc74ebd], ['pink', 0xf38baa],
  ['carbon', 0x2a2c30, true], ['gunmetal', 0x4e535b, true], ['aluminium', 0xb8bec6, true], ['gold', 0xd8a93b, true],
  ['copper', 0xb8693a, true],
].map(([key, rgb, finish = false]) => Object.freeze({ key, rgb, hex: hexOf(rgb), finish })));

/** PaintSwatch.byColor: the swatch with exactly this colour, or null. */
export function swatchOf(color) {
  if (!color) return null;
  const rgb = typeof color === 'number' ? color & 0xffffff : rgbOf(color);
  return PAINT_SWATCHES.find((s) => s.rgb === rgb) || null;
}

/** PaintSwatches.shade: every channel times factor, capped at 255. */
export function shade(rgb, factor) {
  let out = 0;
  for (let shift = 16; shift >= 0; shift -= 8) out = (out << 8) | Math.min(255, Math.round(((rgb >> shift) & 0xff) * factor));
  return out;
}

function mix(rgb, other, share) {
  let out = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    const a = (rgb >> shift) & 0xff;
    out = (out << 8) | Math.round(a + (((other >> shift) & 0xff) - a) * share);
  }
  return out;
}

function hueOf(rgb) {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
  return (h * 60 + 360) % 360;
}

const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const SWATCH = Object.fromEntries(PAINT_SWATCHES.map((s) => [s.key, s]));
// Colourful dyes that carry a scheme; brown and the greys only ever play the neutral part.
const ACCENTS = ['red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink']
  .map((key) => ({ swatch: SWATCH[key], hue: hueOf(SWATCH[key].rgb) }));

/**
 * A random paint job that still looks planned: one accent dye, a partner (complementary, neighbouring hue or a
 * neutral), a dark, light or metal base for frame and stack, neutrals for battery and camera, props all alike or
 * front/rear in two colours for orientation, and now and then a lighter or darker tone of the accent as custom
 * colour. Only swatch colours and such tones are used. random() gives numbers in [0, 1).
 * @returns {object} slot → '#rrggbb' for every slot in slots
 */
export function randomPaint(slots, random = Math.random) {
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const chance = (p) => random() < p;
  const accent = pick(ACCENTS);
  const a = accent.swatch;
  const others = ACCENTS.filter((c) => c !== accent);
  const byDistance = (target) => [...others].sort((x, y) => hueDistance(x.hue, target) - hueDistance(y.hue, target));
  const harmony = random();
  let partner = null;
  if (harmony < 0.4) partner = pick(byDistance(accent.hue + 180).slice(0, 2)).swatch;
  else if (harmony < 0.7) {
    const near = others.filter((c) => hueDistance(c.hue, accent.hue) <= 75);
    partner = (near.length ? pick(near) : byDistance(accent.hue + 180)[0]).swatch;
  }
  const style = chance(0.58) ? 'dark' : chance(0.55) ? 'light' : 'metal';
  const light = style === 'light';
  const base = SWATCH[light ? pick(['white', 'white', 'aluminium']) : style === 'metal' ? pick(['carbon', 'gunmetal'])
    : chance(0.7) ? 'carbon' : pick(['black', 'gunmetal'])];
  const neutral = SWATCH[light ? pick(['white', 'light_gray', 'aluminium']) : pick(['black', 'gunmetal', 'gray', 'carbon'])];
  const metal = SWATCH[style === 'metal' ? pick(['gold', 'copper', 'aluminium']) : pick(['aluminium', 'gunmetal', 'gold', 'copper'])];
  const second = partner || SWATCH[light ? pick(['black', 'aluminium']) : pick(['white', 'black', 'light_gray'])];
  const contrast = SWATCH[light || base.key === 'white' ? 'black' : 'white'];

  const colour = {
    frame: base.rgb,
    tpu: (chance(0.75) ? a : second).rgb,
    motors: (chance(0.4) ? metal : chance(0.5) ? second : a).rgb,
    stack: SWATCH[chance(0.8) ? 'carbon' : pick(['black', 'gunmetal'])].rgb,
    battery: (chance(0.6) ? neutral : second).rgb,
    camera: (chance(0.6) ? SWATCH[light ? pick(['white', 'black']) : pick(['black', 'gunmetal', 'carbon'])] : a).rgb,
    antenna: (chance(0.65) ? a : second).rgb,
    accessories: (chance(0.5) ? neutral : chance(0.5) ? metal : second).rgb,
  };
  let front = a;
  let rear = a;
  if (chance(0.5)) {
    rear = chance(0.6) ? second : contrast;
    if (rear === front) rear = contrast;
  } else if (chance(0.3)) {
    front = rear = second;
  }
  colour.prop_fl = colour.prop_fr = front.rgb;
  colour.prop_rl = colour.prop_rr = rear.rgb;
  if (chance(0.2)) {
    const slot = pick(['motors', 'antenna', 'accessories', 'camera']);
    colour[slot] = chance(0.5) ? shade(a.rgb, 0.72) : mix(a.rgb, 0xffffff, 0.35);
  }
  return Object.fromEntries(slots.filter((slot) => slot in colour).map((slot) => [slot, hexOf(colour[slot])]));
}

/** PaintChannel.tint: colour scaled so that the channel's reference grey in the paint texture gives the colour. */
export function channelTint(rgb, reference) {
  let out = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    const c = (rgb >> shift) & 0xff;
    out = (out << 8) | Math.min(255, Math.floor((c * 255 + Math.floor(reference / 2)) / reference));
  }
  return out;
}

/**
 * DroneVisuals.paintTints: tint per group, or null when no group of this part is painted.
 * @param {Array<[string, string]>} groups [channel, '#base'] per tint index
 * @param {object} paint slot → '#rrggbb' (only painted slots)
 */
export function paintTints(groups, paint, propPosition, channels) {
  if (!groups || !groups.length || !paint) return null;
  let painted = false;
  const tints = groups.map(([channel, base]) => {
    const slot = slotOf(channel, propPosition);
    const color = slot && paint[slot];
    if (color) painted = true;
    return channelTint(rgbOf(color || base), channels[channel] || 255);
  });
  return painted ? tints : null;
}

/** Tint groups of a placed piece (from its model file or, for the top mount, render.json). */
export function groupsOf(piece, model, render) {
  if (piece.role === 'accessory_base') {
    const base = render.accessory_bases && render.accessory_bases[piece.mount];
    return base ? base.groups : null;
  }
  if (!model || !model.variants) return null;
  const painted = model.variants[piece.variant === 'ccw' ? 'ccw_paint' : 'paint'];
  return painted && painted.groups ? painted.groups : null;
}

function paintOrder(pieces) {
  const by = (role) => pieces.filter((p) => p.role === role);
  const order = [...by('frame'), ...by('stack'), ...by('battery'), ...by('video')];
  const motors = by('motor');
  const props = by('prop');
  for (let slot = 0; slot < 4; slot++) {
    order.push(...motors.filter((p) => p.slot === slot), ...props.filter((p) => p.slot === slot));
  }
  for (const mount of ['top', 'bottom']) {
    order.push(...pieces.filter((p) => p.role === 'accessory' && p.mount === mount));
    order.push(...pieces.filter((p) => p.role === 'accessory_base' && p.mount === mount));
  }
  return order;
}

/** PaintPicker.defaults: original colour per slot from the tint groups of the assembled parts. */
export function paintDefaults(pieces, modelOf, render) {
  const out = {};
  for (const piece of paintOrder(pieces)) {
    const groups = groupsOf(piece, modelOf(piece.id), render);
    for (const [channel, base] of groups || []) {
      if (channel === 'prop') {
        for (const slot of PROP_SLOTS) if (!(slot in out)) out[slot] = base;
      } else {
        const slot = slotOf(channel);
        if (slot && !(slot in out)) out[slot] = base;
      }
    }
  }
  return out;
}

/** PaintPicker.available: the slots this build shows (all when no part has paint groups). */
export function paintAvailable(pieces, modelOf, render, allSlots) {
  const channels = new Set();
  for (const piece of pieces) {
    for (const [channel] of groupsOf(piece, modelOf(piece.id), render) || []) channels.add(channel);
  }
  if (!channels.size) return new Set(allSlots);
  return new Set(allSlots.filter((slot) => {
    const channel = PROP_SLOTS.includes(slot) ? 'prop' : Object.keys(CHANNEL_SLOT).find((c) => CHANNEL_SLOT[c] === slot);
    return channels.has(channel);
  }));
}
