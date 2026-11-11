// The simulator's airframe of a drone, creative drones included: a creative flight controller with editor values (the
// share code's layer "Creative values") flies like in the game, with the flight build of CreativeFlight#flight and its
// inertia override (configurator/creative.js) through AirframeSpec.of(build, catalog, creative). creativeFlight gives
// the inertia as [xx, yy, zz] (pitch, yaw, roll); AirframeSpec takes [roll, pitch, yaw] like CreativeFlight#inertia.

import { creativeFlight, CREATIVE_FC } from '../configurator/creative.js?v=293f859b';
import { AirframeSpec } from './model/AirframeSpec.js?v=cfbc2e85';

/** {creative, flight}: the creative values of a decoded content (or null) and AirframeSpec's third argument (or null). */
export function creativeOf(catalog, content) {
  const creative = content.creative || null;
  if (!creative || !content.build || content.build.stack !== CREATIVE_FC) return { creative: null, flight: null };
  const f = creativeFlight(content.build, creative, catalog);
  if (f.build === content.build && !f.inertia) return { creative, flight: null };
  const inertia = f.inertia ? [f.inertia[2], f.inertia[0], f.inertia[1]] : null;
  return { creative, flight: { build: f.build, catalog: f.catalog, inertia } };
}

/** The airframe of a decoded content ({build, creative?}), or null when the build cannot fly. */
export function simAirframe(catalog, content) {
  const { creative, flight } = creativeOf(catalog, content);
  const airframe = flight ? AirframeSpec.fromBuild(content.build, catalog, flight) : AirframeSpec.fromBuild(content.build, catalog);
  return { airframe, creative };
}
