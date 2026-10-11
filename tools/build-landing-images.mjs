#!/usr/bin/env node
// Converts the in-game screenshots of the landing page from the Propwash repository to WebP.
//
//   node tools/build-landing-images.mjs [--propwash <dir>] [--only <name>[,<name>…]] [--check]
//
// Source: <dir>/docs/screenshots/*.png (1920 × 1080, written by the mod's self test on the release commit).
// Target: assets/img/<name>-<width>.webp, one file per width. Needs ImageMagick (magick) and cwebp.
//
// An entry is [name, source, widths] for a whole screenshot or [name, source, widths, crop] with
// crop = [x, y, width, height] in source pixels. The largest width of a cropped image is the crop width,
// so those stay pixel-exact. --check only reports names whose source screenshot is missing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'img');
const FULL = [800, 1600];
const DRONE = [397, 310, 1120, 630];

export const IMAGES = [
  ['osd-flight', 'osd_flight', FULL],
  ['trick-popup-fpv', 'trick_popup_fpv', FULL],
  ['action-cam-rec-osd', 'action_cam_rec_osd', FULL],
  ['pilot-from-drone', 'pilot_from_drone', FULL],
  ['pilot-third-person', 'pilot_third_person', FULL],
  ['race-gates', 'race_gates', FULL],
  ['race-start-lights', 'race_start_lights', FULL],
  ['race-start-go', 'race_start_go', FULL],
  ['race-line-third-person', 'race_line_third_person', FULL],
  ['race-ghost', 'race_ghost', FULL],
  ['gate-start-finish', 'gate_start_finish', FULL],
  ['gate-markings', 'gate_markings', FULL],
  ['spectate-view', 'spectate_view', FULL],
  ['items-remote-battery-charger', 'items_remote_battery_charger', FULL],
  ['remote-first-person', 'remote_first_person', FULL],
  ['video-analog-stage2', 'video_analog_stage2', FULL],
  ['video-analog-stage3', 'video_analog_stage3', FULL],
  ['video-analog-stage4', 'video_analog_stage4', FULL],
  ['video-analog-stage5', 'video_analog_stage5', FULL],
  ['video-digital-breakup', 'video_digital_breakup', FULL],
  ['workbench-freestyle', 'workbench_freestyle', FULL],
  ['configurator-rates', 'configurator_rates', FULL],
  ['configurator-pid', 'configurator_pid', FULL],
  ['configurator-osd', 'configurator_osd', FULL],
  ['configurator-tricks', 'configurator_tricks', FULL],
  ['flight-school-build', 'flight_school_build', FULL],
  ['flight-school-sticks', 'flight_school_sticks', FULL],
  ['headlight-cave', 'headlight_cave', FULL],
  ['headlight-cave-off', 'headlight_cave_off', [1600]],
  ['training-gates-fpv', 'training_gates_fpv', FULL],
  ['training-course-los', 'training_course_los', FULL],
  ['training-screen', 'training_screen', FULL],
  ['trick-chain-fpv', 'trick_chain_fpv', FULL],
  ['mode3d-inverted-fpv', 'mode3d_inverted_fpv', FULL],
  ['course-elements', 'course_elements', FULL],
  ['bando-coast-platform', 'bando_coast_platform_aerial', FULL],
  ['bando-field-barn', 'bando_field_barn_aerial', FULL],

  ['drone-closeup', 'drone_closeup', [800, 1120], DRONE],
  ['drone-closeup-action-cam-heavy', 'drone_closeup_action_cam_heavy', [800, 1120], DRONE],
  ['drone-closeup-paint-neon', 'drone_closeup_paint_neon', [800, 1120], DRONE],
  ['drone-closeup-paint-race-team', 'drone_closeup_paint_race_team', [800, 1120], DRONE],
  ['headlight-cave-crop', 'headlight_cave', [640, 960], [480, 270, 960, 540]],
  ['headlight-cave-off-crop', 'headlight_cave_off', [640, 960], [480, 270, 960, 540]],
  ['dust-closeup', 'dust_takeoff_max', [640, 768], [579, 384, 768, 432]],
  ['flight-school-race', 'flight_school_race', [640, 1280], [440, 160, 1280, 720]],

  ['workbench-freestyle-ui', 'workbench_freestyle', [640, 944], [488, 201, 944, 680]],
  ['charger-gui-ui', 'charger_gui', [538], [692, 222, 538, 634]],
  ['drone-condition-ui', 'drone_condition', [640, 1060], [764, 222, 1060, 858]],
  ['drone-service-menu-ui', 'drone_service_menu', [640, 720], [600, 166, 720, 748]],
  ['action-cam-recordings-ui', 'action_cam_recordings', [640, 1280], [204, 20, 1512, 486]],
  ['paint-screen-ui', 'paint_screen', [640, 1334], [294, 136, 1334, 808]],
  ['recipe-book-ui', 'recipe_book', [640, 1084], [379, 283, 1084, 511]],
  ['leaderboard-screen-ui', 'leaderboard_screen', [640, 1392], [263, 69, 1392, 933]],
];

// The link preview (og:image): the screenshot scaled to this width, cut to this height around its middle.
const OG_IMAGE = ['osd_flight', 1200, 630];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

function findPropwash() {
  const candidates = [arg('--propwash'), process.env.PROPWASH_SRC, path.join(ROOT, '..', 'propwash'), path.join(ROOT, '..', '..', '..', '..', 'propwash')];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'docs', 'screenshots'))) return path.resolve(c);
  }
  throw new Error('Propwash repository not found: pass --propwash <dir> or set PROPWASH_SRC');
}

function build() {
  const shots = path.join(findPropwash(), 'docs', 'screenshots');
  const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
  const missing = IMAGES.filter(([, src]) => !fs.existsSync(path.join(shots, `${src}.png`)));
  if (missing.length) throw new Error(`missing screenshots: ${missing.map(([, src]) => src).join(', ')}`);
  if (process.argv.includes('--check')) {
    console.log(`${IMAGES.length} images, every source screenshot is there`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-img-'));
  let files = 0;
  for (const [name, src, widths, crop] of IMAGES) {
    if (only && !only.has(name)) continue;
    let input = path.join(shots, `${src}.png`);
    let w = 1920;
    let h = 1080;
    if (crop) {
      const [x, y, cw, ch] = crop;
      const cut = path.join(tmp, `${name}.png`);
      execFileSync('magick', [input, '-crop', `${cw}x${ch}+${x}+${y}`, '+repage', cut]);
      input = cut;
      w = cw;
      h = ch;
    }
    for (const width of widths) {
      if (width > w) throw new Error(`${name}: width ${width} is larger than its source (${w})`);
      const height = Math.round((h * width) / w);
      const target = path.join(OUT, `${name}-${width}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-metadata', 'none', '-resize', String(width), String(height), input, '-o', target]);
      files++;
    }
  }
  if (!only || only.has('og-image')) {
    const [src, w, h] = OG_IMAGE;
    execFileSync('magick', [path.join(shots, `${src}.png`), '-resize', `${w}x`, '-gravity', 'center', '-crop', `${w}x${h}+0+0`, '+repage',
      '-strip', '-interlace', 'Plane', '-quality', '86', path.join(OUT, 'og-image.jpg')]);
    files++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${files} files written to assets/img/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    build();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
