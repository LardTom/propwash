// Camera drones of the add-on Propwash: Camera Drones in the configurator: what makes a build a camera drone, the
// check of the workbench button “Check camera drone” (port of CameraCheck) and the nav boards, gimbals and flight
// classes of assets/data/configurator/camera-drones.json (what the add-on keeps in its code).
//
// CameraCheck: four roles – Nav-FC (the stack must be a nav board, another stack is wrong: no GPS), gimbal (one of the
// add-on's gimbals on any mount), battery and camera link (the add-on's smart batteries and camera links fit best,
// another one is fine: “other part”). A camera frame names the part of its preset as the advice; without a camera
// frame there is no advice. The build is a complete camera drone when every role is fitted or other.

export const ROLES = Object.freeze(['nav_fc', 'gimbal', 'battery', 'link']);

const presetPart = (catalog, cls, field) => {
  const build = cls && catalog.presetBuild(cls.preset);
  if (!build) return null;
  return field === 'gimbal' ? build.accessories.front || null : build[field];
};

/** The flight class of a camera frame ({key, frame, preset, speeds_ms, …}), or null. */
export function classOf(frame, data) {
  return (data && (data.classes || []).find((c) => c.frame === frame)) || null;
}

/** The nav board entry of a stack ({gps, compass, barometer, sensors}), or null. */
export function navOf(stack, data) {
  return (data && data.nav_boards && data.nav_boards[stack]) || null;
}

/** The gimbal entry of an accessory ({axes, tilt, pan_360, lens_bay, focal_mm}), or null. */
export function gimbalOf(accessory, data) {
  return (data && data.gimbals && data.gimbals[accessory]) || null;
}

/** A camera drone flies with a nav board: it switches the flight assist on (CameraCheck, guide of the add-on). */
export function isCameraDrone(build, data) {
  return !!(build && navOf(build.stack, data));
}

/** The gimbal of a build (the first of its accessories that is one), or null. */
export function gimbalIn(build, data) {
  return Object.values((build && build.accessories) || {}).find((id) => gimbalOf(id, data)) || null;
}

/**
 * CameraCheck of a build: {camera (the build has a camera frame, nav board or gimbal), preset (of the camera frame, or
 * null), complete, lines: [{role, state ('fitted' | 'other' | 'missing' | 'wrong'), part, advice}]}.
 */
export function cameraCheck(build, catalog, data) {
  const cls = classOf(build.frame, data);
  const smart = new Set((data.classes || []).map((c) => presetPart(catalog, c, 'battery')).filter(Boolean));
  const links = new Set((data.classes || []).map((c) => presetPart(catalog, c, 'video')).filter(Boolean));
  const advice = (field) => presetPart(catalog, cls, field);
  const slot = (role, part, fits, others, field) => {
    if (!part) return { role, state: 'missing', part: null, advice: advice(field) };
    if (fits(part)) return { role, state: 'fitted', part, advice: null };
    return { role, state: others ? 'other' : 'wrong', part, advice: advice(field) };
  };
  const gimbal = gimbalIn(build, data);
  const lines = [
    slot('nav_fc', build.stack, (id) => !!navOf(id, data), false, 'stack'),
    gimbal ? { role: 'gimbal', state: 'fitted', part: gimbal, advice: null } : { role: 'gimbal', state: 'missing', part: null, advice: advice('gimbal') },
    slot('battery', build.battery, (id) => smart.has(id), true, 'battery'),
    slot('link', build.video, (id) => links.has(id), true, 'video'),
  ];
  return {
    camera: !!(cls || navOf(build.stack, data) || gimbal),
    preset: cls ? cls.preset : null,
    complete: lines.every((l) => l.state === 'fitted' || l.state === 'other'),
    lines,
  };
}

const WRONG_TEXT = Object.freeze({ nav_fc: 'wrongNav' });

/**
 * The rows under a line of the check, like CameraCheckScreen.rows: a wrong part says why (check.wrongNav), then the
 * advice names the part to fit (check.advice) or, next to an accepted other part, the recommended one
 * (check.recommended). [{key, part}] with key the text under camdrones.check.
 */
export function lineNotes(line) {
  const out = [];
  if (line.state === 'wrong' && line.part && WRONG_TEXT[line.role]) out.push({ key: WRONG_TEXT[line.role], part: line.part });
  if (line.advice) out.push({ key: line.state === 'other' ? 'recommended' : 'advice', part: line.advice });
  return out;
}

/** The hint “No camera frame fitted”, like the game only while the build is not yet a complete camera drone. */
export function noCameraFrameHint(result) {
  return !!result && !result.complete && !result.preset;
}
