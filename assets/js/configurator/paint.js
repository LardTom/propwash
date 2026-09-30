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
