# Propwash FPV – landing page and drone configurator

Static website for **Propwash FPV**, an FPV drone racing and freestyle mod for Minecraft 26.3
(Fabric and NeoForge), with an online drone configurator for the addon **Propwash: Just More Parts**.
This repository contains only the website, no mod source code.

## Structure

- `index.html` – the landing page (English and German, switchable)
- `configurator/index.html` – the drone configurator (English and German, same switch)
- `assets/css/style.css` – styles of both pages; `assets/css/configurator.css` – configurator only
- `assets/js/main.js` – language switch, section menu, hero feed with pause switch, image switchers, video demo, gallery lightbox
- `assets/js/configurator/` – the configurator as plain ES modules:
  - core: `data.js` (catalog), `sharecode.js` + `crc32.js` + `inflate.js` + `tune.js` (PW1 share codes),
    `rules.js` (compatibility), `analysis.js` (flight analysis with the energy balance of Propwash 0.4.2), `fpv.js` (FPV camera rig and props in view),
    `tuning.js` (tune defaults and editing), `index.js`
  - page: `ui.js` (part pickers, paint, tune editor, OSD layer, stats, share code, import), `i18n.js` (texts),
    `assembly.js` (where every part sits on the drone), `paint.js` (paint tints), `viewer.js` (three.js viewer)
- `assets/data/configurator/` – data from the Just More Parts web export: `catalog.json` (parts, presets, rules, paint,
  tune and share-code tables), `render.json` (frame layouts, motor seats, paint channels) and `models/` (one file per part:
  block-model geometry plus textures, loaded only for the parts on the drone)
- `assets/vendor/three/` – three.js r186 as a trimmed, minified bundle (MIT, `LICENSE`)
- `assets/vendor/pako/` – the deflate part of pako 2.1.0 (MIT, `LICENSE`), so share codes are byte-identical to the mod's
- `assets/img/` – real in-game screenshots as WebP (800 and 1600 px wide, plus cropped shots) and `og-image.jpg` for link previews
- `assets/fonts/` – Saira and JetBrains Mono, both under the SIL Open Font License 1.1
- `tools/` – build and test scripts for the configurator data (not needed at runtime)

No build step, no external requests, no cookies, no tracking. The chosen language and the hero's pause switch are
kept in the browser's `localStorage`; the drone built in the configurator lives only in the page address
(`configurator/#PW1-…`).

## Drone configurator

`configurator/` builds a drone from every Propwash and Just More Parts part:

- part pickers per category with search, a class filter (whoop, toothpick, cinewhoop, freestyle, race, long range,
  X-Class; video by link, accessories by mount), “only parts that fit”, fit badges and tips with pros, cons and what the
  part would change
- live flight figures like the workbench of Propwash 0.4.2 (weight, thrust-to-weight, hover throttle, top speed and its
  energy balance: flight times down to the landing voltage for mixed flying of the frame's class as the main value,
  aggressive/racing, hovering and cruising at the class's cruise speed, pack currents, landing voltage under load,
  base load of flight controller and video, motor temperature after 60 s full throttle and after a mixed flight) and
  the compatibility check (voltage, prop size vs. frame, battery fit, mounts, ESC and battery load)
- paint for every paint slot the build shows, like the paint screen in the game: the 16 dye colours, the 5 finishes
  (carbon, gunmetal, aluminium, gold, copper) and a custom colour; a swatch paints exactly its RGB value, as in the mod;
  “Randomize” paints all slots with a random but matching scheme (accent and partner colour, dark/light/metal base,
  props alike or front/rear for orientation)
- tune editor for rates (with a live rate-curve graph), PID, feedforward, TPA, filters and throttle curve (with graph),
  using the defaults the game derives from the build
- optional OSD layer (a Propwash OSD preset or the layout from an opened code)
- share code with copy button, share link and import field; opening a link or pasting a code loads the build and lists
  unknown parts
- 3D view with three.js: the parts' Minecraft block models, textures and paint tints placed like the mod's drone
  renderer (frame layouts, motor seats, camera tilt, accessory anchors); drag to turn, scroll or pinch to zoom,
  auto-rotate (off with reduced motion or paused animations), keyboard control on the canvas
- FPV camera preview (switch “3D / FPV camera” in the viewer, or open `configurator/?view=camera#PW1-…`): the image the
  drone's camera sends, drawn like the game's FPV view (Propwash 0.4.1): 16:9 rectilinear from the lens with the frame's
  uptilt and the goggles' field of view (analog 120°, digital 130°), the drone itself hidden except its props, spinning
  props as translucent blur discs in their paint colour, over a sky and grass backdrop; sliders for uptilt (0–80°, as
  the pilot can set it in the game) and goggle FOV (60–160°) with the live props-in-view share, and toggles to mark the
  counted disc area, show still blades or draw the frame too
- screenshot menu in the 3D view: “Drone as PNG” (the drone alone, transparent, cropped, up to 1600 px, from the current
  view angle, e.g. as the cover image of a forum post) and “Detail card” (1600 × 900 with name, class, key figures and
  share code); both are copied to the clipboard, or downloaded where the browser can’t copy images

### Updating the data

With a new web export of Just More Parts (default location: the newest `../propwash-justmoreparts/release/<version>/web-export`,
or pass `--export <dir>` / set `JMP_WEB_EXPORT`):

```sh
node tools/build-configurator-data.mjs     # catalog.json and the share-code test vectors
node tools/build-configurator-models.mjs   # render.json and models/
node tools/test-configurator.mjs           # share codes, presets, analysis, FPV camera and tune defaults against the export
node tools/test-configurator-render.mjs    # model files, paint tints, frame layouts, assembly and FPV prop hubs
```

`tools/fixtures/report-vectors.json` keeps share codes from bug reports with the build, analysis and FPV camera the
mod gives for them (hand-maintained, not overwritten by the build scripts); the test decodes, re-encodes and analyses
each one. The first is the 7″ deadcat whose props the game showed at the image edges while the old calculation said
0.0 %; its `game` entry holds what Propwash's self test counted in the rendered FPV image (2.01 % of 1708 × 960 pixels),
and the test fails if the configurator ever shows 0 % for it again. The same code carries the second report (flight
times and part stats a bit off, e.g. 24.2 min hovering and 124 °C at full throttle): `analysis` holds the figures of
Propwash 0.4.2 and Just More Parts 1.0.4 (19.5 min hovering, 11.8 min cruising, 8.0 min mixed, 5.7 min aggressive,
95 °C after 60 s full throttle), `analysis_before` the old ones; the test checks that weight, thrust-to-weight, hover
throttle, top speed and props in view stay unchanged (the flight physics is bit-identical) and that the energy figures
changed.

Render definitions may carry a vanilla `transformation` (Just More Parts 1.0.1 shrinks the X-Class frame models to fit
Minecraft's model limit and scales them back to real size this way); `build-configurator-models.mjs` bakes it into the
element coordinates, and the render test checks that every frame model reaches its motor positions.

### Rebuilding the three.js bundle

`assets/vendor/three/three.min.js` contains only what the viewer imports (`tools/three-entry.js`). With `three` and
`esbuild` installed in a scratch folder:

```sh
NODE_PATH=<scratch>/node_modules <scratch>/node_modules/.bin/esbuild tools/three-entry.js --bundle --format=esm \
  --minify --target=es2020 --legal-comments=none \
  "--banner:js=/* three.js r186 (MIT), trimmed bundle, see LICENSE */" --outfile=assets/vendor/three/three.min.js
```

## Preview

Serve the folder locally (the configurator loads its data with `fetch`, which does not work from `file://`):

```sh
python3 -m http.server 8000
```

## Publish on GitHub Pages

1. Push this folder to the repository `LardTom/propwash`.
2. Settings → Pages → Build and deployment → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. `.nojekyll` is included, so the files are served exactly as they are.

All paths are relative, so the pages work from the custom domain `https://propwashfpv.com/` (fallback `https://lardtom.github.io/propwash/`), the configurator
from `https://propwashfpv.com/configurator/`.

## Link previews

`og:image` and `twitter:image` need an absolute URL. They point to
`https://propwashfpv.com/assets/img/og-image.jpg`. With a different repository name (or a custom domain),
change the URLs in the `<head>` of `index.html` and `configurator/index.html`.

---

Propwash FPV by lardtom. Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
