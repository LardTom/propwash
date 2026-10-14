// Parts format (JSON): field tables per category. The field names are checked against the keys the mod's reader
// (parts/PartJson.java) actually reads; enum values, mounts, built-in parts and the example files come from the mod.

import { L, P, esc, list, note, section, table, code, h3, mono } from '../html.mjs';

const NUM = { en: 'number', de: 'Zahl' };
const INT = { en: 'integer', de: 'ganze Zahl' };
const BOOL = { en: 'boolean', de: 'bool' };
const TEXT = { en: 'text', de: 'Text' };
const ID = { en: 'id', de: 'Id' };
const OBJ = { en: 'object', de: 'Objekt' };
const VEC3 = { en: '<code>[x, y, z]</code> mm', de: '<code>[x, y, z]</code> mm' };
const RANGE = { en: '<code>[min, max]</code>', de: '<code>[min, max]</code>' };
const INTS = { en: 'list of integers', de: 'Liste ganzer Zahlen' };
const t = (en, de = en) => ({ en, de });

function f(path, type, req, def, desc) {
  return { path, type, req, def, desc };
}

const REQ = true;
const OPT = false;

export const FIELDS = {
  common: [
    f('format', INT, OPT, t('1'), t('File format. Optional; a higher number than this Propwash knows stops loading with “update Propwash”.', 'Dateiformat. Optional; eine höhere Nummer, als dieses Propwash kennt, bricht das Laden mit „Propwash aktualisieren“ ab.')),
    f('mass_g', NUM, REQ, null, t('Mass in grams, above 0 and at most 20000.', 'Masse in Gramm, über 0 und höchstens 20000.')),
    f('stack_size', INT, OPT, t('0 = by category (props 64, others 16)', '0 = je Kategorie (Props 64, sonst 16)'), t('Item stack size, 1–99.', 'Stapelgröße des Items, 1–99.')),
    f('sort', INT, OPT, t('1000'), t('Order in lists and the creative tab.', 'Reihenfolge in Listen und im Kreativ-Tab.')),
    f('creative', BOOL, OPT, t('true'), t('Listed in the add-on’s creative tab.', 'Im Kreativ-Tab des Add-ons gelistet.')),
    f('durability', NUM, OPT, t('1.0 (props: material)', '1,0 (Props: Material)'), t('Divides the wear a crash causes; 2.0 wears half as fast.', 'Teilt die Abnutzung durch einen Absturz; 2,0 nutzt halb so schnell ab.')),
    f('recycle', t('<code>"none"</code> or object', '<code>"none"</code> oder Objekt'), OPT, t('by category', 'je Kategorie'), t('What the salvage slot gives for a broken part.', 'Was das Zerlegen-Feld für ein kaputtes Teil gibt.')),
    f('recycle.item', ID, REQ, null, t('Item id, for example <code>propwash:copper_coil</code>.', 'Item-Id, zum Beispiel <code>propwash:copper_coil</code>.')),
    f('recycle.count', INT, OPT, t('1'), t('How many.', 'Wie viele.')),
    f('rarity', TEXT, OPT, t('–'), t('Colour of the item name: <code>common</code>, <code>uncommon</code>, <code>rare</code>, <code>epic</code>.', 'Farbe des Item-Namens: <code>common</code>, <code>uncommon</code>, <code>rare</code>, <code>epic</code>.')),
    f('visual', OBJ, OPT, t('–'), t('Look of the part.', 'Aussehen des Teils.')),
    f('visual.accent', t('<code>"#rrggbb"</code>'), OPT, t('–'), t('Accent colour (battery wrap, procedural shape).', 'Akzentfarbe (Akkuhülle, prozedurale Form).')),
    f('visual.render_model', ID, OPT, t('–'), t('Use another drone model, for example a built-in one.', 'Ein anderes Drohnen-Modell benutzen, zum Beispiel ein eingebautes.')),
  ],
  frame: [
    f('role', TEXT, OPT, t('<code>freestyle</code>'), t('Frame class: {role}.', 'Rahmenklasse: {role}.')),
    f('shape', TEXT, OPT, t('<code>true_x</code>'), t('Shape: {shape}.', 'Form: {shape}.')),
    f('wheelbase_mm', INT, REQ, null, t('Diagonal motor-to-motor distance, 20–2000.', 'Diagonaler Abstand Motor zu Motor, 20–2000.')),
    f('max_prop_mm', INT, 'one', null, t('Largest prop diameter, at most 400. Either this or <code>props_mm</code>.', 'Größter Prop-Durchmesser, höchstens 400. Entweder das oder <code>props_mm</code>.')),
    f('props_mm', RANGE, 'one', null, t('Smallest and largest prop diameter, instead of <code>max_prop_mm</code>.', 'Kleinster und größter Prop-Durchmesser, statt <code>max_prop_mm</code>.')),
    f('motor_mounts', t('list of ids', 'Liste von Ids'), REQ, null, t('Motor mounts the frame takes (one id is also fine).', 'Motor-Halterungen, die der Rahmen nimmt (eine einzelne Id geht auch).')),
    f('stack_mounts', t('list of ids', 'Liste von Ids'), REQ, null, t('Stack mounts the frame takes.', 'Stack-Halterungen, die der Rahmen nimmt.')),
    f('accessory_mounts', t('list', 'Liste'), OPT, t('empty', 'leer'), t('Accessory mounts: {slot}.', 'Zubehör-Halterungen: {slot}.')),
    f('arms', OBJ, OPT, t('true X from the wheelbase', 'True-X aus dem Radstand'), t('Own arm geometry with the keys {arms}.', 'Eigene Arm-Geometrie mit den Schlüsseln {arms}.')),
    f('arms.<arm>.pos', VEC3, REQ, null, t('Motor position.', 'Motorposition.')),
    f('arms.<arm>.spin', TEXT, OPT, t('props in', 'Props nach innen'), t('Spin direction: {spin}.', 'Drehrichtung: {spin}.')),
    f('battery', OBJ, OPT, t('–'), t('Where the battery sits.', 'Wo der Akku sitzt.')),
    f('battery.on_top', BOOL, OPT, t('wheelbase ≥ 100', 'Radstand ≥ 100'), t('Battery on top of the frame.', 'Akku oben auf dem Rahmen.')),
    f('battery.plate_mm', NUM, OPT, t('on top 0.13 × wheelbase, below −0.05 × wheelbase', 'oben 0,13 × Radstand, unten −0,05 × Radstand'), t('Height of the battery plate.', 'Höhe der Akku-Auflage.')),
    f('electronics_mm', NUM, OPT, t('0.05 × wheelbase', '0,05 × Radstand'), t('Height of the electronics.', 'Höhe der Elektronik.')),
    f('camera', OBJ, OPT, t('–'), t('FPV camera. Every frame should set the position.', 'FPV-Kamera. Jeder Rahmen sollte die Position setzen.')),
    f('camera.pos', VEC3, OPT, t('15 mm above the centre of mass', '15 mm über dem Schwerpunkt'), t('Lens position; decides how much of the props shows in the FPV picture.', 'Objektivlage; bestimmt, wie viel von den Props im FPV-Bild zu sehen ist.')),
    f('camera.tilt_deg', NUM, OPT, t('20'), t('Default camera angle, 0–80°.', 'Standard-Kamerawinkel, 0–80°.')),
    f('center_of_mass_mm', VEC3, OPT, t('<code>[0, 0, 0]</code>'), t('Centre of mass of the frame.', 'Schwerpunkt des Rahmens.')),
    f('mass_split', OBJ, OPT, t('open 0.6 / 0.4 / 0, ducted 0.2 / 0.3 / 0.5', 'offen 0,6 / 0,4 / 0, geduckt 0,2 / 0,3 / 0,5'), t('How the mass divides; the parts add up to 1.', 'Wie sich die Masse verteilt; die Anteile ergeben zusammen 1.')),
    f('mass_split.arms', NUM, REQ, null, t('Share of the arms.', 'Anteil der Arme.')),
    f('mass_split.plate', NUM, REQ, null, t('Share of the plate.', 'Anteil der Platte.')),
    f('mass_split.duct', NUM, OPT, t('0'), t('Share of the duct.', 'Anteil des Ducts.')),
    f('accessory_anchors', OBJ, OPT, t('formula from the frame', 'Formel aus dem Rahmen'), t('Where accessories sit, per mount ({slot}).', 'Wo Zubehör sitzt, je Halterung ({slot}).')),
    f('accessory_anchors.<slot>.pos', VEC3, REQ, null, t('Position.', 'Position.')),
    f('accessory_anchors.<slot>.tilt_deg', NUM, OPT, t('0'), t('Tilt.', 'Neigung.')),
    f('accessory_anchors.<slot>.length_mm', NUM, OPT, t('0'), t('Length of the mount.', 'Länge der Halterung.')),
    f('aero', OBJ, REQ, null, t('Aerodynamics.', 'Aerodynamik.')),
    f('aero.frontal_area_m2', NUM, REQ, null, t('Frontal area in m².', 'Stirnfläche in m².')),
    f('aero.drag_coefficient', NUM, REQ, null, t('Drag coefficient.', 'Widerstandsbeiwert.')),
    f('aero.side_area_m2', NUM, OPT, t('from the frontal area', 'aus der Stirnfläche'), t('Side area.', 'Seitenfläche.')),
    f('aero.top_area_m2', NUM, OPT, t('from the frontal area', 'aus der Stirnfläche'), t('Top area.', 'Draufsichtfläche.')),
    f('duct', t('<code>true</code> or object', '<code>true</code> oder Objekt'), OPT, t('open props', 'offene Props'), t('Ducted frame. <code>true</code> or <code>{}</code> uses the standard duct; single values below override it.', 'Geduckter Rahmen. <code>true</code> oder <code>{}</code> nimmt den Standard-Duct; einzelne Werte darunter überschreiben ihn.')),
    f('duct.thrust_gain', NUM, OPT, t('standard', 'Standard'), t('Extra static thrust of the duct.', 'Zusätzlicher Standschub des Ducts.')),
    f('duct.clearance_mm', NUM, OPT, t('standard', 'Standard'), t('Gap between blade tip and duct.', 'Spalt zwischen Blattspitze und Duct.')),
    f('duct.translational_lift_gain', NUM, OPT, t('standard', 'Standard'), t('Lift gain in forward flight.', 'Auftriebsgewinn im Vorwärtsflug.')),
    f('duct.wash_loss', NUM, OPT, t('standard', 'Standard'), t('Thrust lost in the own downwash.', 'Schubverlust im eigenen Abwind.')),
    f('duct.wash_noise', NUM, OPT, t('standard', 'Standard'), t('Shaking in the own downwash.', 'Rütteln im eigenen Abwind.')),
    f('duct.restitution', NUM, OPT, t('standard', 'Standard'), t('Bounce on impact.', 'Abprallen beim Aufprall.')),
    f('duct.friction', NUM, OPT, t('standard', 'Standard'), t('Friction when touching blocks.', 'Reibung an Blöcken.')),
    f('impact_tolerance', NUM, OPT, t('8.0', '8,0'), t('Impact speed in m/s that counts as a crash, above 0 and at most 100.', 'Aufprallgeschwindigkeit in m/s, ab der ein Absturz zählt, über 0 und höchstens 100.')),
    f('battery_fit', OBJ, REQ, null, t('Which batteries fit.', 'Welche Akkus passen.')),
    f('battery_fit.cells', RANGE, REQ, null, t('Cell range (a single number means exactly that many).', 'Zellbereich (eine einzelne Zahl heißt genau so viele).')),
    f('battery_fit.max_mass_g', NUM, REQ, null, t('Heaviest battery.', 'Schwerster Akku.')),
    f('battery_fit.preferred_min_cells', INT, OPT, t('smallest cell count', 'kleinste Zellzahl'), t('Cells of the preferred battery (shown in the workbench).', 'Zellen des bevorzugten Akkus (Anzeige in der Werkbank).')),
    f('battery_fit.preferred_min_capacity_mah', INT, OPT, t('0'), t('Capacity of the preferred battery.', 'Kapazität des bevorzugten Akkus.')),
  ],
  stack: [
    f('mount', ID, REQ, null, t('Stack mount, for example {stackMounts}.', 'Stack-Halterung, zum Beispiel {stackMounts}.')),
    f('esc_continuous_a', NUM, REQ, null, t('Continuous ESC current in A, at most 500.', 'Dauerstrom des ESC in A, höchstens 500.')),
    f('cells', RANGE, REQ, null, t('Cell range, 1–16.', 'Zellbereich, 1–16.')),
    f('all_in_one', BOOL, OPT, t('false'), t('Flight controller and ESC on one board.', 'Flight-Controller und ESC auf einer Platine.')),
    f('esc_burst_a', NUM, OPT, t('derived', 'abgeleitet'), t('Burst current, at least the continuous current.', 'Spitzenstrom, mindestens der Dauerstrom.')),
    f('esc_resistance_ohm', NUM, OPT, t('derived', 'abgeleitet'), t('ESC resistance.', 'Widerstand des ESC.')),
    f('brownout_v', NUM, OPT, t('derived', 'abgeleitet'), t('Voltage at which the flight controller resets.', 'Spannung, bei der der Flight-Controller neu startet.')),
    f('board_size_mm', NUM, OPT, t('derived', 'abgeleitet'), t('Board size, 10–120.', 'Platinengröße, 10–120.')),
  ],
  motor: [
    f('stator', TEXT, REQ, null, t('Stator label such as <code>"2207"</code> or <code>"2306.5"</code>.', 'Stator-Bezeichnung wie <code>"2207"</code> oder <code>"2306.5"</code>.')),
    f('stator_mm', t('<code>[d, h]</code>'), OPT, t('from <code>stator</code>', 'aus <code>stator</code>'), t('Stator diameter and height when the label does not say it (first two digits diameter, rest height).', 'Statordurchmesser und -höhe, wenn die Bezeichnung es nicht sagt (erste zwei Ziffern Durchmesser, Rest Höhe).')),
    f('kv', INT, REQ, null, t('KV, 50–100000.', 'KV, 50–100000.')),
    f('mount', ID, REQ, null, t('Motor mount, for example {motorMounts}.', 'Motor-Halterung, zum Beispiel {motorMounts}.')),
    f('max_current_a', NUM, REQ, null, t('Maximum current in A, at most 500.', 'Höchststrom in A, höchstens 500.')),
    f('resistance_ohm', NUM, REQ, null, t('Winding resistance, below 10.', 'Wicklungswiderstand, unter 10.')),
    f('cells', RANGE, REQ, null, t('Cell range, 1–16.', 'Zellbereich, 1–16.')),
    f('prop_mount', ID, OPT, t('<code>propwash:universal</code>'), t('Prop mount; <code>universal</code> fits every prop.', 'Prop-Aufnahme; <code>universal</code> passt zu jedem Prop.')),
    f('thermal', OBJ, OPT, t('defaults below', 'Standards darunter'), t('Heat model.', 'Hitzemodell.')),
    f('thermal.heat_capacity_j_per_k', NUM, OPT, t('from the mass', 'aus der Masse'), t('Heat capacity in J/K.', 'Wärmekapazität in J/K.')),
    f('thermal.cooling_w_per_k', NUM, OPT, t('from the mass', 'aus der Masse'), t('Cooling at standstill in W/K.', 'Kühlung im Stand in W/K.')),
    f('thermal.cooling_w_per_k_per_rad_s', NUM, OPT, t('from the mass', 'aus der Masse'), t('Extra cooling per rad/s of rotation.', 'Zusätzliche Kühlung je rad/s Drehzahl.')),
    f('thermal.derate_start_c', NUM, OPT, t('130'), t('Throttling starts at this temperature in °C (from 40).', 'Ab dieser Temperatur in °C wird gedrosselt (ab 40).')),
    f('thermal.max_temp_c', NUM, OPT, t('150'), t('Maximum temperature in °C (at most 300).', 'Höchsttemperatur in °C (höchstens 300).')),
    f('thermal.wear_per_s_at_max', NUM, OPT, t('0.002', '0,002'), t('Wear per second at the maximum temperature, 0–1.', 'Verschleiß je Sekunde bei Höchsttemperatur, 0–1.')),
  ],
  prop: [
    f('diameter_mm', INT, REQ, null, t('Diameter, 10–400.', 'Durchmesser, 10–400.')),
    f('pitch_in', NUM, REQ, null, t('Pitch in inches, above 0 and at most 12.', 'Steigung in Zoll, über 0 und höchstens 12.')),
    f('blades', INT, REQ, null, t('Number of blades, 2–8.', 'Blattzahl, 2–8.')),
    f('ct', NUM, REQ, null, t('Thrust coefficient, between 0 and 1.', 'Schubbeiwert, zwischen 0 und 1.')),
    f('cp', NUM, REQ, null, t('Power coefficient, between 0 and 1.', 'Leistungsbeiwert, zwischen 0 und 1.')),
    f('material', TEXT, OPT, t('<code>polycarbonate</code>'), t('Material: {material}. Sets the default stiffness and durability.', 'Material: {material}. Bestimmt Standard-Steifigkeit und -Haltbarkeit.')),
    f('stiffness', NUM, OPT, t('by material', 'je Material'), t('Stiffness, above 0 and at most 10; stiffer props shake less in the downwash.', 'Steifigkeit, über 0 und höchstens 10; steifere Props rütteln weniger im Abwind.')),
    f('mount', ID, OPT, t('<code>propwash:universal</code>'), t('Prop mount.', 'Prop-Aufnahme.')),
    f('reverse_thrust', NUM, OPT, t('0.55 (normal prop)', '0,55 (normaler Prop)'), t('Thrust when the motor spins backwards in 3D mode, as a share of the forward thrust at the same speed, 0.2 to 1.0. Normal cambered props manage about half; symmetric 3D props give about 1.0.', 'Schub, wenn der Motor im 3D-Modus rückwärts dreht, als Anteil des Vorwärtsschubs bei gleicher Drehzahl, 0,2 bis 1,0. Normale, gewölbte Props schaffen etwa die Hälfte; symmetrische 3D-Props geben etwa 1,0 an.')),
  ],
  video: [
    f('link', TEXT, REQ, null, t('Video system: {link}.', 'Videosystem: {link}.')),
    f('latency_ms', INT, REQ, null, t('Latency in ms, 1–500.', 'Latenz in ms, 1–500.')),
    f('range_blocks', INT, REQ, null, t('Range in blocks, 16–20000.', 'Reichweite in Blöcken, 16–20000.')),
    f('image_quality', NUM, REQ, null, t('Image quality, above 0 and at most 1.', 'Bildqualität, über 0 und höchstens 1.')),
    f('camera_width_mm', NUM, OPT, t('19'), t('Camera width, 8–40.', 'Kamerabreite, 8–40.')),
    f('camera_fov_deg', NUM, OPT, t('analog 120, digital 130'), t('Horizontal field of view of the camera, 60–180; it is the FPV field of view in the game.', 'Horizontales Sichtfeld der Kamera, 60–180; es ist das FPV-Sichtfeld im Spiel.')),
    f('vtx_power_mw', INT, OPT, t('0 (= 200 mW)'), t('Rated transmitter power in mW, 0–10000: the level a drone transmits at until the pilot picks another one; range and power draw are given for it (since API 1.6, before information only).', 'Nennleistung des Senders in mW, 0–10000: die Stufe, mit der eine Drohne sendet, bis der Pilot eine andere wählt; Reichweite und Leistungsaufnahme gelten für sie (seit API 1.6, vorher nur Information).')),
    f('vtx_levels_mw', INTS, OPT, t('derived from vtx_power_mw', 'aus vtx_power_mw abgeleitet'), t('Selectable power levels in mW, ascending, 1–10000, at most 8, must contain vtx_power_mw, e.g. <code>[25, 200, 400, 800]</code>. Without the list Propwash derives levels up to the rated power (API 1.6).', 'Wählbare Leistungsstufen in mW, aufsteigend, 1–10000, höchstens 8, muss vtx_power_mw enthalten, z. B. <code>[25, 200, 400, 800]</code>. Ohne Liste leitet Propwash Stufen bis zur Nennleistung ab (API 1.6).')),
    f('power_w', NUM, OPT, t('from system, mass and power', 'aus System, Masse und Leistung'), t('Power draw of the video system in W for the energy balance, 0.1–60.', 'Leistungsaufnahme des Videosystems in W für die Energiebilanz, 0,1–60.')),
  ],
  battery: [
    f('cells', INT, REQ, null, t('Cells in series, 1–12.', 'Zellen in Reihe, 1–12.')),
    f('capacity_mah', INT, REQ, null, t('Capacity in mAh, 50–50000.', 'Kapazität in mAh, 50–50000.')),
    f('cell_resistance_ohm', NUM, REQ, null, t('Internal resistance per cell, below 1.', 'Innenwiderstand je Zelle, unter 1.')),
    f('c_rating', INT, REQ, null, t('C rating, 1–300.', 'C-Rate, 1–300.')),
    f('chemistry', ID, OPT, t('<code>propwash:lipo</code>'), t('Cell chemistry: {chemistries} or an own one.', 'Zellchemie: {chemistries} oder eine eigene.')),
    f('pack_mm', t('<code>[l, w, h]</code>', '<code>[l, b, h]</code>'), OPT, t('from mass and density', 'aus Masse und Dichte'), t('Pack size.', 'Maße des Akkus.')),
    f('connector', TEXT, OPT, t('empty', 'leer'), t('Connector name, up to 16 characters.', 'Steckername, bis 16 Zeichen.')),
  ],
  accessory: [
    f('slot', TEXT, REQ, null, t('Mount: {slot}.', 'Halterung: {slot}.')),
    f('size_mm', t('<code>[w, h, d]</code>', '<code>[b, h, t]</code>'), REQ, null, t('Size, each above 0 and at most 500.', 'Maße, je über 0 und höchstens 500.')),
    f('flight_battery_w', NUM, OPT, t('0'), t('Power taken from the flight battery in W, at most 200.', 'Leistung aus dem Flugakku in W, höchstens 200.')),
    f('frontal_area_m2', NUM, OPT, t('0'), t('Extra frontal area, at most 0.5.', 'Zusätzliche Stirnfläche, höchstens 0,5.')),
    f('leds', INT, OPT, t('0'), t('Number of LEDs, 0–64.', 'Anzahl LEDs, 0–64.')),
    f('lens', OBJ, OPT, t('–'), t('Lens of a camera accessory.', 'Objektiv eines Kamera-Zubehörs.')),
    f('lens.x_mm', NUM, OPT, t('0'), t('Side offset of the lens.', 'Seitlicher Versatz des Objektivs.')),
    f('lens.length_mm', NUM, OPT, t('0'), t('Lens length, 0–100.', 'Objektivlänge, 0–100.')),
    f('action_cam', OBJ, OPT, t('–'), t('Makes the accessory an action cam (top mount only).', 'Macht das Zubehör zur Action-Cam (nur obere Halterung).')),
    f('action_cam.max_height', INT, REQ, null, t('Highest recording height in pixels (1080, 1440 …).', 'Höchste Aufnahmehöhe in Pixeln (1080, 1440 …).')),
    f('action_cam.max_fps', INT, REQ, null, t('Highest frame rate.', 'Höchste Bildrate.')),
    f('action_cam.stabilization', BOOL, OPT, t('false'), t('Image stabilisation.', 'Bildstabilisierung.')),
    f('action_cam.horizon_levelling', BOOL, OPT, t('false'), t('Keeps the horizon level.', 'Hält den Horizont gerade.')),
    f('action_cam.own_battery_wh', NUM, OPT, t('0'), t('Own battery in Wh; 0 = runs from the flight battery.', 'Eigener Akku in Wh; 0 = läuft am Flugakku.')),
    f('action_cam.record_w', NUM, REQ, null, t('Power while recording in W.', 'Leistung beim Aufnehmen in W.')),
    f('action_cam.max_record_w', NUM, OPT, t('<code>record_w</code>'), t('Power at the highest setting.', 'Leistung bei der höchsten Einstellung.')),
    f('action_cam.fov_deg', NUM, REQ, null, t('Field of view.', 'Sichtfeld.')),
    f('action_cam.image_quality', NUM, REQ, null, t('Image quality.', 'Bildqualität.')),
    f('action_cam.low_light_noise', NUM, REQ, null, t('Noise in the dark.', 'Rauschen im Dunkeln.')),
    f('action_cam.sensor_in', t('number or <code>"1/2.8"</code>', 'Zahl oder <code>"1/2.8"</code>'), REQ, null, t('Sensor size in inches.', 'Sensorgröße in Zoll.')),
  ],
  chemistry: [
    f('full_v', NUM, REQ, null, t('Cell voltage when full.', 'Zellspannung voll geladen.')),
    f('nominal_v', NUM, REQ, null, t('Nominal cell voltage.', 'Nennspannung der Zelle.')),
    f('empty_v', NUM, REQ, null, t('Cell voltage when empty.', 'Zellspannung leer.')),
    f('cutoff_v', NUM, REQ, null, t('Cut-off voltage, at most the empty voltage.', 'Abschaltspannung, höchstens die Leerspannung.')),
    f('storage_v', NUM, REQ, null, t('Storage voltage, between empty and full.', 'Lagerspannung, zwischen leer und voll.')),
    f('density_g_cm3', NUM, REQ, null, t('Density in g/cm³ (for the pack size).', 'Dichte in g/cm³ (für die Akkumaße).')),
    f('ocv_shape', t('12 numbers', '12 Zahlen'), REQ, null, t('Open-circuit voltage curve: 12 values from 0 to 1, rising, at charge 0, 0.05, 0.1, 0.2 … 1.0.', 'Leerlaufspannungskurve: 12 Werte von 0 bis 1, steigend, bei Ladung 0, 0,05, 0,1, 0,2 … 1,0.')),
    f('usable_fraction', NUM, OPT, t('0.88 / 0.85 / 0.80 by voltages', '0,88 / 0,85 / 0,80 nach Spannungen'), t('Usable share of the capacity down to the landing voltage, 0.5–1.', 'Nutzbarer Anteil der Kapazität bis zur Landespannung, 0,5–1.')),
  ],
};

export const CATEGORY = {
  common: { en: 'Fields of every part', de: 'Felder jedes Teils' },
  frame: { en: 'Frame', de: 'Rahmen' },
  stack: { en: 'Stack (flight controller and ESC)', de: 'Stack (Flight-Controller und ESC)' },
  motor: { en: 'Motor', de: 'Motor' },
  prop: { en: 'Propeller', de: 'Propeller' },
  video: { en: 'Video unit', de: 'Videomodul' },
  battery: { en: 'Battery', de: 'Akku' },
  accessory: { en: 'Accessory', de: 'Zubehör' },
  chemistry: { en: 'Cell chemistry', de: 'Zellchemie' },
};

function codes(values) {
  return values.map((v) => `<code>${esc(v)}</code>`).join(', ');
}

function fill(text, parts) {
  return text
    .replace('{role}', codes(parts.enums.role))
    .replace('{shape}', codes(parts.enums.shape))
    .replace('{slot}', codes(parts.enums.slot))
    .replace('{spin}', codes(parts.enums.spin))
    .replace('{arms}', codes(parts.armKeys))
    .replace('{material}', codes(parts.enums.material))
    .replace('{link}', codes(parts.enums.link))
    .replace('{chemistries}', codes(parts.builtin.chemistry.map((c) => c.id)))
    .replace('{motorMounts}', codes(parts.mounts.filter((m) => m.kind === 'motor').map((m) => m.id)))
    .replace('{stackMounts}', codes(parts.mounts.filter((m) => m.kind === 'stack').map((m) => m.id)));
}

function fieldTable(category, parts) {
  const rows = FIELDS[category].map((x) => {
    const depth = x.path.split('.').length - 1;
    const req = x.req === true ? `<span class="docs-badge docs-badge--req">${L('required', 'Pflicht')}</span>`
      : x.req === 'one' ? `<span class="docs-badge docs-badge--req">${L('one of two', 'eins von zwei')}</span>` : '';
    return {
      attrs: `class="docs-field docs-field--d${depth}" id="${category}-${x.path.replace(/[<>]/g, '').replace(/\./g, '-')}"`,
      cells: [
        `<code>${esc(x.path)}</code>`,
        L(x.type.en, x.type.de),
        req || (x.def ? L(x.def.en, x.def.de) : '–'),
        L(fill(x.desc.en, parts), fill(x.desc.de, parts)),
      ],
    };
  });
  return table([['Field', 'Feld'], ['Type', 'Typ'], ['Default', 'Standard'], ['Meaning', 'Bedeutung']], rows, 'docs-table--fields');
}

export function documentedKeys(category, parts) {
  const placeholders = new Set();
  const keys = new Set();
  for (const x of FIELDS[category]) {
    for (const seg of x.path.split('.')) {
      if (seg.startsWith('<')) { placeholders.add(seg); continue; }
      keys.add(seg);
    }
  }
  return { keys: [...keys].sort(), placeholders: [...placeholders].sort() };
}

export function partsFormatProblems(parts) {
  const problems = [];
  for (const category of Object.keys(parts.keys)) {
    if (!FIELDS[category]) { problems.push(`PartJson liest Kategorie ${category}, die Seite beschreibt sie nicht`); continue; }
    const doc = new Set(documentedKeys(category, parts).keys);
    const code = new Set(parts.keys[category]);
    for (const k of code) if (!doc.has(k)) problems.push(`Feld ${category}.${k} wird gelesen, steht aber nicht in FIELDS (tools/docs/pages/parts-format.mjs)`);
    for (const k of doc) if (!code.has(k)) problems.push(`FIELDS beschreibt ${category}.${k}, PartJson liest es aber nicht`);
  }
  for (const category of Object.keys(FIELDS)) if (!parts.keys[category]) problems.push(`FIELDS beschreibt Kategorie ${category}, PartJson liest sie nicht`);
  return problems;
}

export default function partsFormatPage(ctx) {
  const { parts, meta } = ctx.data;
  const prefix = ctx.prefix;
  const cats = ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory', 'chemistry'];
  const toc = [
    { id: 'files', title: { en: 'Files and loading', de: 'Dateien und Laden' } },
    { id: 'conventions', title: { en: 'Conventions', de: 'Konventionen' } },
    { id: 'common', title: CATEGORY.common },
    ...cats.map((c) => ({ id: c, title: CATEGORY[c] })),
    { id: 'builtin', title: { en: 'Built-in ids', de: 'Eingebaute Ids' } },
    { id: 'example-addon', title: { en: 'Example with own arms', de: 'Beispiel mit eigenen Armen' } },
    { id: 'errors', title: { en: 'Errors and warnings', de: 'Fehler und Warnungen' } },
  ];

  const files = section('files', toc[0].title, `
${code(`src/main/resources/data/<namespace>/propwash_parts/<category>/<path>.json`, 'path')}
${list([
    [`Categories are the folder names: ${codes([...parts.enums.kind, 'chemistry'])}. Sub-folders and other folder names are errors.`, `Kategorien sind die Ordnernamen: ${codes([...parts.enums.kind, 'chemistry'])}. Unterordner und andere Ordnernamen sind Fehler.`],
    ['The id is <code>&lt;namespace&gt;:&lt;file name without .json&gt;</code>; the path may only contain <code>[a-z0-9_.-]</code> and must be unique across all categories.', 'Die Id ist <code>&lt;namensraum&gt;:&lt;dateiname ohne .json&gt;</code>; der Pfad darf nur <code>[a-z0-9_.-]</code> enthalten und muss über alle Kategorien eindeutig sein.'],
    ['Files are loaded only by <code>PropwashApi.parts().loadBundled(modId)</code> from the add-on’s own jar, in the order chemistry → frame → stack → motor → prop → video → battery → accessory, alphabetically within a folder. Not from world data packs, no <code>/reload</code>.', 'Geladen werden die Dateien nur von <code>PropwashApi.parts().loadBundled(modId)</code> aus dem eigenen Jar des Add-ons, in der Reihenfolge chemistry → frame → stack → motor → prop → video → battery → accessory, innerhalb eines Ordners alphabetisch. Nicht aus Welt-Datenpaketen, kein <code>/reload</code>.'],
    [`Propwash’s own ${Object.values(parts.builtin).reduce((n, l) => n + l.length, 0)} built-in parts and chemistries are files in exactly this format.`, `Propwashs eigene ${Object.values(parts.builtin).reduce((n, l) => n + l.length, 0)} eingebaute Teile und Zellchemien sind Dateien in genau diesem Format.`],
  ])}
`);

  const conventions = section('conventions', toc[1].title, list([
    ['Ids without a namespace (<code>"m22"</code>, <code>"lipo"</code>) mean <code>propwash:…</code>. Always write other namespaces in full.', 'Ids ohne Namensraum (<code>"m22"</code>, <code>"lipo"</code>) meinen <code>propwash:…</code>. Andere Namensräume immer voll schreiben.'],
    ['Numbers are JSON numbers; integers must not have decimals (<code>"kv": 1750</code>, not <code>1750.5</code>).', 'Zahlen sind JSON-Zahlen; ganze Zahlen dürfen keine Nachkommastellen haben (<code>"kv": 1750</code>, nicht <code>1750.5</code>).'],
    ['<code>[min, max]</code> ranges may also be a single number for <code>cells</code> (<code>"cells": 6</code> = <code>[6, 6]</code>).', '<code>[min, max]</code>-Bereiche dürfen bei <code>cells</code> auch eine einzelne Zahl sein (<code>"cells": 6</code> = <code>[6, 6]</code>).'],
    ['Positions are <code>[x, y, z]</code> in millimetres: origin in the middle of the frame at the height of the stack plate, +X right, +Y up, −Z forward.', 'Positionen sind <code>[x, y, z]</code> in Millimetern: Ursprung in der Rahmenmitte auf Höhe der Stack-Auflage, +X rechts, +Y oben, −Z vorn.'],
    [`<code>"format": ${parts.format}</code> is optional. New optional fields can come with minor API versions; the format number only rises for incompatible changes.`, `<code>"format": ${parts.format}</code> ist optional. Neue optionale Felder können mit Nebenversionen der API kommen; die Formatnummer steigt nur bei inkompatiblen Änderungen.`],
  ]));

  const common = section('common', toc[2].title, fieldTable('common', parts));

  const catSections = cats.map((c) => {
    const ex = parts.examples[c];
    const intro = c === 'chemistry'
      ? P('Chemistries are not parts and have no common fields; batteries refer to them by id. Register or load them before the batteries that use them.',
        'Zellchemien sind keine Teile und haben keine gemeinsamen Felder; Akkus verweisen per Id auf sie. Vor den Akkus anmelden oder laden, die sie benutzen.')
      : P(`Folder <code>propwash_parts/${c}/</code>, plus the <a href="#common">fields of every part</a>.`, `Ordner <code>propwash_parts/${c}/</code>, dazu die <a href="#common">Felder jedes Teils</a>.`);
    return section(c, { en: `${CATEGORY[c].en} <code>${c}</code>`, de: `${CATEGORY[c].de} <code>${c}</code>` }, `
${intro}
${fieldTable(c, parts)}
${ex ? code(ex.json, 'json', L(`built-in <code>${esc(ex.id)}</code>`, `eingebaut: <code>${esc(ex.id)}</code>`)) : ''}
`);
  }).join('\n');

  const builtinRows = Object.entries(parts.builtin).map(([cat, items]) => [
    `<code>${cat}</code>`,
    items.map((p) => `<code title="${esc(p.name ? p.name.en : '')}">${esc(p.id)}</code>`).join(' '),
  ]);
  const builtin = section('builtin', toc[toc.length - 3].title, `
${P('Mounts of the built-in parts, to make own parts fit them:', 'Halterungen der eingebauten Teile, damit eigene Teile dazu passen:')}
${table([['Mount', 'Halterung'], ['Id', 'Id']], parts.mounts.map((m) => [`<code>Mounts.${m.constant}</code>`, `<code>${m.id}</code>`]))}
${P('Built-in parts and chemistries, for presets that mix them with own parts:', 'Eingebaute Teile und Zellchemien, für Presets, die sie mit eigenen Teilen mischen:')}
${table([['Category', 'Kategorie'], ['Ids', 'Ids']], builtinRows, 'docs-table--ids')}
`);

  const addonEx = parts.examples.addon_frame;
  const exampleAddon = section('example-addon', toc[toc.length - 2].title, `
${P('A deadcat frame from the example add-on: own arm positions and spin directions, the camera far enough in front of the front props, both accessory mounts. <code>"creative": false</code> keeps it out of the creative tab; leave it out for your own parts.',
    'Ein Deadcat-Rahmen aus dem Beispiel-Add-on: eigene Armpositionen und Drehrichtungen, die Kamera weit genug vor den Vorderprops, beide Zubehör-Halterungen. <code>"creative": false</code> hält ihn aus dem Kreativ-Tab; bei eigenen Teilen einfach weglassen.')}
${addonEx ? code(addonEx.json, 'json', `<code>${esc(addonEx.id)}</code>`) : ''}
`);

  const errors = section('errors', toc[toc.length - 1].title, `
${list([
    ['Propwash first reads <strong>all</strong> files. If any has an error, <code>loadBundled</code> throws one exception listing every error as <em>file – field: message</em> and registers nothing.', 'Propwash liest zuerst <strong>alle</strong> Dateien. Hat eine einen Fehler, wirft <code>loadBundled</code> eine Ausnahme mit jedem Fehler als <em>Datei – Feld: Meldung</em> und meldet nichts an.'],
    ['Unknown fields are not errors: they are logged as a warning and ignored, so a file written for a newer Propwash still loads.', 'Unbekannte Felder sind keine Fehler: Sie landen als Warnung im Log und werden ignoriert, damit eine Datei für ein neueres Propwash trotzdem lädt.'],
    ['<code>PropwashEvents.PART_REGISTERED</code> fires for every part (not for chemistries).', '<code>PropwashEvents.PART_REGISTERED</code> feuert für jedes Teil (nicht für Zellchemien).'],
  ])}
${note(`Check a file without starting the game: <code>PropwashApi.parts().fromJson(kind, id, json)</code> throws an <code>IllegalArgumentException</code> naming the field. The <a href="${prefix}configurator/">online configurator</a> reads Just More Parts in this format too.`,
    `Eine Datei ohne Spielstart prüfen: <code>PropwashApi.parts().fromJson(kind, id, json)</code> wirft eine <code>IllegalArgumentException</code>, die das Feld nennt. Der <a href="${prefix}configurator/">Online-Konfigurator</a> liest Just More Parts ebenfalls in diesem Format.`)}
`);

  return {
    id: 'parts-format',
    title: { en: 'Parts format (JSON) – Propwash FPV docs', de: 'Teile-Format (JSON) – Propwash-FPV-Doku' },
    description: {
      en: 'The JSON format of Propwash FPV drone parts: frames, stacks, motors, props, video units, batteries, accessories and cell chemistries, with every field, type and default.',
      de: 'Das JSON-Format der Drohnenteile von Propwash FPV: Rahmen, Stacks, Motoren, Props, Videomodule, Akkus, Zubehör und Zellchemien, mit jedem Feld, Typ und Standardwert.',
    },
    kicker: L(`Docs · For mod authors · Format ${parts.format}`, `Doku · Für Mod-Autoren · Format ${parts.format}`),
    heading: { en: 'Parts format (JSON)', de: 'Teile-Format (JSON)' },
    lead: {
      en: `Every drone part can be a JSON file in an add-on, exactly like Propwash’s own parts. This page lists every field Propwash ${meta.propwash} reads.`,
      de: `Jedes Drohnenteil kann eine JSON-Datei in einem Add-on sein, genau wie Propwashs eigene Teile. Diese Seite nennt jedes Feld, das Propwash ${meta.propwash} liest.`,
    },
    toc,
    body: [files, conventions, common, catSections, builtin, exampleAddon, errors].join('\n'),
  };
}
