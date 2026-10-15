// API reference: every public type of de.lardtom.propwash.api with its record components, enum constants and public
// members, read from the Propwash sources (tools/docs/java-api.mjs). Only the one-line description per type is
// written here; tools/test-docs.mjs fails when a type has none or a description belongs to a type that is gone.

import { L, P, esc, section, h3, note } from '../html.mjs';

export const TYPE_INFO = {
  ApiVersion: { en: 'A parsed API version (major.minor.patch) and the compatibility rule: same major version, at least the required minor version.', de: 'Eine gelesene API-Version (Haupt.Neben.Patch) und die Verträglichkeitsregel: gleiche Hauptversion, mindestens die verlangte Nebenversion.' },
  PropwashApi: { en: 'Entry point of the API: version, part registry, part items, builds, creative tab, loot, language texts and (since 1.6) accessories, drones and flight extensions.', de: 'Einstieg in die API: Version, Teile-Register, Teil-Items, Baupläne, Kreativ-Tab, Beute, Sprachtexte und (seit 1.6) Zubehör, Drohnen und Flug-Erweiterungen.' },
  BuildAccess: { en: 'Reads and creates drone items, checks and analyses builds, gives the FPV camera, default tune and presets, and runs imports on the server.', de: 'Liest und erzeugt Drohnen-Items, prüft und analysiert Baupläne, liefert FPV-Kamera, Standard-Tuning und Presets und führt Importe auf dem Server aus.' },
  BuildCheck: { en: 'Result of a build check: unknown parts, problems that stop the build and warnings.', de: 'Ergebnis einer Bau-Prüfung: unbekannte Teile, Probleme, die den Bau verhindern, und Warnungen.' },
  BuildSpec: { en: 'The parts of a drone as ids: frame, stack, motor, prop, video, battery and accessories per slot.', de: 'Die Teile einer Drohne als Ids: Rahmen, Stack, Motor, Prop, Video, Akku und Zubehör je Platz.' },
  BuildStats: { en: 'The figures of the workbench analysis: weight, thrust-to-weight, hover throttle, flight times, currents, temperatures, props in view and warnings.', de: 'Die Werte der Werkbank-Analyse: Gewicht, Schub-Gewicht, Schwebegas, Flugzeiten, Ströme, Temperaturen, Props im Bild und Warnungen.' },
  CameraView: { en: 'The FPV camera as Propwash draws it: lens position, uptilt and its range, field of view and the four prop discs.', de: 'Die FPV-Kamera, wie Propwash sie zeichnet: Objektivlage, Uptilt und sein Bereich, Sichtfeld und die vier Prop-Scheiben.' },
  DroneData: { en: 'Everything a share code carries: build, paint, tune and name.', de: 'Alles, was ein Sharecode trägt: Bauplan, Lack, Tuning und Name.' },
  DronePreset: { en: 'A named ready-made drone shown in the creative tab and recognised in the workbench.', de: 'Eine benannte fertige Drohne, die im Kreativ-Tab steht und in der Werkbank erkannt wird.' },
  ImportLayer: { en: 'What an import applies: parts, paint, tune, name.', de: 'Was ein Import übernimmt: Teile, Lack, Tuning, Name.' },
  ImportRequest: { en: 'An import request with its layers, tune groups and target; factories for the usual cases.', de: 'Eine Import-Anfrage mit Ebenen, Tuning-Gruppen und Ziel; Fabriken für die üblichen Fälle.' },
  ImportResult: { en: 'The server’s answer to an import: status, applied layers, missing parts and dyes.', de: 'Die Antwort des Servers auf einen Import: Status, übernommene Ebenen, fehlende Teile und Farbstoffe.' },
  ImportStatus: { en: 'Outcome of an import, each with a translation key.', de: 'Ausgang eines Imports, jeweils mit Sprachschlüssel.' },
  ImportTarget: { en: 'Where an import goes: workbench, held drone or a new drone.', de: 'Wohin ein Import geht: Werkbank, gehaltene Drohne oder neue Drohne.' },
  PaintSpec: { en: 'RGB colour per paint slot; missing slots keep the original colour.', de: 'RGB-Farbe je Lack-Platz; fehlende Plätze behalten die Originalfarbe.' },
  TuneGroup: { en: 'Groups of tune keys (rates, PID, filters, camera, LED, VTX …) for partial imports.', de: 'Gruppen von Tuning-Schlüsseln (Rates, PID, Filter, Kamera, LED, VTX …) für Teil-Importe.' },
  TuneSpec: { en: 'Tune values by key, like in the flight controller; missing keys mean the default.', de: 'Tuning-Werte je Schlüssel wie im Flight-Controller; fehlende Schlüssel bedeuten Standard.' },
  ClientTune: { en: 'Reads and applies the tune of the drone the player flies or holds (client only).', de: 'Liest und setzt das Tuning der Drohne, die der Spieler fliegt oder hält (nur Client).' },
  FlightSchoolScenes: { en: 'Ids of all built-in Flight School scenes, in display order.', de: 'Ids aller eingebauten Flugschul-Szenen in Anzeigereihenfolge.' },
  OsdLayoutAccess: { en: 'Reads, checks and applies the player’s OSD layout (client only).', de: 'Liest, prüft und setzt das OSD-Layout des Spielers (nur Client).' },
  OsdLayoutSpec: { en: 'An OSD layout as versioned JSON.', de: 'Ein OSD-Layout als versioniertes JSON.' },
  PropwashClientApi: { en: 'Client entry point: configurator tabs, workbench extensions, Flight School scenes and links, OSD, tune, imports and the drone preview, HUD elements, gimbal cameras and input (since 1.6).', de: 'Client-Einstieg: Konfigurator-Tabs, Werkbank-Erweiterungen, Flugschul-Szenen und -Verknüpfungen, OSD, Tuning, Importe und die Drohnen-Vorschau, HUD-Elemente, Gimbal-Kameras und Eingaben (seit 1.6).' },
  WorkbenchContext: { en: 'What a workbench extension sees and can do: slots, result, buttons, child screens, import.', de: 'Was eine Werkbank-Erweiterung sieht und kann: Slots, Ergebnis, Knöpfe, Kind-Fenster, Import.' },
  WorkbenchExtension: { en: 'Adds buttons to the drone workbench.', de: 'Fügt der Drohnen-Werkbank Knöpfe hinzu.' },
  PropwashEvent: { en: 'An event with listeners; register in the open phase.', de: 'Ein Event mit Listenern; Anmeldung in der offenen Phase.' },
  PropwashEvents: { en: 'All events of the API and their listener interfaces.', de: 'Alle Events der API und ihre Listener-Interfaces.' },
  AccessoryDefinition: { en: 'An accessory for the top, bottom or front mount: size, power draw, LEDs, lens, optional action cam.', de: 'Ein Zubehörteil für die obere, untere oder vordere Halterung: Maße, Leistungsaufnahme, LEDs, Objektiv, optional Action-Cam.' },
  AccessorySlot: { en: 'Accessory mounts: top, bottom and (since 1.6) front under the nose.', de: 'Zubehör-Halterungen: oben, unten und (seit 1.6) vorne unter der Nase.' },
  ActionCamDefinition: { en: 'Recording capabilities of an action cam: resolution, frame rate, stabilisation, own battery, power, image.', de: 'Aufnahmefähigkeiten einer Action-Cam: Auflösung, Bildrate, Stabilisierung, eigener Akku, Leistung, Bild.' },
  AirframeGeometry: { en: 'Arm positions and spin, battery position, camera, centre of mass, mass split and accessory anchors of a frame.', de: 'Armpositionen und Drehrichtung, Akkulage, Kamera, Schwerpunkt, Massenverteilung und Zubehör-Anker eines Rahmens.' },
  AnchorSpec: { en: 'Where an accessory sits on a frame: position, tilt, length.', de: 'Wo ein Zubehörteil am Rahmen sitzt: Position, Neigung, Länge.' },
  BatteryDefinition: { en: 'A battery pack: cells, capacity, internal resistance, C rating, chemistry, size, connector.', de: 'Ein Akku: Zellen, Kapazität, Innenwiderstand, C-Rate, Chemie, Maße, Stecker.' },
  BatteryFitRule: { en: 'Which batteries a frame takes: cell range, maximum mass and the preferred pack.', de: 'Welche Akkus ein Rahmen nimmt: Zellbereich, Höchstmasse und der bevorzugte Akku.' },
  CellChemistry: { en: 'A cell chemistry: voltages, density, open-circuit voltage curve and usable fraction.', de: 'Eine Zellchemie: Spannungen, Dichte, Leerlaufspannungskurve und nutzbarer Anteil.' },
  DuctSpec: { en: 'Duct values of a ducted frame; empty values use the standard duct.', de: 'Duct-Werte eines geduckten Rahmens; leere Werte nehmen den Standard-Duct.' },
  FrameAero: { en: 'Frontal area, drag coefficient and optional side and top areas of a frame.', de: 'Stirnfläche, Widerstandsbeiwert und optional Seiten- und Draufsichtfläche eines Rahmens.' },
  FrameDefinition: { en: 'A frame: class, shape, wheelbase, prop sizes, mounts, geometry, aerodynamics and battery rule.', de: 'Ein Rahmen: Klasse, Form, Radstand, Prop-Größen, Halterungen, Geometrie, Aerodynamik und Akku-Regel.' },
  FrameRole: { en: 'Frame classes, from whoop to X-Class; the key is the JSON value.', de: 'Rahmenklassen vom Whoop bis X-Class; der Schlüssel ist der JSON-Wert.' },
  FrameShape: { en: 'Frame shapes; the key is the JSON value.', de: 'Rahmenformen; der Schlüssel ist der JSON-Wert.' },
  MassSplit: { en: 'How a frame’s mass divides into arms, plate and duct.', de: 'Wie sich die Masse eines Rahmens auf Arme, Platte und Duct verteilt.' },
  MotorArm: { en: 'One motor position with its spin direction.', de: 'Eine Motorposition mit Drehrichtung.' },
  MotorDefinition: { en: 'A motor: stator, KV, mount, current, winding resistance, cells, prop mount and heat limits.', de: 'Ein Motor: Stator, KV, Halterung, Strom, Wicklungswiderstand, Zellen, Prop-Aufnahme und Hitzegrenzen.' },
  MotorThermal: { en: 'Heat values of a motor: capacity, cooling, throttling start, maximum and wear.', de: 'Hitzewerte eines Motors: Wärmekapazität, Kühlung, Beginn der Drosselung, Maximum und Verschleiß.' },
  Mounts: { en: 'Ids of the built-in motor, stack and prop mounts.', de: 'Ids der eingebauten Motor-, Stack- und Prop-Halterungen.' },
  PackSize: { en: 'Battery pack dimensions in millimetres.', de: 'Akkumaße in Millimetern.' },
  PartBasics: { en: 'Data every part has: mass, stack size, sort order, creative listing, durability, recycling, look and rarity.', de: 'Daten, die jedes Teil hat: Masse, Stapelgröße, Sortierung, Kreativ-Liste, Haltbarkeit, Recycling, Aussehen und Seltenheit.' },
  PartDefinition: { en: 'Common interface of all part definitions.', de: 'Gemeinsames Interface aller Teil-Definitionen.' },
  PartKind: { en: 'Part categories; the key is the folder name of JSON parts.', de: 'Teil-Kategorien; der Schlüssel ist der Ordnername der JSON-Teile.' },
  PartRegistry: { en: 'Registers and looks up parts and chemistries, loads JSON parts and converts them to and from JSON.', de: 'Meldet Teile und Zellchemien an, schlägt sie nach, lädt JSON-Teile und wandelt sie in JSON und zurück.' },
  PartVisual: { en: 'Accent colour and an alternative drone model of a part.', de: 'Akzentfarbe und ein anderes Drohnen-Modell eines Teils.' },
  PropDefinition: { en: 'A propeller: diameter, pitch, blades, thrust and power coefficients, material, stiffness, mount and the optional reverse thrust for 3D mode.', de: 'Ein Propeller: Durchmesser, Steigung, Blätter, Schub- und Leistungsbeiwert, Material, Steifigkeit, Aufnahme und der optionale Umkehrschub für den 3D-Modus.' },
  PropMaterial: { en: 'Prop materials with their default stiffness and durability; the key is the JSON value.', de: 'Prop-Materialien mit Standard-Steifigkeit und -Haltbarkeit; der Schlüssel ist der JSON-Wert.' },
  RecycleYield: { en: 'What the salvage slot gives back for a broken part.', de: 'Was das Zerlegen-Feld für ein kaputtes Teil zurückgibt.' },
  StackDefinition: { en: 'A flight controller and ESC stack: mount, current, cells, all-in-one.', de: 'Ein Flight-Controller- und ESC-Stack: Halterung, Strom, Zellen, All-in-One.' },
  Vec3Mm: { en: 'A position in frame millimetres (+X right, +Y up, −Z forward).', de: 'Eine Position in Rahmen-Millimetern (+X rechts, +Y oben, −Z vorn).' },
  VideoDefinition: { en: 'A video unit: analog or digital, latency, range, image quality, camera width and field of view, VTX power, power draw.', de: 'Ein Videomodul: analog oder digital, Latenz, Reichweite, Bildqualität, Kamerabreite und Sichtfeld, VTX-Leistung, Leistungsaufnahme.' },
  VideoLink: { en: 'Video systems: analog and digital.', de: 'Videosysteme: analog und digital.' },
  CreativeEntries: { en: 'Extra item stacks for a creative tab.', de: 'Zusätzliche Item-Stapel für einen Kreativ-Tab.' },
  ExtensionTab: { en: 'The own creative tab of an add-on: icon, section order and extra entries.', de: 'Der eigene Kreativ-Tab eines Add-ons: Symbol, Reihenfolge der Abschnitte und zusätzliche Einträge.' },
  LootInjections: { en: 'Hooks an add-on loot table into any loot table, on both loaders.', de: 'Hängt eine Beutetabelle des Add-ons in jede Beutetabelle, auf beiden Loadern.' },
  PartItems: { en: 'Registers items for parts and looks them up.', de: 'Meldet Items für Teile an und schlägt sie nach.' },
  TabSection: { en: 'Sections of an add-on creative tab.', de: 'Abschnitte eines Add-on-Kreativ-Tabs.' },
  AccessoryAction: { en: 'What an accessory sees when the pilot presses or releases accessory action 1–4: number, pressed, player, plus the accessory context.', de: 'Was ein Zubehörteil sieht, wenn der Pilot Zubehör-Aktion 1–4 drückt oder loslässt: Nummer, gedrückt, Spieler und der Zubehör-Kontext.' },
  AccessoryBehavior: { en: 'Code behind an add-on accessory: inventory size and filter (shulker boxes and drone items with accessory contents are never taken), own payload weight, reaction to accessory actions and a server tick.', de: 'Code hinter einem Zubehörteil eines Add-ons: Inventargröße und Filter (Shulkerkisten und Drohnen-Items mit Zubehör-Inhalt nie), eigenes Beladungsgewicht, Reaktion auf Zubehör-Aktionen und ein Server-Tick.' },
  AccessoryContext: { en: 'Server view of one accessory on one drone: level, drone, slot, inventory, pilot, flight state, held actions, mount pose, velocity and physics.', de: 'Server-Sicht auf ein Zubehörteil an einer Drohne: Welt, Drohne, Halterung, Inventar, Pilot, Flugzustand, gehaltene Aktionen, Lage der Halterung, Tempo und Physik.' },
  AccessoryInventory: { en: 'The synchronised inventory of an accessory on a drone (server): read copies, set and take stacks, payload weight.', de: 'Das synchronisierte Inventar eines Zubehörteils an einer Drohne (Server): Kopien lesen, Stapel setzen und entnehmen, Beladungsgewicht.' },
  AccessoryRegistry: { en: 'Registers accessory behaviours and reads accessories and their contents on drones and drone items.', de: 'Meldet Zubehör-Verhalten an und liest Zubehör samt Inhalt an Drohnen und Drohnen-Items.' },
  MountPose: { en: 'World pose of an accessory mount: anchor, centre, front face and the forward, up and right directions including tilt.', de: 'Weltlage einer Zubehör-Halterung: Anbaupunkt, Mitte, Vorderseite und die Richtungen vorn, oben und rechts samt Neigung.' },
  DroneAccess: { en: 'Finds and describes drones, applies impulses and pushes, scans for obstacles and aims with lead.', de: 'Findet und beschreibt Drohnen, gibt Stöße und Schübe, sucht Hindernisse und zielt mit Vorhalt.' },
  DronePhysics: { en: 'Impulses (N·s) and timed pushes (N) at a frame point; routed to the pilot’s flight model, the server return flight or a parked drone.', de: 'Stöße (N·s) und zeitlich begrenzte Schübe (N) an einem Rahmenpunkt; gehen an das Flugmodell des Piloten, den Heimflug am Server oder eine abgestellte Drohne.' },
  DroneView: { en: 'A snapshot of a drone: pilot, flying, armed, autopilot, centre, velocity, attitude, mass with load and accessories.', de: 'Momentaufnahme einer Drohne: Pilot, fliegt, scharf, Autopilot, Mitte, Tempo, Lage, Masse mit Beladung und Zubehör.' },
  ObstacleScan: { en: 'Obstacle distances in the six frame directions up to a range.', de: 'Hindernisabstände in den sechs Rahmenrichtungen bis zu einer Reichweite.' },
  DroneDamage: { en: 'A drone taking damage: source and amount, changeable and cancellable.', de: 'Eine Drohne nimmt Schaden: Quelle und Menge, änderbar und abbrechbar.' },
  EntityHit: { en: 'A flown drone hitting a living entity: relative velocity, contact point, mount, base damage; damage and knockback changeable.', de: 'Eine geflogene Drohne trifft ein Lebewesen: Relativtempo, Kontaktpunkt, Halterung, Grundschaden; Schaden und Rückstoß änderbar.' },
  AssistOutput: { en: 'What a flight assist commands each nav tick: sticks and mode, altitude, position or velocity, yaw, an OSD label, return to home.', de: 'Was eine Flughilfe in jedem Nav-Takt vorgibt: Knüppel und Modus, Höhe, Position oder Geschwindigkeit, Gieren, eine OSD-Anzeige, Rückkehr.' },
  DroneProfile: { en: 'The parts of a drone as ids and its mass, for choosing flight assists and force providers.', de: 'Die Teile einer Drohne als Ids und ihre Masse, zur Wahl von Flughilfen und Kräften.' },
  FlightAssist: { en: 'A flight controller extension running at 100 Hz inside the pilot’s flight model (position hold, cinematic smoothing, orbit, waypoints); while it outputs anything, a race lap counts as assisted.', de: 'Eine Erweiterung des Flight-Controllers, die mit 100 Hz im Flugmodell des Piloten läuft (Position halten, Kino-Glättung, Umkreisen, Wegpunkte); solange sie etwas ausgibt, zählt eine Rennrunde als Runde mit Flughilfe.' },
  FlightExtensions: { en: 'Registers flight assists and force providers per drone profile.', de: 'Meldet Flughilfen und Kräfte je Drohnen-Profil an.' },
  FlightState: { en: 'Read-only state for assists and forces: true and estimated position and velocity, attitude, sensors, sticks, actions, obstacles.', de: 'Nur-lese-Zustand für Flughilfen und Kräfte: wahre und geschätzte Position und Geschwindigkeit, Lage, Sensoren, Knüppel, Aktionen, Hindernisse.' },
  ForceProvider: { en: 'Adds forces and torques to the flight model at 100 Hz on the pilot client and in the server return flight.', de: 'Gibt dem Flugmodell mit 100 Hz Kräfte und Drehmomente, auf dem Pilot-Client und im Heimflug am Server.' },
  ForceSink: { en: 'Collects the forces (N) and torques (N·m) of a force provider, also at frame points.', de: 'Sammelt Kräfte (N) und Drehmomente (N·m) eines Kraft-Anbieters, auch an Rahmenpunkten.' },
  GimbalModel: { en: 'A ready-made stabilised 3-axis gimbal without Minecraft types: follow, lock and FPV modes, pitch range, mechanical limits, smoothing.', de: 'Ein fertiger stabilisierter 3-Achsen-Gimbal ohne Minecraft-Typen: Modi Folgen, Sperren und FPV, Nickbereich, mechanische Grenzen, Glättung.' },
  Intercept: { en: 'Aiming with lead and gravity compensation for projectiles at moving targets.', de: 'Zielen mit Vorhalt und Schwerkraft-Ausgleich für Geschosse auf bewegte Ziele.' },
  SensorDirection: { en: 'The six obstacle sensor directions in frame coordinates.', de: 'Die sechs Richtungen der Hindernissensoren in Rahmen-Koordinaten.' },
  StabilizationMode: { en: 'Stabilisation modes a flight assist can select: acro, angle, horizon.', de: 'Stabilisierungsmodi, die eine Flughilfe wählen kann: Acro, Angle, Horizon.' },
  ClientInput: { en: 'Reads the local pilot’s input: flown drone, sticks and accessory actions (client only).', de: 'Liest die Eingaben des Piloten: geflogene Drohne, Knüppel und Zubehör-Aktionen (nur Client).' },
  FlightTelemetry: { en: 'Flight data for HUD elements: mode, position, speed, attitude, battery, home point, GPS, signals, flight time, sticks.', de: 'Flugdaten für HUD-Elemente: Modus, Position, Tempo, Lage, Akku, Home-Punkt, GPS, Signale, Flugzeit, Knüppel.' },
  HudContext: { en: 'What a HUD element gets: drone, view mode, image area, telemetry and font (client only).', de: 'Was ein HUD-Element bekommt: Drohne, Ansicht, Bildbereich, Telemetrie und Schrift (nur Client).' },
  HudElement: { en: 'An own HUD element in FPV or line of sight; may replace the Propwash OSD (client only).', de: 'Ein eigenes HUD-Element im FPV oder Sichtflug; darf das Propwash-OSD ersetzen (nur Client).' },
  GimbalContext: { en: 'What a gimbal gets: drone, frame attitude of the shown picture, camera uptilt, time step, spectating (client only).', de: 'Was ein Gimbal bekommt: Drohne, Rahmenlage des gezeigten Bilds, Kamerawinkel, Zeitschritt, Zuschauen (nur Client).' },
  GimbalProvider: { en: 'Sets the world attitude of the FPV camera for drones it applies to – a stabilised gimbal (client only).', de: 'Setzt die Weltlage der FPV-Kamera für passende Drohnen – ein stabilisierter Gimbal (nur Client).' },
};

const KIND_LABEL = {
  record: { en: 'record', de: 'Record' },
  interface: { en: 'interface', de: 'Interface' },
  class: { en: 'class', de: 'Klasse' },
  enum: { en: 'enum', de: 'Enum' },
  annotation: { en: 'annotation', de: 'Annotation' },
};

function anchor(pkg, path) {
  return `${pkg.replace(/^de\.lardtom\.propwash\./, '').replace(/\./g, '-')}-${path.join('-')}`.toLowerCase();
}

function header(type) {
  const mods = type.modifiers.length ? type.modifiers.join(' ') + ' ' : '';
  let text = `${mods}${type.kind} ${type.name}${type.typeParams || ''}`;
  if (type.kind === 'record') text += `(${type.components.join(', ')})`;
  if (type.extends) text += ` extends ${type.extends}`;
  if (type.implements) text += ` implements ${type.implements}`;
  if (type.permits) text += ` permits ${type.permits}`;
  return text;
}

function members(type) {
  const groups = [];
  if (type.constants.length) {
    groups.push(`<ul class="docs-api__constants">${type.constants.map((c) => `<li><code>${esc(c.name)}</code>${c.key ? ` <span class="docs-muted">${esc(JSON.stringify(c.key))}</span>` : ''}</li>`).join('')}</ul>`);
  }
  const order = (m) => (m.kind === 'field' ? 0 : m.kind === 'constructor' ? 1 : m.static ? 2 : 3);
  const list = [...type.members].sort((a, b) => order(a) - order(b));
  if (list.length) {
    groups.push(`<ul class="docs-api__members">${list.map((m) => `<li><code>${esc(m.display)}</code></li>`).join('')}</ul>`);
  }
  return groups.join('\n');
}

function typeBlock(pkg, type, path, depth) {
  const id = anchor(pkg, path);
  const info = TYPE_INFO[type.name];
  const desc = depth === 0 && info ? P(info.en, info.de, 'docs-api__desc') : '';
  const nested = type.types.map((t) => `<details class="docs-api__nested">
<summary><code>${esc(type.name)}.${esc(t.name)}</code> <span class="docs-badge">${L(KIND_LABEL[t.kind])}</span></summary>
${typeBlock(pkg, t, [...path, t.name], depth + 1)}
</details>`).join('\n');
  const title = depth === 0
    ? `<h3 id="${id}" class="docs-api__name"><a class="docs-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a><code>${esc(type.name)}</code> <span class="docs-badge">${L(KIND_LABEL[type.kind])}</span></h3>`
    : '';
  const inner = `${title}
${desc}
<pre class="docs-api__sig"><code>${esc(header(type))}</code></pre>
${members(type)}
${nested}`;
  return depth === 0 ? `<article class="docs-api">\n${inner}\n</article>` : `<div id="${id}" class="docs-api docs-api--nested">\n${inner}\n</div>`;
}

export default function referencePage(ctx) {
  const { api, meta } = ctx.data;
  const toc = api.packages.map((p) => ({ id: anchor(p.name, ['package']), title: { en: p.name.replace('de.lardtom.propwash.', ''), de: p.name.replace('de.lardtom.propwash.', '') } }));
  toc.push({ id: 'outside', title: { en: 'Types from outside', de: 'Typen von außerhalb' } });
  const count = api.packages.reduce((n, p) => n + p.types.length, 0);

  const intro = `${P(`All ${count} public types of the package <code>de.lardtom.propwash.api</code> in Propwash ${meta.propwash} (API ${api.version}), read from the source code. Public members only; how to use them is in the <a href="../">add-on guide</a>. The Maven artifacts also carry sources and Javadoc for your IDE.`,
    `Alle ${count} öffentlichen Typen des Pakets <code>de.lardtom.propwash.api</code> in Propwash ${meta.propwash} (API ${api.version}), aus dem Quellcode gelesen. Nur öffentliche Mitglieder; wie man sie benutzt, steht im <a href="../">Add-on-Handbuch</a>. Die Maven-Artefakte bringen auch Quellen und Javadoc für die IDE mit.`)}
<nav class="docs-api__index" aria-label="Types" data-de-aria-label="Typen">
${api.packages.map((p) => `<p><strong><code>${esc(p.name.replace('de.lardtom.propwash.', ''))}</code></strong> ${p.types.map((t) => `<a href="#${anchor(p.name, [t.name])}"><code>${esc(t.name)}</code></a>`).join(' ')}</p>`).join('\n')}
</nav>`;

  const packages = api.packages.map((p, i) => section(toc[i].id, toc[i].title, p.types.map((t) => typeBlock(p.name, t, [t.name], 0)).join('\n'))).join('\n');

  const outside = section('outside', toc[toc.length - 1].title, `
${P('These types live outside the API package but appear in its signatures. They are released for add-ons and only get additions (see <a href="../#versions">stability</a>).',
    'Diese Typen liegen außerhalb des API-Pakets, kommen aber in seinen Signaturen vor. Sie sind für Add-ons freigegeben und werden nur ergänzt (siehe <a href="../#versions">Stabilität</a>).')}
<ul class="docs-api__members">${api.external.map((e) => `<li><code>${esc(e.name)}</code> <span class="docs-muted">${L('used by', 'benutzt von')} ${e.usedBy.map((u) => `<code>${esc(u)}</code>`).join(', ')}</span></li>`).join('')}</ul>
${note('Everything else outside <code>de.lardtom.propwash.api</code> is internal and may change in any version.', 'Alles andere außerhalb von <code>de.lardtom.propwash.api</code> ist intern und darf sich in jeder Version ändern.')}
`);

  return {
    id: 'reference',
    title: { en: `API reference ${api.version} – Propwash FPV docs`, de: `API-Referenz ${api.version} – Propwash-FPV-Doku` },
    description: {
      en: `Every public type, record component and method of the Propwash FPV add-on API ${api.version}, generated from the source code.`,
      de: `Jeder öffentliche Typ, jede Record-Komponente und Methode der Add-on-API ${api.version} von Propwash FPV, aus dem Quellcode erzeugt.`,
    },
    kicker: L(`Docs · For mod authors · API ${api.version}`, `Doku · Für Mod-Autoren · API ${api.version}`),
    heading: { en: 'API reference', de: 'API-Referenz' },
    lead: {
      en: 'Every type and member of the public API at a glance, generated from the Propwash source code of this release.',
      de: 'Jeder Typ und jedes Mitglied der öffentlichen API auf einen Blick, aus dem Propwash-Quellcode dieser Version erzeugt.',
    },
    toc,
    body: [intro, packages, outside].join('\n'),
  };
}

export function referenceProblems(api) {
  const problems = [];
  const names = new Set(api.packages.flatMap((p) => p.types.map((t) => t.name)));
  for (const name of names) if (!TYPE_INFO[name]) problems.push(`API-Typ ${name} ohne Beschreibung in TYPE_INFO (tools/docs/pages/reference.mjs)`);
  for (const name of Object.keys(TYPE_INFO)) if (!names.has(name)) problems.push(`TYPE_INFO beschreibt ${name}, den es in der API nicht mehr gibt`);
  return problems;
}
