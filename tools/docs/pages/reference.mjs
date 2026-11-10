// API reference: every public type of de.lardtom.propwash.api with its record components, enum constants and public
// members, read from the Propwash sources (tools/docs/java-api.mjs). Only the one-line description per type is
// written here; tools/test-docs.mjs fails when a type has none or a description belongs to a type that is gone.

import { L, P, esc, section, h3, note } from '../html.mjs';

export const TYPE_INFO = {
  ApiVersion: { en: 'A parsed API version (major.minor.patch) and the compatibility rule: same major version, at least the required minor version.', de: 'Eine gelesene API-Version (Haupt.Neben.Patch) und die Verträglichkeitsregel: gleiche Hauptversion, mindestens die verlangte Nebenversion.' },
  PropwashApi: { en: 'Entry point of the API: version, part registry, part items, builds, creative tab, loot, language texts, (since 1.6) accessories, drones and flight extensions and (since 1.7) switches, world rules, drone data, share codes and race data.', de: 'Einstieg in die API: Version, Teile-Register, Teil-Items, Baupläne, Kreativ-Tab, Beute, Sprachtexte, (seit 1.6) Zubehör, Drohnen und Flug-Erweiterungen und (seit 1.7) Schalter, Welt-Regeln, Drohnen-Daten, Sharecodes und Renndaten.' },
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
  PropwashClientApi: { en: 'Client entry point: configurator tabs, workbench extensions, Flight School scenes and links, OSD, tune, imports and the drone preview, HUD elements, gimbal cameras and input (since 1.6), OSD elements and warnings, keys for add-on switches, service buttons, recording and live view (since 1.7).', de: 'Client-Einstieg: Konfigurator-Tabs, Werkbank-Erweiterungen, Flugschul-Szenen und -Verknüpfungen, OSD, Tuning, Importe und die Drohnen-Vorschau, HUD-Elemente, Gimbal-Kameras und Eingaben (seit 1.6), OSD-Elemente und -Warnungen, Tasten für Add-on-Schalter, Knöpfe in der Wartung, Aufnahme und Livebild (seit 1.7).' },
  WorkbenchContext: { en: 'What a workbench extension sees and can do: slots, result, buttons, child screens, import.', de: 'Was eine Werkbank-Erweiterung sieht und kann: Slots, Ergebnis, Knöpfe, Kind-Fenster, Import.' },
  WorkbenchExtension: { en: 'Adds buttons to the drone workbench.', de: 'Fügt der Drohnen-Werkbank Knöpfe hinzu.' },
  PropwashEvent: { en: 'An event with listeners; register in the open phase.', de: 'Ein Event mit Listenern; Anmeldung in der offenen Phase.' },
  PropwashEvents: { en: 'All events of the API and their listener interfaces.', de: 'Alle Events der API und ihre Listener-Interfaces.' },
  AccessoryDefinition: { en: 'An accessory for the top, bottom or front mount: size, power draw, LEDs (since 1.7 along an own path), lens, optional action cam, hanging straight, a muzzle point and the frames it fits (since 1.7).', de: 'Ein Zubehörteil für die obere, untere oder vordere Halterung: Maße, Leistungsaufnahme, LEDs (seit 1.7 entlang eines eigenen Pfads), Objektiv, optional Action-Cam, gerade hängend, eine Mündung und die Rahmen, an die es passt (seit 1.7).' },
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
  MotorThermal: { en: 'Heat values of a motor: capacity, cooling, the temperature from which it loses torque and wears (since 0.6.0 only the ESC throttles back), maximum and wear.', de: 'Hitzewerte eines Motors: Wärmekapazität, Kühlung, die Temperatur, ab der er Drehmoment verliert und verschleißt (seit 0.6.0 regelt nur der ESC ab), Maximum und Verschleiß.' },
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
  DroneAccess: { en: 'Finds and describes drones, applies impulses and pushes, scans for obstacles and aims with lead; since 1.7 also all loaded drones, the camera pose, collision rules, autonomous flights and second operators.', de: 'Findet und beschreibt Drohnen, gibt Stöße und Schübe, sucht Hindernisse und zielt mit Vorhalt; seit 1.7 auch alle geladenen Drohnen, den Kamerablick, Kollisionsregeln, autonome Flüge und zweite Operatoren.' },
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
  GimbalProvider: { en: 'Sets the world attitude of the FPV camera for drones it applies to – a stabilised gimbal; since 1.7 also in recordings, as a turning head on the model and with its own field of view (client only).', de: 'Setzt die Weltlage der FPV-Kamera für passende Drohnen – ein stabilisierter Gimbal; seit 1.7 auch in Aufnahmen, als drehender Kopf am Modell und mit eigenem Sichtfeld (nur Client).' },
  DispenseOptions: { en: 'How an accessory dispenses: speed and spread of projectiles, fluids allowed, recoil in the flight model, items used up or not (since 1.7).', de: 'Wie ein Zubehörteil abgibt: Tempo und Streuung von Geschossen, Flüssigkeiten erlaubt, Rückstoß im Flugmodell, Items verbrauchen oder nicht (seit 1.7).' },
  DispenseResult: { en: 'Result of dispensing: fired, placed, used, empty, refused, blocked or denied, the created entity and the recoil (since 1.7).', de: 'Ergebnis des Abgebens: gefeuert, gesetzt, benutzt, leer, abgelehnt, blockiert oder verweigert, das erzeugte Entity und der Rückstoß (seit 1.7).' },
  ItemDisplay: { en: 'Where an item in an accessory is shown on the drone: offset, rotation and scale (since 1.7).', de: 'Wo ein Item im Zubehör an der Drohne erscheint: Versatz, Drehung und Größe (seit 1.7).' },
  RecordingControl: { en: 'Starts and stops a recording of the action cam and takes a photo through the API (client only, since 1.7).', de: 'Startet und stoppt eine Aufnahme der Action-Cam und macht ein Foto per API (nur Client, seit 1.7).' },
  ServiceExtension: { en: 'A button of an add-on in the service screen of a drone that opens its own window; up to three are visible (client only, since 1.7).', de: 'Ein Knopf eines Add-ons in der Wartung einer Drohne, der ein eigenes Fenster öffnet; bis zu drei sind sichtbar (nur Client, seit 1.7).' },
  OsdAlign: { en: 'Alignment of an OSD element in its grid cell: left, centre, right.', de: 'Ausrichtung eines OSD-Elements in seiner Rasterzelle: links, Mitte, rechts.' },
  OsdContent: { en: 'Supplies the text of an add-on OSD element every frame; null shows nothing (client only, since 1.7).', de: 'Liefert in jedem Bild den Text eines OSD-Elements eines Add-ons; null zeigt nichts (nur Client, seit 1.7).' },
  OsdContext: { en: 'What an OSD element or warning sees: drone, telemetry, FPV or line of sight, editor preview, game time (client only, since 1.7).', de: 'Was ein OSD-Element oder eine Warnung sieht: Drohne, Telemetrie, FPV oder Sichtflug, Vorschau im Editor, Spielzeit (nur Client, seit 1.7).' },
  OsdElementSpec: { en: 'An add-on OSD element: id, name, default position in the 30 × 16 grid, alignment, default on or off, group, length, preview text and content (since 1.7).', de: 'Ein OSD-Element eines Add-ons: Id, Name, Standardposition im Raster 30 × 16, Ausrichtung, standardmäßig an oder aus, Gruppe, Länge, Vorschautext und Inhalt (seit 1.7).' },
  OsdGroup: { en: 'Groups of the OSD editor list; add-on elements usually go into <code>ADDON</code>.', de: 'Gruppen der Liste im OSD-Editor; Add-on-Elemente kommen meist in <code>ADDON</code>.' },
  OsdText: { en: 'A text in the OSD with its tone.', de: 'Ein Text im OSD mit seinem Ton.' },
  OsdTone: { en: 'Colour tone of an OSD text: normal, accent, caution, warning.', de: 'Farbton eines OSD-Texts: normal, Akzent, Vorsicht, Warnung.' },
  OsdWarning: { en: 'An add-on warning shown in the built-in warning area of the OSD while it returns a text (client only, since 1.7).', de: 'Eine Warnung eines Add-ons im eingebauten Warnfeld des OSD, solange sie einen Text liefert (nur Client, seit 1.7).' },
  AutonomyAccess: { en: 'Lets the server fly a drone with an add-on’s flight assist: start, stop, the running flight and handlers that take over when the pilot leaves FPV (since 1.7).', de: 'Lässt den Server eine Drohne mit der Flughilfe eines Add-ons fliegen: starten, stoppen, laufender Flug und Handler, die übernehmen, wenn der Pilot das FPV verlässt (seit 1.7).' },
  AutonomyEnd: { en: 'Why an autonomous flight ended: pilot, landed, battery, owner offline, out of range, stopped, timeout, error, replaced.', de: 'Warum ein autonomer Flug endete: Pilot, gelandet, Akku, Besitzer offline, außer Reichweite, gestoppt, Zeit abgelaufen, Fehler, ersetzt.' },
  AutonomyOptions: { en: 'Options of an autonomous flight: id, OSD label, longest duration and an optional take-off height of 1–30 m (since 1.7).', de: 'Optionen eines autonomen Flugs: Id, OSD-Anzeige, längste Dauer und eine optionale Starthöhe von 1–30 m (seit 1.7).' },
  AutonomyRequest: { en: 'A flight assist with its options, returned by an exit handler to keep a mission going.', de: 'Eine Flughilfe mit ihren Optionen, die ein Übergabe-Handler zurückgibt, damit eine Mission weiterläuft.' },
  AutonomyResult: { en: 'Answer to starting an autonomous flight: started, no budget, piloted, not ready, denied or not armable.', de: 'Antwort auf den Start eines autonomen Flugs: gestartet, kein Kontingent, wird geflogen, nicht bereit, verweigert oder nicht scharfschaltbar.' },
  BlockContact: { en: 'A drone touching a block: position, state, side, normal and impact speed; restitution, grip and how much the impact counts can be changed (since 1.7).', de: 'Eine Drohne berührt einen Block: Position, Zustand, Seite, Normale und Aufpralltempo; Rückprall, Haftung und wie stark der Aufprall zählt, sind änderbar (seit 1.7).' },
  CameraPose: { en: 'The view of a drone’s FPV camera on the server: eye, look and up direction, vertical field of view (since 1.7).', de: 'Der Blick der FPV-Kamera einer Drohne am Server: Auge, Blick- und Oben-Richtung, senkrechtes Sichtfeld (seit 1.7).' },
  CollisionFlags: { en: 'What a drone collides with: blocks, fluids, entities and snags; <code>SOLID</code> is normal flight, <code>GHOST</code> flies through everything (since 1.7).', de: 'Womit eine Drohne zusammenstößt: Blöcke, Flüssigkeiten, Entities und Hängenbleiben; <code>SOLID</code> ist normaler Flug, <code>GHOST</code> fliegt durch alles (seit 1.7).' },
  CollisionQuery: { en: 'What a collision rule gets: drone, its state, pilot, client or server side, autonomous flight, add-on switches and axes (since 1.7).', de: 'Was eine Kollisionsregel bekommt: Drohne, ihr Zustand, Pilot, Client- oder Server-Seite, autonomer Flug, Add-on-Schalter und -Achsen (seit 1.7).' },
  CollisionRule: { en: 'Decides per drone what it collides with and may change the answer of touched blocks; evaluated on client and server (since 1.7).', de: 'Entscheidet je Drohne, womit sie zusammenstößt, und darf die Antwort berührter Blöcke ändern; ausgewertet auf Client und Server (seit 1.7).' },
  DroneDataAccess: { en: 'Registers typed data keys and reads and writes them on drones and drone items (at most 2 KiB per key, 8 KiB per drone, since 1.7).', de: 'Meldet typisierte Datenschlüssel an und liest und schreibt sie an Drohnen und Drohnen-Items (höchstens 2 KiB je Schlüssel, 8 KiB je Drohne, seit 1.7).' },
  DroneDataKey: { en: 'A data key on the drone: id, codec, default value and whether it is synced to players nearby.', de: 'Ein Datenschlüssel an der Drohne: Id, Codec, Standardwert und ob er an Spieler in der Nähe abgeglichen wird.' },
  ExitHandler: { en: 'Called when the pilot leaves FPV; may hand the drone to an autonomous flight instead of the return to home (since 1.7).', de: 'Wird aufgerufen, wenn der Pilot das FPV verlässt; darf die Drohne an einen autonomen Flug übergeben statt an den Heimflug (seit 1.7).' },
  OperatorAccess: { en: 'Binds a second player as operator of a drone, who steers the gimbal with their own radio (since 1.7).', de: 'Bindet einen zweiten Spieler als Operator einer Drohne, der mit seiner eigenen Funke den Gimbal steuert (seit 1.7).' },
  DroneKnockback: { en: 'An explosion or wind charge pushing a flown drone: cause and velocity change; the scale (0–2, default 0) decides how much reaches the flight model (since 1.7).', de: 'Eine Explosion oder Windkugel stößt eine geflogene Drohne: Ursache und Geschwindigkeitsänderung; die Skala (0–2, Standard 0) bestimmt, wie viel im Flugmodell ankommt (seit 1.7).' },
  AddonAxis: { en: 'A registered analog channel of an add-on; reads its value −1 to 1 for a drone (since 1.7).', de: 'Ein angemeldeter analoger Kanal eines Add-ons; liest seinen Wert −1 bis 1 für eine Drohne (seit 1.7).' },
  AddonSwitch: { en: 'A registered switch of an add-on; reads whether it is on for a drone (since 1.7).', de: 'Ein angemeldeter Schalter eines Add-ons; liest, ob er für eine Drohne an ist (seit 1.7).' },
  AxisSpec: { en: 'An add-on axis: id, centre, key rate in degrees per second, server sync and name (since 1.7).', de: 'Eine Add-on-Achse: Id, Mitte, Tastenrate in Grad je Sekunde, Server-Abgleich und Name (seit 1.7).' },
  SwitchRegistry: { en: 'Registers add-on switches (up to 64) and axes (up to 16) and finds them by id (since 1.7).', de: 'Meldet Add-on-Schalter (bis 64) und -Achsen (bis 16) an und findet sie nach Id (seit 1.7).' },
  SwitchSpec: { en: 'An add-on switch: id, toggle or held, latching on gamepads, server sync, name and description (since 1.7).', de: 'Ein Add-on-Schalter: Id, Umschalter oder gehalten, rastend am Gamepad, Server-Abgleich, Name und Beschreibung (seit 1.7).' },
  AssistInfo: { en: 'One reason why a time counts as assisted, with subject, value and reference value.', de: 'Ein Grund, warum eine Zeit mit Flughilfe zählt, mit Gegenstand, Wert und Bezugswert.' },
  BoardEntry: { en: 'One time in a leaderboard: rank, player, time, date, frame class, lap or race, category, assist reasons and the rule set it was flown with.', de: 'Eine Zeit in einer Bestenliste: Rang, Spieler, Zeit, Datum, Rahmenklasse, Runde oder Rennen, Kategorie, Gründe für Flughilfe und der Regel-Satz, mit dem sie geflogen wurde.' },
  BoardQuery: { en: 'Which leaderboard to read: laps or races, unassisted or assisted, layout, frame class and how many entries (1–500).', de: 'Welche Bestenliste gelesen wird: Runden oder Rennen, ohne oder mit Flughilfe, Layout, Rahmenklasse und wie viele Einträge (1–500).' },
  BoardSnapshot: { en: 'An immutable snapshot of a leaderboard of a course and layout, with its entries, frame classes and race lengths.', de: 'Ein unveränderlicher Schnappschuss einer Bestenliste eines Kurses und Layouts, mit Einträgen, Rahmenklassen und Rennlängen.' },
  Category: { en: 'Leaderboard category: unassisted (clean) or assisted.', de: 'Kategorie einer Bestenliste: ohne Flughilfe (clean) oder mit Flughilfe.' },
  ChangeKind: { en: 'What changed on a course: layout, name, laps or owner.', de: 'Was sich an einem Kurs geändert hat: Layout, Name, Runden oder Besitzer.' },
  CourseChange: { en: 'A course change with its kind, the course afterwards and the archived layout, if any.', de: 'Eine Kursänderung mit Art, dem Kurs danach und dem archivierten Layout, falls es eins gibt.' },
  CourseInfo: { en: 'A race course by its course id: number, name, owner, dimension, layout, laps, elements, mode (laps or point to point), start, zones and record.', de: 'Ein Rennkurs nach seiner Kurs-Id: Nummer, Name, Besitzer, Dimension, Layout, Runden, Elemente, Modus (Runden oder Punkt zu Punkt), Start, Zonen und Rekord.' },
  CourseMode: { en: 'How a course is flown: laps or point to point.', de: 'Wie ein Kurs geflogen wird: Runden oder Punkt zu Punkt.' },
  CourseRecord: { en: 'A new course record with the previous one.', de: 'Ein neuer Kursrekord samt dem vorherigen.' },
  DeletedCourse: { en: 'A deleted course: id, number, name, dimension.', de: 'Ein gelöschter Kurs: Id, Nummer, Name, Dimension.' },
  LapResult: { en: 'A finished lap: course, player, lap number, time, frame class, category and assist reasons.', de: 'Eine beendete Runde: Kurs, Spieler, Rundennummer, Zeit, Rahmenklasse, Kategorie und Gründe für Flughilfe.' },
  PersonalBest: { en: 'A new personal best of a player on a course, with the previous time.', de: 'Eine neue persönliche Bestzeit eines Spielers auf einem Kurs, mit der vorherigen Zeit.' },
  RaceData: { en: 'Read-only race data on the server thread: courses, a course by id or number, leaderboards and the race standard (since 1.7).', de: 'Lesende Renndaten am Server-Thread: Kurse, ein Kurs nach Id oder Nummer, Bestenlisten und der Rennstandard (seit 1.7).' },
  RaceEvents: { en: 'Race events on the server thread: lap completed, race finished, personal best, course record, course created, changed and deleted (since 1.7).', de: 'Renn-Events am Server-Thread: Runde beendet, Rennen beendet, persönliche Bestzeit, Kursrekord, Kurs angelegt, geändert und gelöscht (seit 1.7).' },
  RaceResult: { en: 'A finished race: course, player, laps, time, frame class, category and assist reasons.', de: 'Ein beendetes Rennen: Kurs, Spieler, Runden, Zeit, Rahmenklasse, Kategorie und Gründe für Flughilfe.' },
  RaceStandardInfo: { en: 'The race standard of a world: values of the race-relevant rules, the neutral rules and the last change.', de: 'Der Rennstandard einer Welt: Werte der rennrelevanten Regeln, die neutralen Regeln und die letzte Änderung.' },
  RuleValue: { en: 'One value of the rule set of a time: rule, value, zone (0 = world) and whether that zone is race-legal.', de: 'Ein Wert aus dem Regel-Satz einer Zeit: Regel, Wert, Zone (0 = Welt) und ob die Zone rennfrei ist.' },
  TimeKind: { en: 'A time of one lap or of a whole race.', de: 'Eine Zeit einer Runde oder eines ganzen Rennens.' },
  ZoneHint: { en: 'The zones a course crosses and whether they are race-legal or count as assisted.', de: 'Die Zonen, durch die ein Kurs führt, und ob sie rennfrei sind oder als Flughilfe zählen.' },
  ShareCodes: { en: 'Reads (PW1, PW2, PW3), writes (PW3) and converts share codes; data only, applying goes through the server-checked import (since 1.7).', de: 'Liest (PW1, PW2, PW3), schreibt (PW3) und rechnet Sharecodes um; nur Daten, übernommen wird über den vom Server geprüften Import (seit 1.7).' },
  ShareOptions: { en: 'What a written code carries: layers (parts, paint, tune, OSD, name), add-on name and link, OSD layout.', de: 'Was ein geschriebener Code trägt: Ebenen (Teile, Lack, Tuning, OSD, Name), Name und Link von Add-ons, OSD-Layout.' },
  ShareResult: { en: 'Result of reading a code: status, format, build, OSD layout, per namespace installed and needed version with link, unknown parts and the converted code.', de: 'Ergebnis beim Lesen eines Codes: Status, Format, Bauplan, OSD-Layout, je Namensraum installierte und nötige Version mit Link, unbekannte Teile und der umgerechnete Code.' },
  ShareTableCheck: { en: 'Checks, extends, freezes and creates the part table of an add-on for share codes, from the build or JUnit (MIT, only needs Gson).', de: 'Prüft, erweitert, friert ein und legt die Teile-Tabelle eines Add-ons für Sharecodes an, aus dem Build oder JUnit (MIT, braucht nur Gson).' },
  WorldRule: { en: 'A registered world rule of an add-on: id, type, default, range and its value in a level (since 1.7).', de: 'Eine angemeldete Welt-Regel eines Add-ons: Id, Typ, Standard, Bereich und ihr Wert in einem Level (seit 1.7).' },
  WorldRules: { en: 'Registers on/off and number world rules of an add-on, sets their values in the presets and marks them race-neutral (since 1.7).', de: 'Meldet Schalter- und Zahlen-Welt-Regeln eines Add-ons an, setzt ihre Werte in den Voreinstellungen und markiert sie als neutral fürs Rennen (seit 1.7).' },
  AutonomyNotReady: { en: 'Why Propwash refuses to hand a drone over to an autonomous flight right now: not resting on the ground, no take-off, an empty battery when handed over in the air, or the drone is gone.', de: 'Warum Propwash eine Drohne gerade nicht an einen autonomen Flug übergibt: nicht ruhig am Boden, kein Abheben, leerer Akku bei Übergabe in der Luft oder die Drohne ist weg.' },
  CameraChunkSupply: { en: 'Server side of the chunks around a camera drone far away from its player (since 1.7): open, close and read them per player and drone, at most 8 chunks radius, 2 drones per player and 128 chunks away.', de: 'Serverseite der Chunks um eine Kamera-Drohne weit weg von ihrem Spieler (seit 1.7): je Spieler und Drohne öffnen, schließen und lesen, höchstens 8 Chunks Radius, 2 Drohnen je Spieler und 128 Chunks Entfernung.' },
  CameraChunkRequests: { en: 'Client side of the chunks around a camera drone (since 1.7): asks the server for the chunks around a drone, releases them and reads the granted radius and the server’s answer.', de: 'Clientseite der Chunks um eine Kamera-Drohne (seit 1.7): fragt den Server nach den Chunks um eine Drohne, gibt sie frei und liest den gewährten Radius und die Antwort des Servers.' },
  CameraChunkResult: { en: 'The answer to a request for chunks around a camera drone: opened or updated with the granted radius, or the reason it was refused.', de: 'Die Antwort auf eine Anfrage nach Chunks um eine Kamera-Drohne: geöffnet oder angepasst mit dem gewährten Radius, oder der Grund der Ablehnung.' },
  CameraChunkStatus: { en: 'State of the chunks around one camera drone: centre, requested and granted radius, paused or not, and how many chunks are loaded and sent.', de: 'Stand der Chunks um eine Kamera-Drohne: Mitte, gewünschter und gewährter Radius, pausiert oder nicht, und wie viele Chunks geladen und gesendet sind.' },
  AntennaCap: { en: 'The cap at the tip of a VTX antenna: whip, stubby, lollipop, pagoda or patch, with its key in part files.', de: 'Die Kappe an der Spitze einer VTX-Antenne: Whip, Stubby, Lollipop, Pagoda oder Patch, mit ihrem Schlüssel in Teile-Dateien.' },
  VideoAntenna: { en: 'The antennas of a VTX: count (0 to 2), length in mm (10 to 250) and cap; <code>none()</code> for a VTX without external antennas. Without it Propwash derives them from the VTX data.', de: 'Die Antennen eines VTX: Anzahl (0 bis 2), Länge in mm (10 bis 250) und Kappe; <code>none()</code> für einen VTX ohne externe Antennen. Ohne Angabe leitet Propwash sie aus den VTX-Daten ab.' },
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
