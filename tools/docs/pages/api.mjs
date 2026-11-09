// Add-on API guide: how a third-party mod extends Propwash FPV through the public API (package
// de.lardtom.propwash.api). Condensed from docs/api/addon-guide.md of the Propwash repository; versions, the event list
// and the API history check come from the extracted data.

import { L, P, esc, list, note, section, table, code, h3, mono, SHIELD, SOURCE, CURSEFORGE, markdownBlocks, inlineMarkdown, markdownShape } from '../html.mjs';

export const LICENSE_NOTE = {
  en: 'From Propwash 0.5.0 on, the add-on API (<code>de.lardtom.propwash.api</code> and its subpackages), the example add-on and the documentation are under the <strong>MIT License</strong>: your add-on may use them freely, copy from them and have any license of its own. The rest of Propwash is source-available under the <strong><a href="' + SHIELD + '" target="_blank" rel="noopener">PolyForm Shield License 1.0.0</a></strong> with additional permissions: whoever takes code from it passes on the license with its <em>Required Notice</em> line and must not use it to compete with Propwash. <a href="' + SOURCE + '/blob/main/LICENSE-MIT" target="_blank" rel="noopener"><code>LICENSE-MIT</code></a> lists the exact files; the texts in <a href="' + SOURCE + '/blob/main/LICENSE" target="_blank" rel="noopener"><code>LICENSE</code></a>, <code>LICENSE-MIT</code> and <a href="' + SOURCE + '/blob/main/NOTICE" target="_blank" rel="noopener"><code>NOTICE</code></a> in the <a href="' + SOURCE + '" target="_blank" rel="noopener">source repository</a> are binding. Propwash 0.4.0 and older stay All Rights Reserved.',
  de: 'Ab Propwash 0.5.0 stehen die Add-on-API (<code>de.lardtom.propwash.api</code> samt Unterpaketen), das Beispiel-Add-on und die Doku unter der <strong>MIT-Lizenz</strong>: Dein Add-on darf sie frei benutzen, daraus kopieren und selbst jede Lizenz haben. Der übrige Propwash-Code ist unter der <strong><a href="' + SHIELD + '" target="_blank" rel="noopener">PolyForm Shield License 1.0.0</a></strong> mit Zusatzrechten einsehbar: Wer daraus etwas übernimmt, gibt die Lizenz samt der Zeile <em>Required Notice</em> mit und darf damit nicht mit Propwash konkurrieren. <a href="' + SOURCE + '/blob/main/LICENSE-MIT" target="_blank" rel="noopener"><code>LICENSE-MIT</code></a> nennt die genauen Dateien; verbindlich sind die Texte in <a href="' + SOURCE + '/blob/main/LICENSE" target="_blank" rel="noopener"><code>LICENSE</code></a>, <code>LICENSE-MIT</code> und <a href="' + SOURCE + '/blob/main/NOTICE" target="_blank" rel="noopener"><code>NOTICE</code></a> im <a href="' + SOURCE + '" target="_blank" rel="noopener">Quellcode-Repository</a>. Propwash 0.4.0 und älter bleiben All Rights Reserved.',
};

export const EVENT_INFO = {
  PART_REGISTERED: { thread: { en: 'init thread of the registering mod', de: 'Init-Thread des anmeldenden Mods' }, when: { en: 'after every part an add-on registers (Java or JSON)', de: 'nach jedem Teil, das ein Add-on anmeldet (Java oder JSON)' } },
  REGISTRY_FROZEN: { thread: { en: 'init or main thread', de: 'Init- oder Hauptthread' }, when: { en: 'exactly once, when the part registry freezes', de: 'genau einmal, wenn das Teile-Register einfriert' } },
  DRONE_ASSEMBLED: { thread: { en: 'server', de: 'Server' }, when: { en: 'a drone was taken out of the workbench output', de: 'eine Drohne wurde aus dem Werkbank-Ausgang genommen' } },
  DRONE_DISASSEMBLED: { thread: { en: 'server', de: 'Server' }, when: { en: 'a drone was taken apart in the workbench', de: 'eine Drohne wurde in der Werkbank zerlegt' } },
  BUILD_IMPORTED: { thread: { en: 'server', de: 'Server' }, when: { en: 'after every import request, also rejected ones', de: 'nach jeder Import-Anfrage, auch abgelehnten' } },
  ESC_BURNED: { thread: { en: 'server', de: 'Server' }, when: { en: 'the ESC of a flown drone burned out because the battery has more cells than the stack takes (only with crash damage on)', de: 'der ESC einer geflogenen Drohne ist durchgebrannt, weil der Akku mehr Zellen hat, als der Stack verträgt (nur mit Crash-Schaden an)' } },
  DRONE_HIT_ENTITY: { thread: { en: 'server', de: 'Server' }, when: { en: 'a flown drone hits a living entity and the game rules allow it; damage and knockback can be changed (since 1.6)', de: 'eine geflogene Drohne trifft ein Lebewesen und die Spielregeln erlauben es; Schaden und Rückstoß sind änderbar (seit 1.6)' } },
  DRONE_DAMAGED: { thread: { en: 'server', de: 'Server' }, when: { en: 'a drone takes damage from mobs, projectiles, explosions or players; the amount can be changed or the damage cancelled (since 1.6)', de: 'eine Drohne nimmt Schaden durch Mobs, Geschosse, Explosionen oder Spieler; die Menge ist änderbar, der Schaden abbrechbar (seit 1.6)' } },
  ACCESSORY_ACTION: { thread: { en: 'server', de: 'Server' }, when: { en: 'the pilot presses or releases accessory action 1–4 (checked by the server, since 1.6)', de: 'der Pilot drückt oder lässt Zubehör-Aktion 1–4 los (vom Server geprüft, seit 1.6)' } },
  ADDON_SWITCH_CHANGED: { thread: { en: 'server', de: 'Server' }, when: { en: 'an add-on switch with <code>serverSync</code> changes, also in the full sync at the start of a pilot session (since 1.7)', de: 'ein Add-on-Schalter mit <code>serverSync</code> wechselt, auch beim vollständigen Abgleich zu Beginn einer Pilotensitzung (seit 1.7)' } },
  DRONE_KNOCKBACK: { thread: { en: 'server', de: 'Server' }, when: { en: 'an explosion or a wind charge pushes a flown drone; the push only reaches the flight model when a listener sets a scale of up to 2 (default 0), or <code>cancel()</code> drops it (since 1.7)', de: 'eine Explosion oder Windkugel stößt eine geflogene Drohne; der Stoß wirkt im Flugmodell nur, wenn ein Listener eine Skala bis 2 setzt (Standard 0), <code>cancel()</code> verwirft ihn (seit 1.7)' } },
  AUTONOMY_ENDED: { thread: { en: 'server', de: 'Server' }, when: { en: 'an autonomous flight of an add-on ended, with the reason: pilot, landed, battery, owner offline, out of range, stopped, timeout, error or replaced (since 1.7)', de: 'ein autonomer Flug eines Add-ons ist zu Ende, mit Grund: Pilot, gelandet, Akku, Besitzer offline, außer Reichweite, gestoppt, Zeit abgelaufen, Fehler oder ersetzt (seit 1.7)' } },
  PILOT_CHANGED: { thread: { en: 'server', de: 'Server' }, when: { en: 'a drone gets a pilot, loses its pilot or changes from one pilot to another (since 1.7)', de: 'eine Drohne bekommt einen Piloten, verliert ihn oder wechselt von einem Piloten zum anderen (seit 1.7)' } },
};

// Notes after a key in the list of build problems and warnings (the keys themselves come from DroneBuild through
// tools/docs/data/parts.json); tools/test-docs.mjs checks that every note belongs to a key DroneBuild still checks.
export const ISSUE_NOTES = {
  accessory_frame: { en: 'since 1.7: an accessory with <code>frames</code> on another frame', de: 'seit 1.7: Zubehör mit <code>frames</code> an einem anderen Rahmen' },
};

function issueList(keys, lang) {
  return keys.map((k) => `<code>${k}</code>${ISSUE_NOTES[k] ? ` (${ISSUE_NOTES[k][lang]})` : ''}`).join(', ');
}

export const API_HISTORY = [
  { version: '1.0', text: { en: 'Parts in Java or JSON, items, presets, builds, paint, tune groups, OSD layouts, server-checked import, events, workbench buttons with child screens, configurator tabs, Flight School scenes.', de: 'Teile in Java oder JSON, Items, Presets, Baupläne, Lack, Tuning-Gruppen, OSD-Layouts, vom Server geprüfter Import, Events, Werkbank-Knöpfe mit Unterfenstern, Konfigurator-Tabs, Flugschul-Szenen.' } },
  { version: '1.1', text: { en: '<code>BuildAccess#cameraView(spec)</code>: the FPV camera and prop discs as Propwash draws them.', de: '<code>BuildAccess#cameraView(spec)</code>: FPV-Kamera und Prop-Scheiben, wie Propwash sie zeichnet.' } },
  { version: '1.2', text: { en: 'A creative tab per add-on (<code>PropwashApi.extensionTab(ns)</code>), <code>power_w</code> and <code>usable_fraction</code> for the energy model, all flight times in <code>BuildStats</code>.', de: 'Ein Kreativ-Tab je Add-on (<code>PropwashApi.extensionTab(ns)</code>), <code>power_w</code> und <code>usable_fraction</code> für das Energiemodell, alle Flugzeiten in <code>BuildStats</code>.' } },
  { version: '1.3', text: { en: 'Flight School links for items of any namespace (<code>linkFlightSchoolItems</code>, <code>linkFlightSchoolParts</code>, <code>FlightSchoolScenes</code>).', de: 'Flugschul-Verknüpfungen für Items jedes Namensraums (<code>linkFlightSchoolItems</code>, <code>linkFlightSchoolParts</code>, <code>FlightSchoolScenes</code>).' } },
  { version: '1.4', text: { en: 'Chest loot without loader code (<code>PropwashApi.loot()</code>), rarity in JSON, more analysis figures, <code>ESC_BURNED</code>, part condition and paint cost, batteries with partial charge, the <code>NAME</code> import layer and new drones from the client, Propwash’s own JSON codec, language texts on the server, workbench header space and icon buttons, camera field of view from <code>camera_fov_deg</code> and the uptilt range of the camera mount.', de: 'Truhen-Beute ohne Loader-Code (<code>PropwashApi.loot()</code>), Seltenheit im JSON, mehr Analysewerte, <code>ESC_BURNED</code>, Teilezustand und Lackkosten, Akkus mit Teilladung, Import-Ebene <code>NAME</code> und neue Drohnen vom Client, Propwashs eigener JSON-Codec, Sprachtexte auf dem Server, Platz im Werkbank-Kopf und Symbol-Knöpfe, Kamera-Sichtfeld aus <code>camera_fov_deg</code> und der Uptilt-Bereich des Kamerahalters.' } },
  { version: '1.5', text: { en: 'Three new built-in Flight School lessons for item links: <code>FlightSchoolScenes.TRICKS</code> (freestyle tricks, after <code>RACE</code>), <code>FlightSchoolScenes.GRIPPER</code> (gripper, after <code>ACTION_CAM</code>) and <code>FlightSchoolScenes.MODE_3D</code> (3D mode, after <code>HOLD</code>), all in <code>FlightSchoolScenes.ALL</code>. Props can declare their reverse thrust for 3D mode: <code>PropDefinition#reverseThrust()</code>, builder <code>reverseThrust(r)</code>, JSON <code>reverse_thrust</code>.', de: 'Drei neue eingebaute Flugschul-Lektionen für Item-Verknüpfungen: <code>FlightSchoolScenes.TRICKS</code> (Freestyle-Tricks, nach <code>RACE</code>), <code>FlightSchoolScenes.GRIPPER</code> (Greifer, nach <code>ACTION_CAM</code>) und <code>FlightSchoolScenes.MODE_3D</code> (3D-Modus, nach <code>HOLD</code>), alle in <code>FlightSchoolScenes.ALL</code>. Props können ihren Umkehrschub für den 3D-Modus angeben: <code>PropDefinition#reverseThrust()</code>, Builder <code>reverseThrust(r)</code>, JSON <code>reverse_thrust</code>.' } },
  { version: '1.6', text: { en: 'Building blocks for the add-ons <em>Mob Defense</em> and a cinematic camera drone: the front accessory mount (<code>AccessorySlot.FRONT</code>), accessory behaviours with synchronised inventories and accessory actions 1–4 (<code>PropwashApi.accessories()</code>), drone queries, impulses and pushes (<code>PropwashApi.drones()</code>), flight assists and force providers inside the flight model (<code>PropwashApi.flight()</code>), the events <code>DRONE_HIT_ENTITY</code>, <code>DRONE_DAMAGED</code> and <code>ACCESSORY_ACTION</code>, and on the client HUD elements, gimbal cameras and input (<code>registerHudElement</code>, <code>registerGimbal</code>, <code>input()</code>). Network protocol 16. Behaviour: an add-on flight assist that outputs anything makes a race lap an assisted lap (reason <code>other</code> with the assist’s id), forces from <code>registerForces</code> do not; the <em>Accessories</em> window never takes shulker boxes or drone items with accessory contents of their own; a release reaches <code>onAction</code> only while the action is held.', de: 'Bausteine für die Add-ons <em>Mob Defense</em> und eine Kino-Drohne: die Zubehör-Halterung vorne (<code>AccessorySlot.FRONT</code>), Zubehör-Verhalten mit synchronisierten Inventaren und Zubehör-Aktionen 1–4 (<code>PropwashApi.accessories()</code>), Drohnen-Abfragen, Stöße und Schübe (<code>PropwashApi.drones()</code>), Flughilfen und Kräfte im Flugmodell (<code>PropwashApi.flight()</code>), die Events <code>DRONE_HIT_ENTITY</code>, <code>DRONE_DAMAGED</code> und <code>ACCESSORY_ACTION</code> und im Client HUD-Elemente, Gimbal-Kameras und Eingaben (<code>registerHudElement</code>, <code>registerGimbal</code>, <code>input()</code>). Netzprotokoll 16. Verhalten: Eine Flughilfe eines Add-ons, die etwas ausgibt, macht eine Rennrunde zur Runde mit Flughilfe (Grund <code>other</code> mit der Id der Flughilfe), Kräfte aus <code>registerForces</code> nicht; das Fenster <em>Zubehör</em> nimmt nie Shulkerkisten oder Drohnen-Items mit eigenem Zubehör-Inhalt an; ein Loslassen erreicht <code>onAction</code> nur, solange die Aktion gehalten ist.' } },
  { version: '1.7', text: { en: 'Comes with Propwash 0.6.0 (network protocol 19). Switch functions and analog axes of add-ons, assigned like built-in ones on the <em>Add-ons</em> page of the <em>Modes</em> tab (<code>PropwashApi.switches()</code>), names for accessory actions, OSD elements and warnings (<code>registerOsdElement</code>, <code>registerOsdWarning</code>), collision rules decided on the server (<code>DroneAccess#registerCollisionRule</code>), accessories that dispense like a dispenser and show what they hold, the knockback event <code>DRONE_KNOCKBACK</code>, world rules of add-ons (<code>PropwashApi.worldRules()</code>), data stored on the drone (<code>PropwashApi.droneData()</code>), autonomous flights on the server, a second operator for the gimbal, gimbal recording and live view, buttons in the service screen, compass readings in <code>FlightState</code>, LED paths, straight-hanging accessories, a muzzle point and accessories that only fit certain frames (<code>led_path</code>, <code>hangs_straight</code>, <code>muzzle_mm</code>, <code>frames</code> with the build problem <code>accessory_frame</code>), share codes that belong to Propwash (<code>PropwashApi.shareCodes()</code>, a part table per add-on) and read-only race data by course id (<code>PropwashApi.race()</code>, <code>RaceEvents</code>). The namespace <code>propwash</code> is reserved: new registrations under it are refused. Every method added to a 1.6 interface is a default method, so add-ons built for 1.6 keep working.', de: 'Kommt mit Propwash 0.6.0 (Netzprotokoll 19). Schalterfunktionen und analoge Achsen von Add-ons, belegt wie eingebaute auf der Seite <em>Add-ons</em> im Tab <em>Modi</em> (<code>PropwashApi.switches()</code>), Namen für Zubehör-Aktionen, OSD-Elemente und -Warnungen (<code>registerOsdElement</code>, <code>registerOsdWarning</code>), Kollisionsregeln mit Entscheidung am Server (<code>DroneAccess#registerCollisionRule</code>), Zubehör, das wie ein Werfer abgibt und zeigt, was es trägt, das Stoß-Event <code>DRONE_KNOCKBACK</code>, Welt-Regeln von Add-ons (<code>PropwashApi.worldRules()</code>), Daten an der Drohne (<code>PropwashApi.droneData()</code>), autonome Flüge am Server, ein zweiter Operator für den Gimbal, Gimbal in Aufnahme und Livebild, Knöpfe in der Wartung, Kompasswerte im <code>FlightState</code>, LED-Pfade, gerade hängendes Zubehör, eine Mündung und Zubehör nur für bestimmte Rahmen (<code>led_path</code>, <code>hangs_straight</code>, <code>muzzle_mm</code>, <code>frames</code> mit dem Bauproblem <code>accessory_frame</code>), Sharecodes, die Propwash gehören (<code>PropwashApi.shareCodes()</code>, eine Teile-Tabelle je Add-on), und lesende Renndaten nach Kurs-Id (<code>PropwashApi.race()</code>, <code>RaceEvents</code>). Der Namensraum <code>propwash</code> ist reserviert: Neue Anmeldungen darunter werden abgelehnt. Jede neue Methode an einem Interface aus 1.6 ist eine Default-Methode, für 1.6 gebaute Add-ons laufen also weiter.' } },
  { version: '1.8', text: { en: 'Also in Propwash 0.6.0, only additions: cargo at the gripper on the server (<code>AccessoryRegistry#grabCargo</code>, <code>#releaseCargo</code>, <code>#cargo</code>) – it grabs without a pilot too, for example at the waypoints of a flight planner – and recessed accessories (<code>AccessoryDefinition#recessMm()</code>, <code>#dropMm()</code>, JSON <code>recess_mm</code> and <code>drop_mm</code>) that sit further back or lower than their anchor. Check with <code>requireVersion(modId, "1.8")</code>; add-ons using only 1.7 run unchanged.', de: 'Ebenfalls in Propwash 0.6.0, nur Ergänzungen: Fracht am Greifer am Server (<code>AccessoryRegistry#grabCargo</code>, <code>#releaseCargo</code>, <code>#cargo</code>) – er greift auch ohne Pilot, etwa an den Wegpunkten eines Flugplaners – und eingerücktes Zubehör (<code>AccessoryDefinition#recessMm()</code>, <code>#dropMm()</code>, JSON <code>recess_mm</code> und <code>drop_mm</code>), das weiter hinten oder tiefer als sein Anker sitzt. Prüfen mit <code>requireVersion(modId, "1.8")</code>; Add-ons, die nur 1.7 nutzen, laufen unverändert.' } },
];

// The rules for add-ons: the English text is ADDONS.md of the Propwash repository (read by tools/docs/extract.mjs into
// tools/docs/data/addons.json), the German one is written here block by block in the same shape. `source` is the hash
// of the ADDONS.md this translation follows; tools/test-docs.mjs fails as soon as ADDONS.md changes until the German
// text is updated and the hash with it.
export const ADDON_RULES_DE = {
  source: 'aececdec20168c0d0ace41f482ffd4828aa7974711fe428762074b82e3b522a0',
  markdown: `# Add-ons für Propwash bauen

Jeder darf Add-ons für Propwash bauen. Die Add-on-API, das Beispiel-Add-on und die Dokumentation stehen unter der MIT-Lizenz, und dein eigener Code darf jede Lizenz haben, die du möchtest. Damit Add-ons nebeneinander und mit künftigen Propwash-Versionen funktionieren, halte dich bitte an diese Regeln.

**1. Nimm deinen eigenen Namensraum – \`propwash\` ist reserviert.**
Nimm deine Mod-Id als Namensraum für alles, was dein Add-on hinzufügt:
- Registry-Ids: Items, Blöcke, Entities, Teile, Sounds
- Übersetzungsschlüssel: \`<modid>.…\` und \`key.<modid>.…\`
- Tastenbelegungen und ihre Kategorie
- Spielregeln und Befehle
- Netzwerk-Pakete
- Daten- und Asset-Pfade
- Schlüssel für NBT und Data Components
- Konfigurationsdateien

Der Namensraum \`propwash\` und das Java-Paket \`de.lardtom.propwash\` gehören allein Propwash. Auch offizielle Add-ons nutzen ihren eigenen Namensraum, zum Beispiel \`justmoreparts\`.

Warum das wichtig ist:
- Alles, was du in \`propwash\` ablegst, kann ohne Vorwarnung mit einer künftigen Propwash-Version zusammenstoßen, und dann geht dein Add-on oder Propwash kaputt.
- Ab Propwash 0.6.0 erkennen Sharecodes jedes Teil an seinem Namensraum. Ein Teil, das unter einem fremden Namensraum angemeldet ist, macht jeden Code kaputt, in dem es steckt.

**2. Nur die API ist stabil.**
- Stabil ist nur \`de.lardtom.propwash.api\`. Sie ist mit \`API_VERSION\` (SemVer) versioniert, und inkompatible Änderungen kommen nur mit einer neuen Hauptversion.
- Alles andere ist intern und kann sich in jeder Version ändern, auch in Patch-Versionen.
- Mixins in interne Klassen sind erlaubt, aber auf eigenes Risiko. Abstürze durch Add-ons werden nicht unterstützt. Prüf bitte, ob ein Problem auch ohne Add-ons auftritt, bevor du es meldest.

**3. Fehlt dir etwas? Frag danach.**
Fehlt der API ein Haken, den du brauchst, öffne ein Issue oder frag im Discord, statt ihn mit einem Mixin zu umgehen. Lücken werden geschlossen, zum Beispiel eigene Schalterfunktionen, OSD-Elemente, Kollisions-Haken, Zubehör, das nur an bestimmte Rahmen passt (\`frames\` in der Teile-Datei, API 1.7), die Neigungsgrenze, die Spieler im Tab PID einstellen (\`FlightState#angleLimitDeg()\` und \`DroneView#angleLimitDeg()\`, API 1.7), und eine von der FPV-Kamera getrennte Gimbal-Kamera ohne Props im Gimbal-Bild, mit eigener Ausrichtung und Brennweite für den Flashback-Kamerapfad (\`GimbalProvider#showsProps\`, \`#gimbalRotation\` und \`#gimbalFovDegrees\`, API 1.7). Dasselbe gilt für Chunks um eine Kamera-Drohne weit weg vom Spieler, damit Flashback ihre Umgebung aufnimmt, ohne dass sich die Sicht des Spielers ändert (\`DroneAccess#cameraChunks()\` und \`PropwashClientApi.cameraChunks()\`, API 1.7).

**4. Namen.**
- „Propwash: …“ ist das Namensschema der offiziellen Add-ons: *Propwash: Just More Parts*.
- Nenn deins bitte „*Name* for Propwash“, zum Beispiel *Noclip for Propwash*, und stell es nicht als offiziell dar: kein Propwash-Logo als Symbol und kein „offiziell“ in der Beschreibung.

**5. Lizenz in Kürze.**
- Der Kern von Propwash steht unter der PolyForm Shield License 1.0.0 mit Ergänzungen; API, Beispiel-Add-on und Doku stehen unter MIT.
- **In Ordnung:**
  - von Propwash abhängen
  - die API benutzen
  - Mixins mit \`@Shadow\`-Signaturen
  - eine eigene Lizenz für deinen eigenen Code
- **Nicht in Ordnung:**
  - Kern-Code in dein Add-on kopieren
  - Propwash in deinem Jar mitliefern
  - aus dem Code von Propwash eine konkurrierende Drohnen-Mod bauen
- Verbindlich sind die Texte \`LICENSE\`, \`LICENSE-MIT\` und \`NOTICE\`. Diese Seite ist eine Richtlinie und ändert sie nicht.

## Renndaten für Server und Bots

Zum Lesen von Rennergebnissen braucht es kein Mixin. Ab Propwash 0.6.0 hat jeder Rennkurs eine feste Kurs-Id, und an ihr hängen seine Bestenlisten. Eine Mod liest Kurse und Bestenlisten über die lesende API \`de.lardtom.propwash.api.race\` (\`PropwashApi.race()\`) und hört auf \`RaceEvents\` (Runden, Rennen, persönliche Bestzeiten, Kursrekorde, Kursänderungen). Ohne Mod lesen Server-Skripte und Bots dieselben Daten als JSON-Dateien im Weltordner unter \`propwash/race-data/\`.

## Teile recyceln

Ab Propwash 0.6.0 hat die Drohnen-Werkbank einen Tab Recyceln. Er macht aus einem Teil wieder die Zutaten des Crafting-Rezepts, das es herstellt, geteilt durch die Ergebnis-Anzahl des Rezepts. Ein normales Crafting-Rezept für dein Teil ist also alles, was du brauchst.

- Die Ausbeute hängt vom Zustand des Teils ab, und Propwash legt sie für jedes Teil fest: 100 % gibt alle Materialien zurück, 60–99 % die Hälfte, unter 60 % (auch kaputt) ein Viertel. Add-ons können diese Stufen nicht ändern.
- Nur Teile ohne Crafting-Rezept nutzen \`recycle\` in der Teile-Datei (\`RecycleYield\` in \`PartBasics\`). Item und Anzahl sind das, was das Teil bei 100 % Zustand zurückgibt; die Stufen oben gelten weiter. \`"none"\` macht so ein Teil nicht recycelbar, und ohne \`recycle\` gilt der Standard der Kategorie (Rahmen → Carbonplatte, Stack und Video → Platine, Motor → Kupferspule, Akku → LiPo-Zelle, Props und Zubehör → nichts).
- Details: [\`docs/api/addon-guide.md\`](docs/api/addon-guide.md), Abschnitt 8.

## VTX-Antennen

Ab Propwash 0.6.0 sitzen die Antennen eines Videosenders hinten am Rahmen, schräg nach oben und hinten, und drehen nicht mehr mit dem Kamerawinkel mit. Anzahl, Länge und Kappe der Antennen leitet Propwash aus den VTX-Daten ab, die du schon hast (Videosystem, Masse, Latenz, Bildqualität, Leistung, Reichweite); dein Add-on braucht also keine Änderung. Elemente in einem VTX-Modell, deren Name mit \`antenna\` beginnt (\`antenna\`, \`antenna_tip\`, \`antenna_socket\`, \`antenna_tee\`, \`antenna_joint\`, \`antenna_lead\`), lässt die Drohne weg, damit sie nie zwei Sätze Antennen zeigt.

- Rahmen dürfen ihren Antennenhalter nennen: \`"antenna_anchor": {"pos": [x, y, z], "tilt_deg": 45}\` in der Teile-Datei oder \`FrameDefinition.Builder#antennaAnchor(AnchorSpec)\` (Fuß der Antennen in mm: mittig, auf Höhe der Deckplatte, hinter der Hinterkante des Rahmens und hinter dem Akku; der TPU-Halter reicht nach vorn bis an die Platte; Neigung nach hinten aus der Senkrechten, Standard 45°). Ohne Angabe setzt Propwash den Halter 12 mm hinter die Deckplatte. Reicht ein Akku weiter nach hinten, rücken die Antennen 5 mm hinter ihn. Antennen sind höchstens 1,2 × Radstand lang.
- Ein VTX darf seine Antennen festlegen: \`"antenna": {"count": 2, "length_mm": 95, "cap": "pagoda"}\` oder \`VideoDefinition.Builder#antenna(new VideoAntenna(2, 95.0, AntennaCap.PAGODA))\` (Kappen \`whip\`, \`stubby\`, \`lollipop\`, \`pagoda\`, \`patch\`).
- Details: [\`docs/ASSETS.md\`](docs/ASSETS.md), Abschnitt „VTX-Antennen hinten am Rahmen“.

## Kompatibilität

- Propwash 0.6.0 braucht *Propwash: Just More Parts* 1.2.0 oder neuer. Just More Parts 1.1.x funktioniert nicht mit Propwash 0.6.0, und mit beiden startet das Spiel nicht: Fabric nennt den Konflikt auf seinem Fehlerbildschirm, NeoForge zeigt einen Ladefehler mit dem Grund „Just More Parts 1.1.x passt nicht zu Propwash 0.6.0 – bitte auf 1.2.0 aktualisieren.“ Vorabversionen von 1.2.0 laden.
- Alte Sharecodes (PW1 und PW2, auch die von Just More Parts 1.1.x) bleiben lesbar. Propwash 0.6.0 schreibt PW3.
- Braucht dein Add-on Propwash 0.6.0, gib \`"propwash": ">=0.6.0-"\` (Fabric) bzw. \`versionRange = "[0.6.0-alpha,)"\` (NeoForge) an, damit Vorabversionen von 0.6.0 zählen.

## Links

- Add-on-Handbuch: [\`docs/api/addon-guide.md\`](docs/api/addon-guide.md)
- Neu in der Add-on-API 1.7: [\`docs/addon-api-1.7.md\`](docs/addon-api-1.7.md)
- Teile-Tabellen für Sharecodes: [\`docs/sharecode/tables.md\`](docs/sharecode/tables.md)
- Renndaten für Server und Bots: [\`docs/api/race-data.md\`](docs/api/race-data.md)
- Website: [propwashfpv.com/docs/api](https://propwashfpv.com/docs/api/)
- Fehler melden: [Issue-Formular](https://github.com/LardTom/propwash-fpv/issues/new?template=bug_report.yml)
`,
};

// The website never names the deferred server add-on (tools/test-platforms.mjs, decision E20 of the 0.6.0 design), so
// this one clause of ADDONS.md is shortened on the page; the test fails when ADDONS.md no longer contains it.
export const ADDON_RULES_SITE_EDITS = [
  ['There is no server add-on, and reading race results needs no mixin.', 'Reading race results needs no mixin.'],
];

function siteRules(markdown) {
  return ADDON_RULES_SITE_EDITS.reduce((text, [from, to]) => text.split(from).join(to), markdown);
}

// Links in ADDONS.md point into the Propwash repository; on the site they lead to the source repository, the summary
// of API 1.7 to its section on this page.
function rulesLink(target) {
  if (/^https?:/.test(target) || target.startsWith('#')) return target;
  if (target === 'docs/addon-api-1.7.md') return '#api-17';
  return `${SOURCE}/blob/main/${target.replace(/^\.\//, '')}`;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function addonRulesProblem(addons) {
  if (!addons) return 'tools/docs/data/addons.json fehlt – mit einem Propwash-Quellbaum extrahieren';
  if (addons.sha256 !== ADDON_RULES_DE.source) {
    return `ADDONS.md hat sich geändert (${addons.sha256.slice(0, 12)} statt ${ADDON_RULES_DE.source.slice(0, 12)}): deutsche Fassung ADDON_RULES_DE in tools/docs/pages/api.mjs nachziehen und source setzen`;
  }
  const stale = ADDON_RULES_SITE_EDITS.filter(([from]) => !addons.markdown.includes(from));
  if (stale.length) return `ADDON_RULES_SITE_EDITS: ${stale.map(([from]) => `„${from}“`).join(', ')} steht nicht mehr in ADDONS.md`;
  const en = markdownShape(markdownBlocks(siteRules(addons.markdown)));
  const de = markdownShape(markdownBlocks(ADDON_RULES_DE.markdown));
  return en === de ? null : `ADDONS.md und ADDON_RULES_DE haben einen anderen Aufbau (${en} / ${de})`;
}

export function addonRules(addons) {
  const en = markdownBlocks(siteRules(addons.markdown));
  const de = markdownBlocks(ADDON_RULES_DE.markdown);
  if (markdownShape(en) !== markdownShape(de)) throw new Error(addonRulesProblem(addons));
  const md = (t) => inlineMarkdown(t, rulesLink);
  const item = (a, b) => `<li>${L(md(a.text), md(b.text))}${a.children.length ? `\n<ul>\n${a.children.map((c, i) => `<li>${L(md(c), md(b.children[i]))}</li>`).join('\n')}\n</ul>` : ''}</li>`;
  return en.map((block, i) => {
    const other = de[i];
    if (block.type === 'title') return '';
    if (block.type === 'heading') return h3(`rules-${slug(block.text)}`, md(block.text), md(other.text));
    if (block.type === 'rule') {
      const n = /^(\d+)\./.exec(block.text);
      return h3(n ? `rules-${n[1]}` : `rules-${slug(block.text)}`, md(block.text), md(other.text));
    }
    if (block.type === 'p') return P(md(block.text), md(other.text));
    return `<ul>\n${block.items.map((it, j) => item(it, other.items[j])).join('\n')}\n</ul>`;
  }).filter(Boolean).join('\n');
}

function minor(version) {
  return version.split('.').slice(0, 2).join('.');
}

export default function apiPage(ctx) {
  const { meta, api } = ctx.data;
  const prefix = ctx.prefix;
  const mc = meta.minecraft;
  const v = meta.propwash;
  const apiMinor = minor(meta.api);
  const base = v.replace(/-.*$/, '');
  const range = { base, fabric: `${base}-`, neoforge: `${base}-alpha` };
  const toc = [
    { id: 'what', title: { en: 'What add-ons can do', de: 'Was Add-ons können' } },
    { id: 'rules', title: { en: 'Rules for add-ons', de: 'Regeln für Add-ons' } },
    { id: 'setup', title: { en: 'Project setup', de: 'Projekt aufsetzen' } },
    { id: 'lifecycle', title: { en: 'Entry points', de: 'Einstiegspunkte' } },
    { id: 'parts', title: { en: 'Parts', de: 'Bauteile' } },
    { id: 'items', title: { en: 'Items, assets, texts', de: 'Items, Assets, Texte' } },
    { id: 'presets', title: { en: 'Presets and creative tab', de: 'Presets und Kreativ-Tab' } },
    { id: 'builds', title: { en: 'Builds and import', de: 'Baupläne und Import' } },
    { id: 'share', title: { en: 'Share codes', de: 'Sharecodes' } },
    { id: 'web-configurator', title: { en: 'Your add-on in the configurator', de: 'Dein Add-on im Konfigurator' } },
    { id: 'client', title: { en: 'Client extensions', de: 'Client-Erweiterungen' } },
    { id: 'flight', title: { en: 'Accessories, flight and HUD', de: 'Zubehör, Flug und HUD' } },
    { id: 'api-17', title: { en: 'New in API 1.7', de: 'Neu in API 1.7' } },
    { id: 'events', title: { en: 'Events', de: 'Events' } },
    { id: 'versions', title: { en: 'Stability and versions', de: 'Stabilität und Versionen' } },
    { id: 'multiplayer', title: { en: 'Multiplayer', de: 'Mehrspieler' } },
    { id: 'example', title: { en: 'Example add-on', de: 'Beispiel-Add-on' } },
    { id: 'checklist', title: { en: 'Checklist', de: 'Checkliste' } },
    { id: 'license', title: { en: 'License', de: 'Lizenz' } },
  ];
  const T = Object.fromEntries(toc.map((t) => [t.id, t.title]));

  const what = section('what', T.what, `
${P('An add-on is a normal Fabric or NeoForge mod that depends on Propwash and talks to it only through the package <code>de.lardtom.propwash.api</code>. It never changes Propwash itself, and built-in parts, saves and flight behaviour stay exactly as they are. <em>Propwash: Just More Parts</em> is built this way.',
    'Ein Add-on ist ein normaler Fabric- oder NeoForge-Mod, der von Propwash abhängt und nur über das Paket <code>de.lardtom.propwash.api</code> mit ihm spricht. Propwash selbst ändert es nie; eingebaute Teile, Speicherstände und Flugverhalten bleiben genau, wie sie sind. <em>Propwash: Just More Parts</em> ist so gebaut.')}
${table([['Possible with API ' + api.version, 'Möglich mit API ' + api.version], ['Not (yet) possible', '(Noch) nicht möglich']], [
    { header: false, cells: [L('Frames, stacks, motors, props, batteries, video units and accessories, in Java or JSON', 'Rahmen, Stacks, Motoren, Props, Akkus, Videomodule und Zubehör, in Java oder JSON'), L('other motor counts than four (hexa, octo)', 'andere Motorzahlen als vier (Hexa, Okto)')] },
    { header: false, cells: [L('own arm geometry, camera position, centre of mass, ducts, drag, battery rules per frame', 'eigene Arm-Geometrie, Kameraposition, Schwerpunkt, Ducts, Luftwiderstand, Akku-Regeln je Rahmen'), L('new video systems or goggles (only <code>analog</code> and <code>digital</code>)', 'neue Videosysteme oder Brillen (nur <code>analog</code> und <code>digital</code>)')] },
    { header: false, cells: [L('new motor and stack mounts, prop mounts, cell chemistries up to 12S', 'neue Motor- und Stack-Halterungen, Prop-Aufnahmen, Zellchemien bis 12S'), L('parts from world data packs or <code>/reload</code>', 'Teile aus Welt-Datenpaketen oder per <code>/reload</code>')] },
    { header: false, cells: [L('items, tooltips, workbench, analysis, flight model, rendering and saving come for free', 'Items, Tooltips, Werkbank, Analyse, Flugmodell, Rendering und Speichern gibt es geschenkt'), L('new paint slots, accessory mounts beyond top, bottom and front', 'neue Lack-Plätze, Zubehör-Halterungen außer oben, unten und vorne')] },
    { header: false, cells: [L('presets and an own creative tab right after the Propwash tab', 'Presets und ein eigener Kreativ-Tab direkt hinter dem Propwash-Tab'), L('own item classes for parts (Propwash provides the part items)', 'eigene Item-Klassen für Teile (Propwash stellt die Teil-Items)')] },
    { header: false, cells: [L('reading builds, creating drone items, setting tune and paint, a server-checked import', 'Baupläne lesen, Drohnen-Items erzeugen, Tuning und Lack setzen, ein vom Server geprüfter Import'), L('changing or removing built-in parts', 'eingebaute Teile ändern oder entfernen')] },
    { header: false, cells: [L('workbench buttons, child screens, configurator tabs, Flight School scenes, events, chest loot', 'Werkbank-Knöpfe, Kind-Fenster, Konfigurator-Tabs, Flugschul-Szenen, Events, Truhen-Beute'), L('own radio items, more than one operator per drone, world rules of add-ons inside zones', 'eigene Funken-Items, mehr als ein Operator je Drohne, Welt-Regeln von Add-ons in Zonen')] },
    { header: false, cells: [L('since 1.7: own switches and axes, OSD elements and warnings, collision rules, world rules, data on the drone, autonomous flights, a second operator, buttons in the service screen (<a href="#api-17">New in API 1.7</a>)', 'seit 1.7: eigene Schalter und Achsen, OSD-Elemente und -Warnungen, Kollisionsregeln, Welt-Regeln, Daten an der Drohne, autonome Flüge, ein zweiter Operator, Knöpfe in der Wartung (<a href="#api-17">Neu in API 1.7</a>)'), L('add-on data in share codes, writing to leaderboards', 'Add-on-Daten in Sharecodes, Schreiben in Bestenlisten')] },
    { header: false, cells: [L('share codes with your parts: a part table in your jar is all it takes (<a href="#share">Share codes</a>)', 'Sharecodes mit deinen Teilen: Eine Teile-Tabelle im Jar genügt (<a href="#share">Sharecodes</a>)'), L('an own share-code format (Propwash writes PW3 for every add-on)', 'ein eigenes Sharecode-Format (Propwash schreibt PW3 für jedes Add-on)')] },
  ])}
${P('Before you start, read the <a href="#rules">rules for add-ons</a>: your own namespace, only the API is stable, and how to name your add-on.',
    'Bevor du anfängst, lies die <a href="#rules">Regeln für Add-ons</a>: eigener Namensraum, nur die API ist stabil, und wie du dein Add-on nennst.')}
`);

  const rules = section('rules', T.rules, `
${P('These rules come from <code>ADDONS.md</code> in the Propwash source repository; the English text there is the binding one.',
    'Diese Regeln stammen aus <code>ADDONS.md</code> im Propwash-Quellcode-Repository; maßgeblich ist der englische Text dort.')}
${addonRules(ctx.data.addons)}
`);

  const setup = section('setup', T.setup, `
${h3('setup-gradle', 'Gradle', 'Gradle')}
${P(`Propwash publishes three Maven artifacts (group <code>de.lardtom</code>, each with sources and Javadoc): <code>propwash-common-${mc}</code> with the whole API in Mojang names, and the loader jars <code>propwash-fabric-${mc}</code> and <code>propwash-neoforge-${mc}</code>. Minecraft ${mc} is not obfuscated, so no remapping is involved. From the Modrinth Maven:`,
    `Propwash veröffentlicht drei Maven-Artefakte (Gruppe <code>de.lardtom</code>, je mit Quellen und Javadoc): <code>propwash-common-${mc}</code> mit der ganzen API in Mojang-Namen und die Loader-Jars <code>propwash-fabric-${mc}</code> und <code>propwash-neoforge-${mc}</code>. Minecraft ${mc} ist nicht obfuskiert, es wird also nichts umbenannt. Über das Modrinth-Maven:`)}
${code(`repositories {
    exclusiveContent {
        forRepository { maven { url = 'https://api.modrinth.com/maven' } }
        filter { includeGroup 'maven.modrinth' }
    }
}

dependencies {
    compileOnly 'maven.modrinth:propwash-fpv:${v}+neoforge'
    implementation 'maven.modrinth:propwash-fpv:${v}+fabric'
    implementation 'maven.modrinth:propwash-fpv:${v}+neoforge'
}`, 'groovy', L('<code>compileOnly</code> in <code>common</code>, <code>implementation</code> in the loader module', '<code>compileOnly</code> in <code>common</code>, <code>implementation</code> im Loader-Modul'))}
${P('The variants carry the attribute <code>io.github.mcgradleconventions.loader</code> (<code>common</code>, <code>fabric</code>, <code>neoforge</code>) like the MultiLoader template, so an add-on built from that template picks the right one.',
    'Die Varianten tragen das Attribut <code>io.github.mcgradleconventions.loader</code> (<code>common</code>, <code>fabric</code>, <code>neoforge</code>) wie im MultiLoader-Template; ein Add-on aus diesem Template bekommt damit von selbst die passende.')}
${note(`The Modrinth Maven above only resolves once Propwash is through Modrinth’s review (see the <a href="${prefix}#download">download section</a> of the landing page). Until then, build Propwash from its source repository (<a href="${SOURCE}" target="_blank" rel="noopener">github.com/LardTom/propwash-fpv</a>) or take the jar from <a href="${CURSEFORGE}" target="_blank" rel="noopener">CurseForge</a> once the version you need is listed there, and depend on it as a local file or a <code>mavenLocal()</code> publish instead:`,
    `Das Modrinth-Maven oben löst erst auf, sobald Propwash die Prüfung bei Modrinth hinter sich hat (siehe den <a href="${prefix}#download">Download-Abschnitt</a> der Startseite). Bis dahin Propwash aus dem Quellcode-Repository bauen (<a href="${SOURCE}" target="_blank" rel="noopener">github.com/LardTom/propwash-fpv</a>) oder das Jar von <a href="${CURSEFORGE}" target="_blank" rel="noopener">CurseForge</a> nehmen, sobald die gebrauchte Version dort steht, und stattdessen als lokale Datei oder über <code>mavenLocal()</code> einbinden:`)}
${code(`repositories {
    mavenLocal() // only needed for the mavenLocal() dependencies below
}

dependencies {
    // Jar downloaded from CurseForge, placed in libs/
    compileOnly files('libs/propwash-common-${mc}-${v}.jar')
    implementation files('libs/propwash-fabric-${mc}-${v}.jar')

    // or: built from source with ./gradlew publishToMavenLocal
    // compileOnly 'de.lardtom:propwash-common-${mc}:${v}'
    // implementation 'de.lardtom:propwash-fabric-${mc}:${v}'
}`, 'groovy', L('Fallback while Propwash is not on Modrinth yet', 'Übergangslösung, solange Propwash noch nicht auf Modrinth steht'))}
${h3('setup-metadata', 'Dependency in the loader metadata', 'Abhängigkeit in den Loader-Metadaten')}
${P('Propwash has to run on client <em>and</em> server, and so does the add-on: the part lists are compared when a player connects.',
    'Propwash muss auf Client <em>und</em> Server laufen, das Add-on ebenso: Beim Verbinden werden die Teile-Listen verglichen.')}
${code(`"depends": {
  "minecraft": "~${mc}",
  "propwash": ">=${range.fabric}"
}`, 'json', mono('fabric.mod.json'))}
${code(`[[dependencies.examplemod]]
modId = "propwash"
type = "required"
versionRange = "[${range.neoforge},)"
ordering = "AFTER"
side = "BOTH"`, 'toml', mono('neoforge.mods.toml'))}
${P(`Write the ranges exactly like this, so that pre-releases count too: <code>&gt;=${range.fabric}</code> and <code>[${range.neoforge},)</code> accept <code>${range.base}-dev.N</code>, <code>${range.base}-rc.N</code> and <code>${range.base}</code>. <code>&gt;=${range.base}</code> rejects every pre-release on Fabric, and <code>[${range.base},)</code> rejects the release candidates on NeoForge.`,
    `Die Bereiche genau so schreiben, damit auch Vorabversionen zählen: <code>&gt;=${range.fabric}</code> und <code>[${range.neoforge},)</code> nehmen <code>${range.base}-dev.N</code>, <code>${range.base}-rc.N</code> und <code>${range.base}</code> an. <code>&gt;=${range.base}</code> lehnt unter Fabric jede Vorabversion ab, <code>[${range.base},)</code> unter NeoForge die Release-Kandidaten.`)}
${h3('setup-join', 'Name, version and homepage for the join overview', 'Name, Version und Homepage für die Beitritts-Übersicht')}
${P(`If a player's add-ons don't match the server's, Propwash shows an overview with one card per add-on: name, mod id, the version on the server and on the player's side, what to do (“Install <em>Your Add-on</em> 1.2.3”) and a link to the add-on's page (see <a href="${prefix}docs/guide/#servers-addons">When add-ons don't match</a>). These details come from the add-on's loader metadata, which the server sends along when a player connects (Propwash add-ons only, never the whole mod list):`,
    `Passen die Add-ons eines Spielers nicht zu denen des Servers, zeigt Propwash eine Übersicht mit einer Karte je Add-on: Name, Mod-Id, Version auf dem Server und beim Spieler, was zu tun ist („Installiere <em>Dein Add-on</em> 1.2.3“) und ein Link zur Seite des Add-ons (siehe <a href="${prefix}docs/guide/#servers-addons">Wenn Add-ons nicht passen</a>). Diese Angaben stammen aus den Loader-Metadaten des Add-ons, die der Server beim Verbinden mitschickt (nur Propwash-Add-ons, nie die ganze Mod-Liste):`)}
${table([L('Shown', 'Angabe'), mono('fabric.mod.json'), L('<code>neoforge.mods.toml</code> (<code>[[mods]]</code>)', '<code>neoforge.mods.toml</code> (<code>[[mods]]</code>)')], [
    [L('Name in the overview', 'Name in der Übersicht'), mono('name'), mono('displayName')],
    [L('Version', 'Version'), mono('version'), mono('version')],
    [L('Link (only <code>https://</code> or <code>http://</code>)', 'Link (nur <code>https://</code> oder <code>http://</code>)'), L('<code>contact.homepage</code>, else <code>contact.sources</code>', '<code>contact.homepage</code>, sonst <code>contact.sources</code>'), L('<code>displayURL</code>, else <code>modUrl</code>', '<code>displayURL</code>, sonst <code>modUrl</code>')],
    [L('Recognized as a Propwash add-on', 'Erkannt als Propwash-Add-on'), L('<code>propwash</code> under <code>depends</code>, <code>recommends</code> or <code>suggests</code>', '<code>propwash</code> unter <code>depends</code>, <code>recommends</code> oder <code>suggests</code>'), L('<code>[[dependencies.&lt;modid&gt;]]</code> with <code>modId = "propwash"</code>', '<code>[[dependencies.&lt;modid&gt;]]</code> mit <code>modId = "propwash"</code>')],
  ])}
${code(`"name": "Propwash: My Add-on",
"version": "1.2.3",
"contact": { "homepage": "https://modrinth.com/mod/my-addon" }`, 'json', mono('fabric.mod.json'))}
${code(`[[mods]]
modId = "examplemod"
version = "1.2.3"
displayName = "Propwash: My Add-on"
displayURL = "https://modrinth.com/mod/my-addon"`, 'toml', mono('neoforge.mods.toml'))}
${P('Use your mod id as the namespace of your parts: Propwash assigns parts to an add-on by their namespace. Control characters, <code>§</code> formatting and links with other schemes are dropped; names may have up to 96 characters, versions up to 64. Without <code>name</code>/<code>displayName</code> or a homepage, the card shows only the mod id and no link.',
    'Die Mod-Id als Namensraum der Teile verwenden: Propwash ordnet Teile über ihren Namensraum dem Add-on zu. Steuerzeichen, <code>§</code>-Formatierung und Links mit anderem Schema verwirft Propwash; Namen höchstens 96 Zeichen, Versionen 64. Ohne <code>name</code>/<code>displayName</code> oder Homepage zeigt die Karte nur die Mod-Id und keinen Link.')}
${h3('setup-version', 'Checking the API version', 'API-Version prüfen')}
${P(`The API has its own version (<code>PropwashApi.API_VERSION</code>, SemVer), independent of the mod version: Propwash ${v} ships <strong>${api.version}</strong>. When your mod starts, require the major version and the smallest minor version whose features you need, and test for newer ones before using them:`,
    `Die API hat eine eigene Version (<code>PropwashApi.API_VERSION</code>, SemVer), unabhängig von der Mod-Version: Propwash ${v} bringt <strong>${api.version}</strong>. Beim Start die Hauptversion und die kleinste Nebenversion verlangen, deren Funktionen das Add-on braucht, und neuere vor dem Benutzen abfragen:`)}
${code(`PropwashApi.requireVersion("examplemod", "1.1");
if (PropwashApi.isCompatible("1.4")) {
    PropwashApi.loot().inject(dungeon, ownTable);
}`, 'java')}
${P('<code>requireVersion</code> throws an <code>IllegalStateException</code> with a clear message when Propwash is too old or has a different major version.',
    '<code>requireVersion</code> wirft eine <code>IllegalStateException</code> mit klarer Meldung, wenn Propwash zu alt ist oder eine andere Hauptversion hat.')}
`);

  const lifecycle = section('lifecycle', T.lifecycle, `
${table([['Phase', 'Phase'], ['When', 'Wann'], ['Allowed', 'Erlaubt']], [
    [L('Open', 'Offen'), L('Fabric <code>ModInitializer#onInitialize</code>, NeoForge <code>@Mod</code> constructor (both sides)', 'Fabric <code>ModInitializer#onInitialize</code>, NeoForge-<code>@Mod</code>-Konstruktor (beide Seiten)'), L('registering parts, chemistries, items, presets, the creative tab, loot and event listeners', 'Teile, Zellchemien, Items, Presets, Kreativ-Tab, Beute und Event-Listener anmelden')],
    [L('Client init', 'Client-Init'), L('Fabric <code>ClientModInitializer</code>, NeoForge <code>@Mod(dist = Dist.CLIENT)</code>', 'Fabric <code>ClientModInitializer</code>, NeoForge <code>@Mod(dist = Dist.CLIENT)</code>'), L('<code>PropwashClientApi.register…</code>: workbench, configurator tabs, Flight School', '<code>PropwashClientApi.register…</code>: Werkbank, Konfigurator-Tabs, Flugschule')],
    [L('Frozen', 'Eingefroren'), L('after all initialisation (event <code>REGISTRY_FROZEN</code>)', 'nach allen Initialisierungen (Event <code>REGISTRY_FROZEN</code>)'), L('read only; <code>register</code> throws <code>IllegalStateException</code>', 'nur lesen; <code>register</code> wirft <code>IllegalStateException</code>')],
  ])}
${list([
    ['Mod order does not matter: every call of the open phase works before, during and after Propwash’s own initialisation.', 'Die Reihenfolge der Mods ist egal: Jeder Aufruf der offenen Phase funktioniert vor, während und nach Propwashs eigener Initialisierung.'],
    ['Always register parts in the <strong>common</strong> init, never only on the client, or the server disconnects players.', 'Teile immer in der <strong>gemeinsamen</strong> Init anmelden, nie nur auf dem Client, sonst trennt der Server die Spieler.'],
    ['On NeoForge the constructors run on a worker thread: do not touch anything that needs a running world or client there.', 'Unter NeoForge laufen die Konstruktoren auf einem Worker-Thread: dort nichts anfassen, was eine laufende Welt oder einen Client braucht.'],
  ])}
${code(`public final class ExampleMod {
    public static final String MOD_ID = "examplemod";

    public static void init() {
        PropwashApi.requireVersion(MOD_ID, "${apiMinor}");
        ExampleParts.register();
        PropwashApi.parts().loadBundled(MOD_ID);
        PropwashApi.partItems().registerItems(MOD_ID);
        PropwashApi.builds().registerPreset(DronePreset.of(id("lr8s"), ExamplePresets.longRange8s()));
        PropwashApi.extensionTab(MOD_ID).icon(id("deadcat_5"))
                .order(TabSection.PRESETS, TabSection.FRAMES, TabSection.MOTORS, TabSection.PROPS);
        PropwashEvents.BUILD_IMPORTED.register((player, request, result) -> ExampleStats.count(result));
    }

    public static void initClient() {
        PropwashClientApi.registerWorkbenchExtension(new StatsButton());
        PropwashClientApi.registerConfigTab(StatsTab::new);
        PropwashClientApi.registerFlightSchoolScene(FrameShapesScene::create);
    }

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(MOD_ID, path);
    }
}`, 'java')}
`);

  const parts = section('parts', T.parts, `
${P('Every category has a definition record in <code>api.part</code> with a builder. Build definitions (<code>…Definition</code>, <code>AirframeGeometry</code>, <code>FrameAero</code>) only through their builders or <code>with…</code> methods; their constructors gain fields in minor versions. Small value records such as <code>Vec3Mm</code>, <code>BatteryFitRule</code>, <code>PackSize</code> or <code>CellChemistry</code> may be created with <code>new</code>. Every record checks its values and throws <code>IllegalArgumentException</code> naming the id.',
    'Jede Kategorie hat einen Definitions-Record in <code>api.part</code> mit Builder. Definitionen (<code>…Definition</code>, <code>AirframeGeometry</code>, <code>FrameAero</code>) nur über Builder oder <code>with…</code>-Methoden bauen; ihre Konstruktoren bekommen in Nebenversionen neue Felder. Kleine Wertrecords wie <code>Vec3Mm</code>, <code>BatteryFitRule</code>, <code>PackSize</code> oder <code>CellChemistry</code> dürfen mit <code>new</code> entstehen. Jeder Record prüft seine Werte und wirft <code>IllegalArgumentException</code> mit der Id.')}
${P('Coordinates are millimetres with the origin in the middle of the frame at the height of the stack plate: +X right, +Y up, <strong>−Z forward</strong> (the nose). Arms are always listed front left, front right, rear left, rear right.',
    'Koordinaten sind Millimeter mit dem Ursprung in der Rahmenmitte auf Höhe der Stack-Auflage: +X rechts, +Y oben, <strong>−Z vorn</strong> (die Nase). Arme stehen immer in der Reihenfolge vorne links, vorne rechts, hinten links, hinten rechts.')}
${h3('parts-java', 'In Java', 'In Java')}
${code(`PropwashApi.parts().register(MotorDefinition.builder(id("m2806_1300"))
        .mass(52.0).stator("2806.5").kv(1300).mount(Mounts.MOTOR_M28)
        .maxCurrent(48.0).resistance(0.062).cells(6, 8)
        .thermal(MotorThermal.limits(135.0, 155.0))
        .build());

PropwashApi.parts().register(PropDefinition.builder(id("p13_7_2b_carbon"))
        .mass(28.0).size(330, 7.0, 2).coefficients(0.095, 0.042)
        .material(PropMaterial.CARBON)
        .build());

PropwashApi.parts().register(FrameDefinition.builder(id("deadcat_5"))
        .mass(118.0).role(FrameRole.FREESTYLE).shape(FrameShape.DEADCAT)
        .wheelbase(230).maxProp(130)
        .motorMount(Mounts.MOTOR_M22).stackMount(Mounts.STACK_S30, Mounts.STACK_S20)
        .accessoryMount(AccessorySlot.TOP, AccessorySlot.BOTTOM)
        .arms(List.of(MotorArm.of(-95, 0, -60, MotorArm.Spin.CW), MotorArm.of(95, 0, -60, MotorArm.Spin.CCW),
                MotorArm.of(-80, 0, 80, MotorArm.Spin.CCW), MotorArm.of(80, 0, 80, MotorArm.Spin.CW)))
        .battery(true, 30.0).electronics(12.0)
        .camera(new Vec3Mm(0.0, 14.0, -100.0)).cameraTilt(30.0)
        .aero(0.012, 0.9).impactTolerance(8.0)
        .batteryFit(new BatteryFitRule(4, 6, 260.0, 6, 0))
        .build());`, 'java')}
${list([
    ['Stator sizes come from the label (first two digits diameter, the rest height) or from <code>statorSize(d, h)</code>. A new mount is just a new id; frames that fit name the same id in <code>motorMount(…)</code>.', 'Statormaße kommen aus der Bezeichnung (erste zwei Ziffern Durchmesser, Rest Höhe) oder aus <code>statorSize(d, h)</code>. Eine neue Halterung ist einfach eine neue Id; passende Rahmen nennen dieselbe Id in <code>motorMount(…)</code>.'],
    ['Without <code>arms</code>, Propwash builds a true X from the wheelbase. With <code>arms</code>, mixer, lever arms, inertia, hull and hitbox follow from the geometry.', 'Ohne <code>arms</code> rechnet Propwash einen True-X aus dem Radstand. Mit <code>arms</code> entstehen Mixer, Hebelarme, Trägheit, Hülle und Hitbox aus der Geometrie.'],
    ['Every frame should set <code>camera</code> with a position: the lens usually sits 1–5 mm below the prop plane on X frames. Check the result with <code>PropwashApi.builds().analyze(spec)</code> (props in view) or <code>cameraView(spec)</code>.', 'Jeder Rahmen sollte <code>camera</code> mit Position setzen: Das Objektiv sitzt bei X-Rahmen meist 1–5 mm unter der Propebene. Prüfen mit <code>PropwashApi.builds().analyze(spec)</code> (Props im Bild) oder <code>cameraView(spec)</code>.'],
    ['Register cell chemistries (<code>registerChemistry</code>) before the batteries that use them.', 'Zellchemien (<code>registerChemistry</code>) vor den Akkus anmelden, die sie benutzen.'],
  ])}
${h3('parts-json', 'As JSON', 'Als JSON')}
${P(`The same parts can be data files in the add-on’s own resources, <code>data/&lt;namespace&gt;/propwash_parts/&lt;category&gt;/&lt;path&gt;.json</code>, loaded by <code>PropwashApi.parts().loadBundled(modId)</code>. All fields, types and defaults are on the page <a href="${prefix}docs/parts-format/">Parts format (JSON)</a>. Tools can use Propwash’s own codec: <code>parts().toJson(definition)</code> and <code>parts().fromJson(kind, id, json)</code>.`,
    `Dieselben Teile können Datendateien in den eigenen Ressourcen des Add-ons sein, <code>data/&lt;namensraum&gt;/propwash_parts/&lt;kategorie&gt;/&lt;pfad&gt;.json</code>, geladen mit <code>PropwashApi.parts().loadBundled(modId)</code>. Alle Felder, Typen und Standards stehen auf der Seite <a href="${prefix}docs/parts-format/">Teile-Format (JSON)</a>. Werkzeuge können Propwashs eigenen Codec benutzen: <code>parts().toJson(definition)</code> und <code>parts().fromJson(kind, id, json)</code>.`)}
${h3('parts-checks', 'What Propwash checks', 'Was Propwash prüft')}
${P(`Not buildable (problems): ${issueList(ctx.data.parts.issues.problems, 'en')}. Warnings: ${issueList(ctx.data.parts.issues.warnings, 'en')}. Texts: <code>propwash.build.issue.&lt;key&gt;</code>. With the world rule <a href="${prefix}docs/gamerules/#rule-part_compatibility"><em>Parts must fit</em></a> off, every problem except <code>missing_part</code> is only a warning.`,
    `Nicht baubar (Probleme): ${issueList(ctx.data.parts.issues.problems, 'de')}. Warnungen: ${issueList(ctx.data.parts.issues.warnings, 'de')}. Texte: <code>propwash.build.issue.&lt;schlüssel&gt;</code>. Mit der Welt-Regel <a href="${prefix}docs/gamerules/#rule-part_compatibility"><em>Teile müssen zusammenpassen</em></a> aus ist jedes Problem außer <code>missing_part</code> nur eine Warnung.`)}
`);

  const items = section('items', T.items, `
${code(`int count = PropwashApi.partItems().registerItems("examplemod");
PropwashApi.partItems().registerItem(id("xclass_13"), p -> p.rarity(Rarity.RARE));`, 'java')}
${list([
    ['The item has <strong>the same id as the part</strong>. Propwash provides the item class (batteries with charge), stack size, Shift tooltips, wear bar, recycling, workbench slots and the Flight School link.', 'Das Item hat <strong>dieselbe Id wie das Teil</strong>. Propwash liefert die Item-Klasse (Akkus mit Ladestand), Stapelgröße, Shift-Tooltips, Verschleißbalken, Recycling, Werkbank-Slots und die Flugschul-Zuordnung.'],
    ['Register individually configured parts before <code>registerItems</code>. Look-ups: <code>item(id)</code>, <code>stack(id)</code>, <code>stack(id, charge)</code> for batteries, <code>partOf(stack)</code>.', 'Einzeln eingestellte Teile vor <code>registerItems</code> anmelden. Nachschlagen: <code>item(id)</code>, <code>stack(id)</code>, <code>stack(id, charge)</code> für Akkus, <code>partOf(stack)</code>.'],
    ['Without own models Propwash draws every part procedurally from its definition. For the inventory icon the special renderer <code>propwash:part</code> is enough; category base models <code>propwash:item/part_base/&lt;category&gt;</code> give add-on parts the same size as built-in ones in hand, on the ground and in item frames.', 'Ohne eigene Modelle zeichnet Propwash jedes Teil prozedural aus seiner Definition. Für das Inventar-Symbol reicht der Sonder-Renderer <code>propwash:part</code>; die Kategorie-Basismodelle <code>propwash:item/part_base/&lt;kategorie&gt;</code> geben Add-on-Teilen dieselbe Größe wie eingebauten in der Hand, am Boden und im Item-Rahmen.'],
  ])}
${code(`{"model": {"type": "minecraft:special", "base": "propwash:item/part_base/motor", "model": {"type": "propwash:part"}}}`, 'json', mono('assets/examplemod/items/m2806_1300.json'))}
${table([['Purpose', 'Zweck'], ['Language key', 'Sprachschlüssel']], [
    [L('Part name (required)', 'Teilname (Pflicht)'), mono('part.<ns>.<path>')],
    [L('Shift help', 'Shift-Hilfe'), mono('<ns>.help.<path>.summary, .what.1…8, .use.1…8')],
    [L('Short frame name (class, leaderboard)', 'Rahmen-Kurzname (Klasse, Bestenliste)'), mono('<ns>.frame_short.<path>')],
    [L('Mounts', 'Halterungen'), mono('<ns>.mount.motor.<path>, .mount.stack.<path>, .mount.prop.<path>')],
    [L('Cell chemistry', 'Zellchemie'), mono('<ns>.chemistry.<path>')],
    [L('Preset', 'Preset'), mono('<ns>.preset.<path>')],
    [L('Name of the own creative tab', 'Name des eigenen Kreativ-Tabs'), mono('itemGroup.<ns>')],
    [L('Flight School scene', 'Flugschul-Szene'), mono('<ns>.guide.scene.<name>.title, .description, .step.<step>.title/text')],
  ])}
${P('Recipes are normal vanilla recipes of the add-on; the intermediate items <code>propwash:carbon_plate</code>, <code>copper_coil</code>, <code>circuit_board</code>, <code>lipo_cell</code> and <code>hd_chip</code> are stable ingredients. The tags <code>#propwash:parts</code> and <code>#propwash:parts/&lt;category&gt;</code> can be extended with <code>"replace": false</code>. Own chest loot goes into any vanilla table with <code>PropwashApi.loot().inject(target, addonTable)</code>, on both loaders.',
    'Rezepte sind normale Vanilla-Rezepte des Add-ons; die Zwischenteile <code>propwash:carbon_plate</code>, <code>copper_coil</code>, <code>circuit_board</code>, <code>lipo_cell</code> und <code>hd_chip</code> sind stabile Zutaten. Die Tags <code>#propwash:parts</code> und <code>#propwash:parts/&lt;kategorie&gt;</code> lassen sich mit <code>"replace": false</code> ergänzen. Eigene Truhen-Beute hängt <code>PropwashApi.loot().inject(ziel, addonTabelle)</code> in jede Vanilla-Tabelle, auf beiden Loadern.')}
`);

  const presets = section('presets', T.presets, `
${code(`DroneData longRange = new DroneData(
        BuildSpec.of(id("lr_8"), id("stack_30_8s"), id("m2806_1300"), Identifier.fromNamespaceAndPath("propwash", "p7_2b"),
                Identifier.fromNamespaceAndPath("propwash", "digital_hd"), id("b8s_4500_lion")),
        PaintSpec.DEFAULT.with("frame", 0x1B1D22), TuneSpec.EMPTY, Optional.of("LR 8S"));
PropwashApi.builds().registerPreset(DronePreset.of(id("lr8s"), longRange));

PropwashApi.extensionTab("examplemod")
        .icon(id("deadcat_5"))
        .order(TabSection.PRESETS, TabSection.FRAMES, TabSection.MOTORS, TabSection.PROPS)
        .add(() -> List.of(PropwashApi.builds().createDrone(longRange.withName("LR 8S Race"))));`, 'java')}
${list([
    ['Every add-on gets its own creative tab right after the Propwash tab, titled “Propwash: &lt;name&gt;” with the name from <code>itemGroup.&lt;ns&gt;</code>. Part items and listed presets of the namespace go there, not into the Propwash tab.', 'Jedes Add-on bekommt einen eigenen Kreativ-Tab direkt hinter dem Propwash-Tab, Titel „Propwash: &lt;Name&gt;“ mit dem Namen aus <code>itemGroup.&lt;ns&gt;</code>. Teil-Items und gelistete Presets des Namensraums landen dort, nicht im Propwash-Tab.'],
    ['<code>order(…)</code> sorts the sections; sections you do not name follow in the default order. An empty tab is hidden by Minecraft.', '<code>order(…)</code> sortiert die Abschnitte; nicht genannte folgen in der Standard-Reihenfolge. Einen leeren Tab blendet Minecraft aus.'],
  ])}
`);

  const builds = section('builds', T.builds, `
${table([['Type', 'Typ'], ['Content', 'Inhalt']], [
    [mono('BuildSpec'), L('ids of frame, stack, motor (×4), prop (×4), video, battery and the accessory per slot', 'Ids von Rahmen, Stack, Motor (×4), Prop (×4), Video, Akku und Zubehör je Platz')],
    [mono('PaintSpec'), L('RGB per paint slot: <code>frame</code>, <code>tpu</code>, <code>motors</code>, <code>prop_fl</code> … <code>prop_rr</code>, <code>stack</code>, <code>battery</code>, <code>camera</code>, <code>antenna</code>, <code>accessories</code>', 'RGB je Lack-Platz: <code>frame</code>, <code>tpu</code>, <code>motors</code>, <code>prop_fl</code> … <code>prop_rr</code>, <code>stack</code>, <code>battery</code>, <code>camera</code>, <code>antenna</code>, <code>accessories</code>')],
    [mono('TuneSpec'), L('key → value like in the flight controller (at most 256 entries)', 'Schlüssel → Wert wie im Flight-Controller (höchstens 256 Einträge)')],
    [mono('DroneData'), L('<code>BuildSpec</code> + <code>PaintSpec</code> + <code>TuneSpec</code> + name (up to 48 characters)', '<code>BuildSpec</code> + <code>PaintSpec</code> + <code>TuneSpec</code> + Name (bis 48 Zeichen)')],
  ])}
${P('<code>PropwashApi.builds()</code> reads drone items (<code>read</code>), creates them (<code>createDrone</code>, <code>withTune</code>, <code>withPaint</code>), checks and analyses builds (<code>check</code>, <code>analyze</code> with the same figures as the workbench, <code>cameraView</code>, <code>defaultTune</code>) and runs imports on the server (<code>applyImport</code>). Battery charge, wear, bindings and switch assignments are never part of a <code>DroneData</code>.',
    '<code>PropwashApi.builds()</code> liest Drohnen-Items (<code>read</code>), erzeugt sie (<code>createDrone</code>, <code>withTune</code>, <code>withPaint</code>), prüft und analysiert Baupläne (<code>check</code>, <code>analyze</code> mit denselben Werten wie die Werkbank, <code>cameraView</code>, <code>defaultTune</code>) und führt Importe auf dem Server aus (<code>applyImport</code>). Akkustand, Verschleiß, Bindungen und Schalterbelegung gehören nie zu einer <code>DroneData</code>.')}
${h3('builds-import', 'Import: the server decides', 'Import: Der Server entscheidet')}
${code(`context.importIntoWorkbench(data, EnumSet.allOf(ImportLayer.class), TuneGroup.FLIGHT).thenAccept(this::show);
PropwashClientApi.sendImport(ImportRequest.tuneOnHeldDrone(data)).thenAccept(this::show);
PropwashClientApi.sendImport(ImportRequest.paintOnHeldDrone(data)).thenAccept(this::show);
PropwashClientApi.sendCreateDrone(data).thenAccept(this::show);`, 'java')}
${P('The client sends a request; the server checks size and rate (at most two requests per second and player), the target, unknown parts and the game mode, applies the layers in the order parts → paint → tune → name and answers with an <code>ImportResult</code>. In survival, parts come from the inventory and paint costs dyes, as in the game.',
    'Der Client schickt eine Anfrage; der Server prüft Größe und Rate (höchstens zwei Anfragen pro Sekunde und Spieler), das Ziel, unbekannte Teile und den Spielmodus, wendet die Ebenen in der Reihenfolge Teile → Lack → Tuning → Name an und antwortet mit einem <code>ImportResult</code>. Im Überlebensmodus kommen Teile aus dem Inventar und Lack kostet Farbstoffe, wie im Spiel.')}
${P('Statuses: <code>APPLIED</code>, <code>UNCHANGED</code>, <code>UNKNOWN_PARTS</code>, <code>MISSING_PARTS</code>, <code>MISSING_DYES</code>, <code>NO_TARGET</code>, <code>NOT_ALLOWED</code>, <code>INVALID</code>, <code>BUSY</code>; show them with <code>Component.translatable(result.status().translationKey())</code>.',
    'Status: <code>APPLIED</code>, <code>UNCHANGED</code>, <code>UNKNOWN_PARTS</code>, <code>MISSING_PARTS</code>, <code>MISSING_DYES</code>, <code>NO_TARGET</code>, <code>NOT_ALLOWED</code>, <code>INVALID</code>, <code>BUSY</code>; anzeigen mit <code>Component.translatable(result.status().translationKey())</code>.')}
${note('Since 0.6.0 share codes belong to Propwash (<a href="#share">Share codes</a>): the workbench, the configurator, <code>/propwash code</code> and the website read every code with parts from any add-on. An add-on that shows codes itself uses <code>PropwashApi.shareCodes()</code> and imports through the server-checked import above. Never put the video channel (<code>TuneGroup.VTX</code>), switch assignments, battery charge or bindings into a code.',
    'Seit 0.6.0 gehören Sharecodes Propwash (<a href="#share">Sharecodes</a>): Werkbank, Konfigurator, <code>/propwash code</code> und die Website lesen jeden Code mit Teilen aus jedem Add-on. Ein Add-on, das selbst Codes zeigt, nutzt <code>PropwashApi.shareCodes()</code> und übernimmt über den vom Server geprüften Import oben. Nie den Videokanal (<code>TuneGroup.VTX</code>), Schalterbelegung, Akkustand oder Bindungen in einen Code schreiben.')}
`);

  const share = section('share', T.share, `
${P(`Propwash reads PW1, PW2 and PW3 and writes only PW3 (<code>PW3-…</code>). An add-on needs no code format, no button and no command of its own: it ships a <strong>part table</strong> in its jar, <code>data/&lt;namespace&gt;/propwash_share/table.json</code>, that gives every part a short number in the code. Players see the codes in the workbench (<em>Share code</em> button), the configurator (<em>Share code</em> tab), in chat, with <code>/propwash code</code> and on the website (<a href="${prefix}docs/guide/#share">player guide</a>, <a href="${prefix}convert/">converter</a>).`,
    `Propwash liest PW1, PW2 und PW3 und schreibt nur noch PW3 (<code>PW3-…</code>). Ein Add-on braucht kein eigenes Code-Format, keinen Knopf und keinen Befehl: Es liefert eine <strong>Teile-Tabelle</strong> in seinem Jar, <code>data/&lt;namensraum&gt;/propwash_share/table.json</code>, die jedem Teil eine kurze Nummer im Code gibt. Spieler sehen die Codes in der Werkbank (Knopf <em>Sharecode</em>), im Konfigurator (Tab <em>Sharecode</em>), im Chat, mit <code>/propwash code</code> und auf der Website (<a href="${prefix}docs/guide/#share">Spielerhandbuch</a>, <a href="${prefix}convert/">Umrechner</a>).`)}
${code(`{
  "format": 1,
  "namespace": "examplemod",
  "parts": {
    "frame": [
      {"id": "old_stretch_5", "since": "1.0.0", "deprecated": "1.0.0", "replaced_by": "examplemod:race_stretch_5", "fallback": "propwash:race_5"},
      {"id": "race_stretch_5", "since": "1.0.0", "fallback": "propwash:race_5"},
      {"id": "deadcat_5", "since": "1.0.0", "fallback": "propwash:freestyle_5"}
    ],
    "motor": [{"id": "m2806_1300", "since": "1.0.0", "fallback": "propwash:m2807_1300"}]
  }
}`, 'json', mono('data/examplemod/propwash_share/table.json'))}
${list([
    ['Append entries only at the <strong>end</strong>, never reorder or delete them; a renamed part gets a new entry and the old one <code>deprecated</code> and <code>replaced_by</code>. Otherwise older codes read the wrong part.', 'Einträge nur <strong>hinten</strong> anhängen, nie umsortieren oder löschen; ein umbenanntes Teil bekommt einen neuen Eintrag, der alte <code>deprecated</code> und <code>replaced_by</code>. Sonst lesen ältere Codes ein falsches Teil.'],
    ['<code>since</code> is the add-on version that brought the part: the import names the version a code needs. <code>fallback</code> is an optional built-in stand-in part for players without the add-on.', '<code>since</code> ist die Add-on-Version, mit der das Teil kam: Der Import nennt so die Version, die ein Code braucht. <code>fallback</code> ist ein optionales eingebautes Ersatzteil für Spieler ohne das Add-on.'],
    ['Without a table an add-on still works: its parts go into the code as text, which makes the code longer.', 'Ohne Tabelle funktioniert ein Add-on trotzdem: Seine Teile gehen als Text in den Code, der dadurch länger wird.'],
    ['<code>ShareTableCheck</code> (API package, MIT, only needs Gson) checks the table in the add-on’s build or from JUnit: <code>check</code>, <code>add</code>, <code>freeze</code> and <code>init</code>. A table for <code>propwash</code> from another jar is ignored.', '<code>ShareTableCheck</code> (API-Paket, MIT, braucht nur Gson) prüft die Tabelle im Build des Add-ons oder aus JUnit: <code>check</code>, <code>add</code>, <code>freeze</code> und <code>init</code>. Eine Tabelle für <code>propwash</code> aus einem fremden Jar wird verworfen.'],
    [`The <a href="${prefix}addons/">add-on directory</a> of this website gives short ids to listed add-ons and links them in the import; name and link of other add-ons come from your loader metadata (<a href="#setup-join">Name, version and homepage</a>).`, `Das <a href="${prefix}addons/">Add-on-Verzeichnis</a> dieser Website vergibt kurze Kennungen an eingetragene Add-ons und verlinkt sie im Import; Name und Link anderer Add-ons kommen aus deinen Loader-Metadaten (<a href="#setup-join">Name, Version und Homepage</a>).`],
  ])}
${code(`List<ShareTableCheck.Finding> findings = ShareTableCheck.check(Path.of("src/main/resources"), "1.2.0",
        Path.of("sharecode-baseline.json"));   // baseline from freeze; null before the first release
assertTrue(findings.isEmpty(), findings.toString());`, 'java', L('the table check in a JUnit test', 'die Tabellen-Prüfung in einem JUnit-Test'))}
${h3('share-api', 'Codes through the API', 'Codes über die API')}
${code(`ShareCodes codes = PropwashApi.shareCodes();
ShareResult read = codes.decode(text);                  // PW1, PW2 or PW3, never throws
if (read.ok()) {
    DroneData imported = read.data().orElseThrow();
    for (ShareResult.NamespaceInfo ns : read.namespaces()) {
        if (ns.check() == ShareResult.Check.MISSING) showMissing(ns.name().orElse(ns.namespace()), ns.minVersion(), ns.link());
    }
}
String code = codes.encode(own, ShareOptions.defaults().withLayers(EnumSet.of(ShareOptions.Layer.PARTS, ShareOptions.Layer.PAINT)));
codes.convert(oldCode).convertedCode().ifPresent(this::copyToClipboard);   // PW1/PW2 → PW3`, 'java')}
${P('<code>decode</code> reads codes of up to 4000 characters and reports per namespace whether the add-on is installed in a matching version (<code>MATCH</code>, <code>MISMATCH</code>, <code>NEWER</code>, <code>MISSING</code>, <code>NO_TABLE</code>), with name and link; <code>trustedLink</code> is only set for links from the directory, never for links from the code itself. <code>encode</code> always writes the parts, by default also paint, tune and name, the OSD layout only with <code>withOsd(json)</code>. <code>ShareCodes</code> gives data only – applying a code still goes through the server-checked import.',
    '<code>decode</code> liest Codes bis 4000 Zeichen und meldet je Namensraum, ob das Add-on in passender Version installiert ist (<code>MATCH</code>, <code>MISMATCH</code>, <code>NEWER</code>, <code>MISSING</code>, <code>NO_TABLE</code>), mit Name und Link; <code>trustedLink</code> gibt es nur für Links aus dem Verzeichnis, nie für Links aus dem Code selbst. <code>encode</code> schreibt immer die Teile, standardmäßig auch Lack, Tuning und Name, das OSD-Layout nur mit <code>withOsd(json)</code>. <code>ShareCodes</code> liefert nur Daten – übernommen wird weiter über den vom Server geprüften Import.')}
`);

  const client = section('client', T.client, `
${h3('client-workbench', 'Workbench buttons', 'Werkbank-Knöpfe')}
${code(`public final class StatsButton implements WorkbenchExtension {
    @Override
    public Identifier id() {
        return ExampleMod.id("stats");
    }

    @Override
    public void init(WorkbenchContext context) {
        context.addButton(Component.translatable("examplemod.workbench.stats"),
                Component.translatable("examplemod.workbench.stats.tooltip"),
                () -> context.openChild(parent -> new StatsScreen(parent, context)));
    }
}`, 'java')}
${P('<code>init</code> runs every time the workbench screen is built. Up to two buttons sit left of <em>Paint</em>, more go behind “⋯”; <code>headerSpace()</code>, short labels and 13 × 13 px icon buttons help with long texts. <code>WorkbenchContext</code> gives the slots, the finished drone (<code>result()</code>), <code>missingParts(data)</code> and the import into the workbench.',
    '<code>init</code> läuft bei jedem Aufbau des Werkbank-Screens. Bis zu zwei Knöpfe stehen links neben <em>Lackierung</em>, weitere hinter „⋯“; <code>headerSpace()</code>, Kurzbeschriftungen und Symbol-Knöpfe mit 13 × 13 px helfen bei langen Texten. <code>WorkbenchContext</code> liefert die Slots, die fertige Drohne (<code>result()</code>), <code>missingParts(data)</code> und den Import in die Werkbank.')}
${h3('client-tabs', 'Configurator tabs', 'Konfigurator-Tabs')}
${P('<code>PropwashClientApi.registerConfigTab(StatsTab::new)</code>. A tab extends <code>ui.client.config.ConfigTab</code>: an id with namespace, its own <code>order()</code> from 1000, widgets in <code>build()</code>, drawing in <code>extract(…)</code>, <code>save()</code> and <code>discard()</code>. <code>openConfigTab(id, parent)</code> opens the configurator right on it.',
    '<code>PropwashClientApi.registerConfigTab(StatsTab::new)</code>. Ein Tab erweitert <code>ui.client.config.ConfigTab</code>: Id mit Namensraum, eigene <code>order()</code> ab 1000, Widgets in <code>build()</code>, Zeichnen in <code>extract(…)</code>, <code>save()</code> und <code>discard()</code>. <code>openConfigTab(id, parent)</code> öffnet den Konfigurator direkt darauf.')}
${h3('client-school', 'Flight School scenes', 'Flugschul-Szenen')}
${code(`PropwashClientApi.registerFlightSchoolScene(FrameShapesScene::create);
PropwashClientApi.linkFlightSchoolParts("examplemod:frames", "examplemod", PartKind.FRAME);
PropwashClientApi.linkFlightSchoolParts(FlightSchoolScenes.REPAIR, "examplemod", PartKind.MOTOR);`, 'java')}
${P('Add-on scenes need an id in the add-on’s namespace and use the scene builder in <code>guide.scene</code>. Holding the Flight School key over an item opens its scenes; add-on batteries, video units, stacks and props get the matching Propwash scene automatically.',
    'Add-on-Szenen brauchen eine Id im Namensraum des Add-ons und benutzen den Szenen-Baukasten in <code>guide.scene</code>. Die Flugschul-Taste über einem Item öffnet seine Szenen; Akkus, Videomodule, Stacks und Props von Add-ons bekommen die passende Propwash-Szene von selbst.')}
${h3('client-theme', 'Theme', 'Theme')}
${P('Every screen that hooks into Propwash uses the Propwash theme: <code>ThemedScreen</code>, <code>ThemeDraw</code>, <code>ThemeText</code>, <code>Palette</code>, <code>Metrics</code>, <code>FlatButton</code>, <code>ScrollPanel</code>, <code>StepSlider</code> and <code>TextField</code>. These classes are released for add-ons and only ever get additions.',
    'Jedes Fenster, das sich in Propwash einklinkt, benutzt das Propwash-Theme: <code>ThemedScreen</code>, <code>ThemeDraw</code>, <code>ThemeText</code>, <code>Palette</code>, <code>Metrics</code>, <code>FlatButton</code>, <code>ScrollPanel</code>, <code>StepSlider</code> und <code>TextField</code>. Diese Klassen sind für Add-ons freigegeben und werden nur ergänzt.')}
`);

  const flight = section('flight', T.flight, `
${P('Since API 1.6 add-ons can give accessories behaviour, react to the pilot, push the drone and fly it. Everything is optional; without an add-on using it Propwash flies exactly as before. Details, limits and threads: <code>docs/design/addon-api-1.6.md</code> in the source repository.',
    'Seit API 1.6 können Add-ons Zubehör Verhalten geben, auf den Piloten reagieren, die Drohne anschieben und sie fliegen. Alles ist optional; ohne Add-on, das es benutzt, fliegt Propwash genau wie vorher. Einzelheiten, Grenzen und Threads: <code>docs/design/addon-api-1.6.md</code> im Quellcode-Repository.')}
${h3('flight-mount', 'Front mount', 'Halterung vorne')}
${P('Besides <code>top</code> and <code>bottom</code> there is <code>front</code> (<code>AccessorySlot.FRONT</code>): the accessory hangs under the nose and points forward. Every built-in frame except the Whoop has it; own frames add <code>"front"</code> to <code>accessory_mounts</code> and an anchor <code>accessory_anchors.front</code>.',
    'Neben <code>top</code> und <code>bottom</code> gibt es <code>front</code> (<code>AccessorySlot.FRONT</code>): Das Zubehör hängt unter der Nase und zeigt nach vorn. Alle eingebauten Rahmen außer dem Whoop haben die Halterung; eigene Rahmen ergänzen <code>"front"</code> in <code>accessory_mounts</code> und einen Anbaupunkt <code>accessory_anchors.front</code>.')}
${h3('flight-behaviour', 'Accessory behaviour, inventory and actions', 'Zubehör-Verhalten, Inventar und Aktionen')}
${code(`PropwashApi.accessories().register(LAUNCHER, new AccessoryBehavior() {
    @Override public int slots() { return 4; }
    @Override public boolean accepts(int slot, ItemStack stack) { return stack.is(Items.ARROW); }
    @Override public void onAction(AccessoryAction action) {
        if (action.number() != 1 || !action.pressed()) return;
        int slot = action.inventory().firstFilled();
        if (slot < 0) return;
        ItemStack ammo = action.inventory().take(slot, 1);
        MountPose mount = action.mount();
        // spawn the projectile at mount.front(), owner action.player()
        action.physics().impulse(mount.forward().scale(-1.0), new Vec3(0.0, -0.03, -0.08));
    }
});`, 'java')}
${P('Players fill the inventory with the <em>Accessories</em> button in the drone’s service menu; the load stays with drone and item and adds weight in flight. <em>Accessory action 1–4</em> are switch functions in the <em>Modes</em> tab and keys (numpad 9, 0, Enter and +; numpad 8 is turtle mode); every press and release is checked by the server (pilot, reset epoch, rate; a release only counts while the action is held) before <code>onAction</code> runs and <code>ACCESSORY_ACTION</code> fires. The <em>Accessories</em> window reads the drone’s current state before every access and writes back only the slots it changed itself, so writes through <code>AccessoryInventory</code> on the server and several open windows do not clash. It never takes shulker boxes (<code>Item#canFitInsideContainerItems</code>) or drone items with accessory contents of their own, even when <code>accepts</code> returns its default <code>true</code>.',
    'Spieler füllen das Inventar mit dem Knopf <em>Zubehör</em> in der Wartung der Drohne; die Beladung bleibt an Drohne und Item und wiegt im Flug mit. <em>Zubehör-Aktion 1–4</em> sind Schalterfunktionen im Tab <em>Modi</em> und Tasten (Ziffernblock 9, 0, Enter und +; Ziffernblock 8 ist der Turtle-Modus); jedes Drücken und Loslassen prüft der Server (Pilot, Reset-Epoche, Rate; ein Loslassen zählt nur, solange die Aktion gehalten ist), bevor <code>onAction</code> läuft und <code>ACCESSORY_ACTION</code> feuert. Das Fenster <em>Zubehör</em> liest vor jedem Zugriff den Stand der Drohne neu und schreibt nur die Plätze zurück, die es selbst geändert hat; Schreiben über <code>AccessoryInventory</code> am Server und mehrere offene Fenster vertragen sich damit. Shulkerkisten (<code>Item#canFitInsideContainerItems</code>) und Drohnen-Items mit eigenem Zubehör-Inhalt nimmt es nie an, auch wenn <code>accepts</code> die Vorgabe <code>true</code> liefert.')}
${h3('flight-physics', 'Impulses, pushes and forces', 'Stöße, Schübe und Kräfte')}
${P('<code>PropwashApi.drones().physics(drone)</code> gives <code>impulse(J, framePoint)</code> in N·s and <code>push(F, frameRelative, framePoint, seconds)</code> in N; Propwash sends them to the pilot’s flight model, the server return flight or a parked drone. Continuous forces (balloon, parachute) come from <code>PropwashApi.flight().registerForces(id, profile -> provider)</code> at 100 Hz on both sides. <code>PropwashApi.drones()</code> also finds drones near a point or a mob (with line of sight), aims with lead (<code>aim</code>) and scans for obstacles in six directions.',
    '<code>PropwashApi.drones().physics(drone)</code> liefert <code>impulse(J, rahmenpunkt)</code> in N·s und <code>push(F, rahmenrelativ, rahmenpunkt, sekunden)</code> in N; Propwash schickt sie an das Flugmodell des Piloten, den Heimflug am Server oder eine abgestellte Drohne. Dauerhafte Kräfte (Ballon, Fallschirm) kommen von <code>PropwashApi.flight().registerForces(id, profil -> anbieter)</code> mit 100 Hz auf beiden Seiten. <code>PropwashApi.drones()</code> findet außerdem Drohnen nahe einem Punkt oder einem Mob (mit Sichtprüfung), zielt mit Vorhalt (<code>aim</code>) und sucht Hindernisse in sechs Richtungen.')}
${h3('flight-assist', 'Flight assists', 'Flughilfen')}
${code(`PropwashApi.flight().registerAssist("examplemod:cine",
        profile -> profile.hasAccessory("examplemod:gimbal_cam") ? new CineAssist() : null);`, 'java')}
${P('A <code>FlightAssist</code> runs at 100 Hz inside the pilot’s flight model and gets a <code>FlightState</code> (true and GPS/barometer-estimated position and velocity, attitude, sticks, accessory actions, obstacle distances). Through <code>AssistOutput</code> it sets sticks and mode, an altitude or climb rate, a position or velocity with a speed limit (Propwash’s ALTHOLD/POSHOLD loops with their sensor errors), a yaw rate or heading, an OSD label and may start GPS Rescue. Assists rest during GPS Rescue. While an add-on assist outputs anything (sticks, mode, altitude, position, velocity, yaw), the race lap counts as an assisted lap: reason <code>other</code> with the assist’s id as subject (characters <code>[a-z0-9_:./-]</code>, at most 48). If it holds altitude or position without the pilot having switched a hold mode, only the assist is named, not “altitude hold was on”. Forces from <code>registerForces</code> do not count.',
    'Eine <code>FlightAssist</code> läuft mit 100 Hz im Flugmodell des Piloten und bekommt einen <code>FlightState</code> (wahre und per GPS/Barometer geschätzte Position und Geschwindigkeit, Lage, Knüppel, Zubehör-Aktionen, Hindernisabstände). Über <code>AssistOutput</code> setzt sie Knüppel und Modus, eine Höhe oder Steigrate, eine Position oder Geschwindigkeit mit Tempogrenze (die Regelkreise von ALTHOLD/POSHOLD mit ihren Sensorfehlern), eine Gierrate oder einen Kurs, eine OSD-Anzeige und darf GPS Rescue starten. Während GPS Rescue ruhen Flughilfen. Solange eine Flughilfe eines Add-ons etwas ausgibt (Knüppel, Modus, Höhe, Position, Tempo, Gieren), zählt die Rennrunde als Runde mit Flughilfe: Grund <code>other</code> mit der Id der Flughilfe als Gegenstand (Zeichen <code>[a-z0-9_:./-]</code>, höchstens 48). Hält sie Höhe oder Position, ohne dass der Pilot selbst Halten geschaltet hat, steht nur sie in der Wertung, nicht „Höhe halten war an“. Kräfte aus <code>registerForces</code> zählen nicht.')}
${h3('flight-client', 'Gimbal camera and HUD', 'Gimbal-Kamera und HUD')}
${P('<code>PropwashClientApi.registerGimbal(id, provider)</code> sets the world attitude of the FPV camera (also for spectators); <code>GimbalModel</code> is a ready-made stabilised 3-axis gimbal. <code>PropwashClientApi.registerHudElement(id, element)</code> draws own HUD elements with <code>FlightTelemetry</code> inside the picture area and may replace the Propwash OSD. <code>PropwashClientApi.input()</code> reads sticks and accessory actions.',
    '<code>PropwashClientApi.registerGimbal(id, anbieter)</code> setzt die Weltlage der FPV-Kamera (auch für Zuschauer); <code>GimbalModel</code> ist ein fertiger stabilisierter 3-Achsen-Gimbal. <code>PropwashClientApi.registerHudElement(id, element)</code> zeichnet eigene HUD-Elemente mit <code>FlightTelemetry</code> im Bildbereich und darf das Propwash-OSD ersetzen. <code>PropwashClientApi.input()</code> liest Knüppel und Zubehör-Aktionen.')}
`);

  const api17 = section('api-17', T['api-17'], `
${P('API 1.7 comes with Propwash 0.6.0 (network protocol 19), together with the small additions of API 1.8 (cargo at the gripper, recessed accessories). It closes the gaps for which add-ons needed mixins into Propwash internals so far. Everything is optional: without an add-on using it, Propwash behaves as before. Declare the dependency as in <a href="#setup-metadata">the loader metadata</a> and check the version at start-up with <code>PropwashApi.requireVersion(modId, "1.7")</code>; if you only use parts of 1.7, ask <code>PropwashApi.isCompatible("1.7")</code> and switch the new parts off otherwise.',
    'API 1.7 kommt mit Propwash 0.6.0 (Netzprotokoll 19), zusammen mit den kleinen Ergänzungen der API 1.8 (Fracht am Greifer, eingerücktes Zubehör). Sie schließt die Lücken, für die Add-ons bisher Mixins in Propwash-Interna brauchten. Alles ist optional: Ohne Add-on, das es benutzt, verhält sich Propwash wie vorher. Die Abhängigkeit wie in den <a href="#setup-metadata">Loader-Metadaten</a> angeben und beim Start die Version mit <code>PropwashApi.requireVersion(modId, "1.7")</code> prüfen; wer 1.7 nur teilweise nutzt, fragt <code>PropwashApi.isCompatible("1.7")</code> und schaltet die neuen Teile sonst ab.')}
${h3('api-17-blocks', 'Building blocks', 'Bausteine')}
${table([['Building block', 'Baustein'], ['Entry point', 'Einstieg'], ['What it does', 'Was es kann']], [
    [L('Switches and axes', 'Schalter und Achsen'), L('<code>PropwashApi.switches()</code> (<code>SwitchSpec</code>, <code>AxisSpec</code>), <code>PropwashClientApi.bindSwitchKey</code>, <code>bindAxisKeys</code>, <code>ClientInput#switchActive</code>, <code>#axis</code>, event <code>ADDON_SWITCH_CHANGED</code>', '<code>PropwashApi.switches()</code> (<code>SwitchSpec</code>, <code>AxisSpec</code>), <code>PropwashClientApi.bindSwitchKey</code>, <code>bindAxisKeys</code>, <code>ClientInput#switchActive</code>, <code>#axis</code>, Event <code>ADDON_SWITCH_CHANGED</code>'), L('own switches, buttons and analog channels on the <em>Add-ons</em> page of the <em>Modes</em> tab, assigned like built-in functions; with <code>serverSync</code> also on the server', 'eigene Schalter, Taster und analoge Kanäle auf der Seite <em>Add-ons</em> im Tab <em>Modi</em>, belegbar wie eingebaute Funktionen; mit <code>serverSync</code> auch am Server')],
    [L('Names of accessory actions', 'Namen der Zubehör-Aktionen'), L('<code>AccessoryBehavior#actionNameKey(int)</code>', '<code>AccessoryBehavior#actionNameKey(int)</code>'), L('“Accessory action 1 – Fire launcher” in the <em>Modes</em> tab and a hint on the first flight', '„Zubehör-Aktion 1 – Werfer feuern“ im Tab <em>Modi</em> und ein Hinweis beim ersten Flug')],
    [L('OSD elements and warnings', 'OSD-Elemente und Warnungen'), L('<code>PropwashClientApi.registerOsdElement(OsdElementSpec)</code>, <code>registerOsdWarning(Identifier, OsdWarning)</code>', '<code>PropwashClientApi.registerOsdElement(OsdElementSpec)</code>, <code>registerOsdWarning(Identifier, OsdWarning)</code>'), L('text in the OSD grid, placeable in the OSD editor (group <em>Add-ons</em>); warnings in the built-in warning area', 'Text im OSD-Raster, im OSD-Editor platzierbar (Gruppe <em>Add-ons</em>); Warnungen im eingebauten Warnfeld')],
    [L('Collision rules', 'Kollisionsregeln'), L('<code>DroneAccess#registerCollisionRule(Identifier, CollisionRule)</code>, <code>CollisionFlags</code>, <code>CollisionQuery</code>, <code>BlockContact</code>', '<code>DroneAccess#registerCollisionRule(Identifier, CollisionRule)</code>, <code>CollisionFlags</code>, <code>CollisionQuery</code>, <code>BlockContact</code>'), L('fly through blocks, water, entities and vines, or change how touched surfaces answer; the server decides on its own, and laps count as assisted', 'durch Blöcke, Wasser, Entities und Ranken fliegen oder die Antwort berührter Flächen ändern; der Server entscheidet selbst, Runden zählen mit Flughilfe')],
    [L('Dispensing', 'Werfen wie ein Dispenser'), L('<code>AccessoryContext#dispense(int, DispenseOptions)</code> → <code>DispenseResult</code>, <code>AccessoryRegistry#triggerAction(…)</code>', '<code>AccessoryContext#dispense(int, DispenseOptions)</code> → <code>DispenseResult</code>, <code>AccessoryRegistry#triggerAction(…)</code>'), L('vanilla dispenser behaviour from the mount in any direction, with build rights, optionally without using up items, with recoil in the flight model; triggering on the server', 'Vanilla-Verhalten aus der Halterung in jede Richtung, mit Bau-Rechten, auf Wunsch ohne Verbrauch, mit Rückstoß im Flugmodell; Auslösen am Server')],
    [L('Showing the load', 'Inhalt sichtbar'), L('<code>AccessoryBehavior#display(int)</code> → <code>ItemDisplay</code>', '<code>AccessoryBehavior#display(int)</code> → <code>ItemDisplay</code>'), L('items in the accessory (a spear, a rocket) shown on the drone for everyone', 'eingesetzte Items (Speer, Rakete) an der Drohne, für alle sichtbar')],
    [L('Explosion and wind pushes', 'Explosions- und Windstöße'), L('event <code>DRONE_KNOCKBACK</code> (<code>DroneKnockback</code>)', 'Event <code>DRONE_KNOCKBACK</code> (<code>DroneKnockback</code>)'), L('a push into the flight model of flown drones, only when an add-on asks for it (default scale 0)', 'Stoß ins Flugmodell geflogener Drohnen, nur wenn ein Add-on ihn anfordert (Standard-Skala 0)')],
    [L('All drones, camera pose', 'Alle Drohnen, Kamerablick'), L('<code>DroneAccess#loaded(ServerLevel)</code>, <code>#cameraPose(Entity)</code> → <code>CameraPose</code>', '<code>DroneAccess#loaded(ServerLevel)</code>, <code>#cameraPose(Entity)</code> → <code>CameraPose</code>'), L('every loaded drone of a level without an entity search; the view of the FPV camera on the server', 'alle geladenen Drohnen eines Levels ohne Entity-Suche; Blick der FPV-Kamera am Server')],
    [L('World rules', 'Welt-Regeln'), L('<code>PropwashApi.worldRules()</code> (<code>registerBoolean</code>, <code>registerInt</code>, <code>presetValue</code>, <code>raceNeutral</code>), <code>WorldRule#get</code>', '<code>PropwashApi.worldRules()</code> (<code>registerBoolean</code>, <code>registerInt</code>, <code>presetValue</code>, <code>raceNeutral</code>), <code>WorldRule#get</code>'), L('on/off and number rules in the add-on’s namespace, in their own section of the <em>World rules</em> tab and in the presets; race-relevant unless marked neutral', 'Schalter- und Zahlenregeln im eigenen Namensraum, eigener Abschnitt im Tab <em>Welt-Regeln</em>, auch in den Voreinstellungen; rennrelevant, außer als neutral markiert')],
    [L('Data on the drone', 'Daten an der Drohne'), L('<code>PropwashApi.droneData()</code> (<code>DroneDataKey</code>, <code>Sync</code>)', '<code>PropwashApi.droneData()</code> (<code>DroneDataKey</code>, <code>Sync</code>)'), L('typed data with a codec on the drone and its item, optionally synced to spectators; kept unchanged without the add-on (2 KiB per key, 8 KiB per drone)', 'typisierte Daten per Codec an Drohne und Item, auf Wunsch an Zuschauer abgeglichen; ohne Add-on unverändert erhalten (2 KiB je Schlüssel, 8 KiB je Drohne)')],
    [L('Autonomous flight', 'Autonomer Flug'), L('<code>DroneAccess#autonomy()</code> (<code>start</code>, <code>stop</code>, <code>active</code>, <code>registerExitHandler</code>), <code>AutonomyOptions</code>, <code>AssistOutput#land()</code>, event <code>AUTONOMY_ENDED</code>', '<code>DroneAccess#autonomy()</code> (<code>start</code>, <code>stop</code>, <code>active</code>, <code>registerExitHandler</code>), <code>AutonomyOptions</code>, <code>AssistOutput#land()</code>, Event <code>AUTONOMY_ENDED</code>'), L('the server flies the drone with the add-on’s flight assist: hold, follow, go to a point, carry on with a mission after FPV, take off from the ground and land; it ends with the battery', 'der Server fliegt die Drohne mit der Flughilfe des Add-ons: halten, folgen, einen Punkt anfliegen, eine Mission nach dem FPV weiterfliegen, vom Boden starten und landen; Ende mit dem Akku')],
    [L('Second operator', 'Zweiter Operator'), L('<code>DroneAccess#operators()</code> (<code>bind</code>, <code>unbind</code>, <code>operator</code>), <code>GimbalContext#operatorAxis</code>, <code>#operatorAction</code>, <code>ClientInput#operating()</code>', '<code>DroneAccess#operators()</code> (<code>bind</code>, <code>unbind</code>, <code>operator</code>), <code>GimbalContext#operatorAxis</code>, <code>#operatorAction</code>, <code>ClientInput#operating()</code>'), L('a second player steers the gimbal with their own radio; everyone sees the same attitude', 'ein zweiter Spieler steuert mit seiner Funke den Gimbal; alle sehen dieselbe Lage')],
    [L('Gimbal in recording and model', 'Gimbal in Aufnahme und Modell'), L('<code>GimbalProvider#stabilizesRecording()</code>, <code>#modelPose(…)</code>, <code>#fovDegrees(…)</code>, <code>PropwashClientApi.recording()</code>, <code>spectate(Entity)</code>', '<code>GimbalProvider#stabilizesRecording()</code>, <code>#modelPose(…)</code>, <code>#fovDegrees(…)</code>, <code>PropwashClientApi.recording()</code>, <code>spectate(Entity)</code>'), L('front action cam with the gimbal’s attitude, camera path, a turning gimbal head, focal length, recording and photos through the API, live view of your own drone', 'Action-Cam vorn mit der Lage des Gimbals, Kamerapfad, drehender Gimbal-Kopf, Brennweite, Aufnahme und Foto per API, Livebild der eigenen Drohne')],
    [L('Pilot change and service screen', 'Pilotenwechsel und Wartung'), L('event <code>PILOT_CHANGED</code>, <code>PropwashClientApi.registerServiceExtension(ServiceExtension)</code>', 'Event <code>PILOT_CHANGED</code>, <code>PropwashClientApi.registerServiceExtension(ServiceExtension)</code>'), L('every change of pilot on the server; own buttons in the service screen (up to three visible)', 'jeder Pilotenwechsel am Server; eigene Knöpfe in der Wartung (bis zu drei sichtbar)')],
    [L('Compass', 'Kompass'), L('<code>FlightState#compassHeadingDeg()</code>, <code>#compassErrorDeg()</code>, <code>#compassHealthy()</code>', '<code>FlightState#compassHeadingDeg()</code>, <code>#compassErrorDeg()</code>, <code>#compassHealthy()</code>'), L('the flight controller’s compass with its error, for flight assists', 'der Kompass des Flight-Controllers samt Fehler, für Flughilfen')],
    [L('Accessory shape', 'Zubehör-Form'), L('<code>AccessoryDefinition#ledPathMm()</code>, <code>#hangsStraight()</code>, <code>#muzzleMm()</code>, <code>#frames()</code> (JSON <code>led_path</code>, <code>hangs_straight</code>, <code>muzzle_mm</code>, <code>frames</code>); since 1.8 <code>#recessMm()</code>, <code>#dropMm()</code> (JSON <code>recess_mm</code>, <code>drop_mm</code>)', '<code>AccessoryDefinition#ledPathMm()</code>, <code>#hangsStraight()</code>, <code>#muzzleMm()</code>, <code>#frames()</code> (JSON <code>led_path</code>, <code>hangs_straight</code>, <code>muzzle_mm</code>, <code>frames</code>); seit 1.8 <code>#recessMm()</code>, <code>#dropMm()</code> (JSON <code>recess_mm</code>, <code>drop_mm</code>)'), L('LEDs along an own line (a ring, an arc, a strip along the arms), accessories without the mount’s tilt, the point where projectiles leave, accessories that only fit the frames listed (on any other frame the build problem <code>accessory_frame</code>), accessories moved back or down from their anchor (a launcher under the frame)', 'LEDs entlang einer eigenen Linie (Ring, Bogen, Leiste entlang der Arme), Zubehör ohne die Neigung der Halterung, der Punkt, an dem Geschosse austreten, Zubehör nur für die genannten Rahmen (an jedem anderen das Bauproblem <code>accessory_frame</code>), Zubehör hinter oder unter seinem Anker (ein Werfer unter dem Rahmen)')],
    [L('Cargo at the gripper (1.8)', 'Fracht am Greifer (1.8)'), L('<code>AccessoryRegistry#grabCargo(Entity, ServerPlayer)</code>, <code>#releaseCargo(Entity, ServerPlayer)</code>, <code>#cargo(Entity)</code>', '<code>AccessoryRegistry#grabCargo(Entity, ServerPlayer)</code>, <code>#releaseCargo(Entity, ServerPlayer)</code>, <code>#cargo(Entity)</code>'), L('opens the built-in gripper for 5 s and grabs items without a pilot too, drops the load like the pilot’s key and reads it; the server’s flight model counts cargo that comes or goes in flight', 'öffnet den eingebauten Greifer 5 s lang und greift auch ohne Pilot, lässt die Fracht los wie die Taste des Piloten und liest sie; das Flugmodell am Server rechnet Fracht mit, die im Flug dazukommt oder losgelassen wird')],
    [L('Share codes', 'Sharecodes'), L('<code>PropwashApi.shareCodes()</code> (<code>ShareCodes</code>, <code>ShareResult</code>, <code>ShareOptions</code>), <code>ShareTableCheck</code>, part table in the jar', '<code>PropwashApi.shareCodes()</code> (<code>ShareCodes</code>, <code>ShareResult</code>, <code>ShareOptions</code>), <code>ShareTableCheck</code>, Teile-Tabelle im Jar'), L('read, write and convert codes; short codes for the parts of every add-on (<a href="#share">Share codes</a>)', 'Codes lesen, schreiben und umrechnen; kurze Codes für die Teile jedes Add-ons (<a href="#share">Sharecodes</a>)')],
    [L('Race data', 'Renndaten'), L('<code>PropwashApi.race()</code> (<code>RaceData</code>, <code>BoardQuery</code>), <code>RaceEvents</code>', '<code>PropwashApi.race()</code> (<code>RaceData</code>, <code>BoardQuery</code>), <code>RaceEvents</code>'), L('read courses and leaderboards by course id, events for laps, races and records; the same data as JSON in the world folder', 'Kurse und Bestenlisten nach Kurs-Id lesen, Events für Runden, Rennen und Rekorde; dieselben Daten als JSON im Weltordner')],
  ])}
${P('Register switches, axes, collision rules, world rules, drone data, exit handlers and events in the <strong>common</strong> init (the same on both sides); keys, OSD elements and warnings, gimbals and service buttons in the <strong>client init</strong>. Every type and member is in the <a href="reference/">API reference</a>; the full guide with examples is <code>docs/api/addon-guide.md</code>, section 21, in the source repository.',
    'Schalter, Achsen, Kollisionsregeln, Welt-Regeln, Drohnen-Daten, Übergabe-Handler und Events in der <strong>gemeinsamen</strong> Init anmelden (auf beiden Seiten gleich); Tasten, OSD-Elemente und -Warnungen, Gimbals und Wartungsknöpfe in der <strong>Client-Init</strong>. Jeder Typ und jedes Mitglied steht in der <a href="reference/">API-Referenz</a>; das ganze Handbuch mit Beispielen ist <code>docs/api/addon-guide.md</code>, Abschnitt 21, im Quellcode-Repository.')}
${h3('api-17-interfaces', 'Existing interfaces', 'Bestehende Schnittstellen')}
${P('Every method added to an interface from 1.6 is a <code>default</code> method with a neutral result. Own implementations and test doubles (<code>FlightState</code>, <code>AssistOutput</code>, <code>GimbalContext</code>, <code>GimbalProvider</code>, <code>ClientInput</code>, <code>AccessoryBehavior</code>, <code>AccessoryContext</code>, <code>AccessoryRegistry</code>, <code>DroneAccess</code>) compile and run unchanged, and every signature of API 1.6 stays, including the old constructors of <code>AccessoryDefinition</code>. Records from 1.7 are only built through builders and factories (<code>SwitchSpec.builder</code>, <code>AxisSpec.builder</code>, <code>OsdElementSpec.builder</code>, <code>AutonomyOptions.of</code>, <code>DispenseOptions.defaults</code>, <code>ItemDisplay.at</code>, <code>ShareOptions.defaults</code>, <code>BoardQuery.laps</code>), because they get new fields in later minor versions.',
    'Jede neue Methode an einer Schnittstelle aus 1.6 ist eine <code>default</code>-Methode mit neutralem Ergebnis. Eigene Implementierungen und Test-Doubles (<code>FlightState</code>, <code>AssistOutput</code>, <code>GimbalContext</code>, <code>GimbalProvider</code>, <code>ClientInput</code>, <code>AccessoryBehavior</code>, <code>AccessoryContext</code>, <code>AccessoryRegistry</code>, <code>DroneAccess</code>) kompilieren und laufen unverändert, und jede Signatur der API 1.6 bleibt, auch die alten Konstruktoren von <code>AccessoryDefinition</code>. Records aus 1.7 entstehen nur über Builder und Fabriken (<code>SwitchSpec.builder</code>, <code>AxisSpec.builder</code>, <code>OsdElementSpec.builder</code>, <code>AutonomyOptions.of</code>, <code>DispenseOptions.defaults</code>, <code>ItemDisplay.at</code>, <code>ShareOptions.defaults</code>, <code>BoardQuery.laps</code>), weil sie in späteren Nebenversionen Felder bekommen.')}
${h3('api-17-namespace', 'The namespace propwash is reserved', 'Der Namensraum propwash ist reserviert')}
${list([
    ['New registration points of 1.7 and the points that already threw in 1.6 (parts, chemistries, accessory behaviours, HUD, gimbals, flight assists, forces, presets, loot tables, creative tabs) throw an <code>IllegalArgumentException</code>: <code>Mod \'x\' tried to register \'propwash:y\' (…): the namespace propwash is reserved for Propwash. Use your mod id.</code>', 'Neue Anmeldepunkte aus 1.7 und die Punkte, die schon in 1.6 warfen (Teile, Zellchemien, Zubehör-Verhalten, HUD, Gimbals, Flughilfen, Kräfte, Presets, Beute-Tabellen, Kreativ-Tabs), werfen eine <code>IllegalArgumentException</code>: <code>Mod \'x\' tried to register \'propwash:y\' (…): the namespace propwash is reserved for Propwash. Use your mod id.</code>'],
    ['Points that were tolerant so far (configurator tabs, workbench extensions, Flight School scenes) refuse the registration without an exception and log the same text as an error, so no add-on that started with 0.5.2 stops at start-up.', 'Bisher tolerante Punkte (Konfigurator-Tabs, Werkbank-Erweiterungen, Flugschul-Szenen) verweigern die Anmeldung ohne Ausnahme und schreiben denselben Text als Fehler ins Log; kein Add-on, das mit 0.5.2 startete, bricht so beim Start ab.'],
    ['At start-up and on reload Propwash looks for foreign entries under <code>propwash</code>: registry ids, translation keys, key mappings, network payloads, enum values added by mixins, data and asset files and <code>/propwash</code> subcommands. Findings go to the log and, once per game start, into the chat – never a crash. Resource and data packs of players may still override Propwash files.', 'Beim Start und beim Neuladen sucht Propwash fremde Einträge unter <code>propwash</code>: Registry-Ids, Übersetzungsschlüssel, Tastenbelegungen, Netzwerk-Pakete, per Mixin angehängte Enum-Werte, Daten- und Asset-Dateien und <code>/propwash</code>-Unterbefehle. Funde stehen im Log und einmal je Spielstart im Chat – nie ein Absturz. Ressourcen- und Datenpakete der Spieler dürfen Propwash-Dateien weiter überschreiben.'],
    ['Only exactly <code>propwash</code> is reserved; <code>propwash_example</code> or <code>propwashy</code> are namespaces of their own. Every crash report has a section <em>Propwash add-ons</em> with the add-ons, the mods with mixins into Propwash internals and the findings.', 'Reserviert ist nur genau <code>propwash</code>; <code>propwash_example</code> oder <code>propwashy</code> sind eigene Namensräume. Jeder Crash-Report hat einen Abschnitt <em>Propwash add-ons</em> mit den Add-ons, den Mods mit Mixins in Propwash-Interna und den Funden.'],
  ])}
${h3('api-17-mixins', 'Moving off mixins', 'Umstieg von Mixins')}
${P('A ghost mode that lets the drone fly through blocks needed mixins into Propwash internals until 0.5.2. With 1.7 it is a switch, a collision rule and an OSD warning – without a mixin, with a permission check on a dedicated server and without entries in the namespace <code>propwash</code>. The server evaluates the same rule itself, laps in ghost mode count as assisted, and Propwash takes care of the camera inside blocks.',
    'Ein Geistmodus, mit dem die Drohne durch Blöcke fliegt, brauchte bis 0.5.2 Mixins in Propwash-Interna. Mit 1.7 ist er ein Schalter, eine Kollisionsregel und eine OSD-Warnung – ohne Mixin, mit Rechteprüfung auf dem dedizierten Server und ohne Einträge im Namensraum <code>propwash</code>. Der Server wertet dieselbe Regel selbst aus, Runden im Geistmodus zählen mit Flughilfe, und um die Kamera in Blöcken kümmert sich Propwash.')}
${code(`public static final Identifier GHOST = id("ghost");

public static void init() {                                   // common init
    PropwashApi.requireVersion(MOD_ID, "1.7");
    PropwashApi.switches().register(SwitchSpec.builder(GHOST)
            .toggle(true).latchesOnGamepad(true).serverSync(true).build());
    PropwashApi.drones().registerCollisionRule(GHOST, query -> {
        if (query.autonomous() || !query.switchActive(GHOST)) return CollisionFlags.SOLID;
        if (query.side() == CollisionQuery.Side.SERVER && !query.pilot().map(ExampleMod::mayGhost).orElse(false)) {
            return CollisionFlags.SOLID;                          // without permission the server resets the drone
        }
        return CollisionFlags.GHOST;
    });
}

public static void initClient(KeyMapping ghostKey) {          // client init
    PropwashClientApi.bindSwitchKey(GHOST, ghostKey);
    PropwashClientApi.registerOsdWarning(GHOST, ctx ->
            PropwashClientApi.input().switchActive(GHOST) ? OsdText.of("GHOST", OsdTone.CAUTION) : null);
}`, 'java', L('a ghost mode with API 1.7', 'ein Geistmodus mit API 1.7'))}
${h3('api-17-breaks', 'What changes for mixin add-ons', 'Was sich für Mixin-Add-ons ändert')}
${P('Mixins into internals stay allowed, at your own risk; there is no compatibility layer. 0.6.0 changes among other things the switch mask (<code>int</code> → <code>long</code> in <code>RadioFrame</code>, <code>SwitchEvaluator</code> and their callers), generalises the server return flight to <code>rescue.ServerFlight</code>, changes the flight path in <code>PilotSession</code> and <code>DroneSim</code> (collision rules, surfaces, motor heat, freecam) and appends the OSD element <code>FLIGHT_PATH_MARKER</code>. A mixin with <code>require</code> on a changed target stops the game at start-up. Where it was possible, 0.6.0 kept the targets of existing add-ons with name and descriptor, but every later version may change them – the way forward is the API.',
    'Mixins in Interna bleiben erlaubt, auf eigenes Risiko; eine Kompatibilitätsschicht gibt es nicht. 0.6.0 ändert unter anderem die Schaltermaske (<code>int</code> → <code>long</code> in <code>RadioFrame</code>, <code>SwitchEvaluator</code> und ihren Aufrufern), verallgemeinert den Heimflug am Server zu <code>rescue.ServerFlight</code>, ändert den Flugweg in <code>PilotSession</code> und <code>DroneSim</code> (Kollisionsregeln, Oberflächen, Motor-Hitze, Freecam) und hängt das OSD-Element <code>FLIGHT_PATH_MARKER</code> an. Ein Mixin mit <code>require</code> auf eine geänderte Stelle bricht den Start ab. Wo es ging, hat 0.6.0 die Ziele vorhandener Add-ons mit Name und Deskriptor behalten, aber jede spätere Version darf sie ändern – der Weg nach vorn ist die API.')}
${h3('api-17-race', 'Race data for servers and bots', 'Renndaten für Server und Bots')}
${P('Servers and bots get their race data from Propwash itself: every course has a stable course id (a UUID) that its leaderboards hang off. A mod reads courses and leaderboards through <code>PropwashApi.race()</code> – read-only, on the server thread, as immutable snapshots – and listens to <code>RaceEvents</code> (lap, race, personal best, course record, course created, changed and deleted). Without a mod of your own, the same data lies as JSON in the world folder under <code>propwash/race-data/</code> (<code>courses.json</code>, <code>leaderboards/&lt;course-id&gt;.json</code>). Times only come from real flying: there is no way to write into leaderboards.',
    'Server und Bots bekommen ihre Renndaten von Propwash selbst: Jeder Kurs hat eine feste Kurs-Id (eine UUID), an der seine Bestenlisten hängen. Eine Mod liest Kurse und Bestenlisten über <code>PropwashApi.race()</code> – nur lesend, am Server-Thread, als unveränderliche Schnappschüsse – und hört auf <code>RaceEvents</code> (Runde, Rennen, persönliche Bestzeit, Kursrekord, Kurs angelegt, geändert, gelöscht). Ohne eigene Mod liegen dieselben Daten als JSON im Weltordner unter <code>propwash/race-data/</code> (<code>courses.json</code>, <code>leaderboards/&lt;kurs-id&gt;.json</code>). Zeiten entstehen nur durch echtes Fliegen: In Bestenlisten schreiben lässt sich nichts.')}
${code(`RaceData race = PropwashApi.race();                          // server thread only
List<CourseInfo> courses = race.courses(server);
Optional<BoardSnapshot> top = race.leaderboard(server, courseId, BoardQuery.laps().limit(10));
RaceEvents.COURSE_RECORD.register(record ->
        announce(record.courseName(), record.entry().name(), record.entry().timeMillis()));`, 'java')}
${h3('api-17-not', 'Not in 1.7', 'Nicht in 1.7')}
${P('Own radio items, more than one operator per drone, world rules of add-ons inside zones, gravity or wind per drone, free graphics in the OSD grid (use <code>HudElement</code> for that), accessories on the use key, add-on data in share codes, autonomous flight beyond the radio range, writing to leaderboards.',
    'Eigene Funken-Items, mehr als ein Operator je Drohne, Welt-Regeln von Add-ons in Zonen, Schwerkraft oder Wind je Drohne, freie Grafik im OSD-Raster (dafür <code>HudElement</code>), Zubehör auf der Benutzen-Taste, Add-on-Daten in Sharecodes, autonomer Flug außerhalb der Funkreichweite, Schreiben in Bestenlisten.')}
`);

  const eventsType = api.packages.flatMap((p) => p.types).find((t) => t.name === 'PropwashEvents');
  const eventRows = eventsType.members.filter((m) => m.kind === 'field').map((m) => {
    const listenerName = m.display.match(/PropwashEvent<([A-Za-z]+)>/)[1];
    const listener = eventsType.types.find((t) => t.name === listenerName);
    const method = listener.members[0].display.replace(/^void /, '');
    const info = EVENT_INFO[m.name];
    return [`${mono(m.name)}<br><code class="docs-sig">${esc(method)}</code>`, L(info.thread), L(info.when)];
  });
  const events = section('events', T.events, `
${table([['Event and listener', 'Event und Listener'], ['Thread', 'Thread'], ['When', 'Wann']], eventRows)}
${code(`PropwashEvents.DRONE_ASSEMBLED.register((player, drone, data) ->
        ExampleStats.built(player, data.build()));`, 'java')}
${P('Register listeners in the open phase. <code>fire</code> is internal.', 'Listener in der offenen Phase anmelden. <code>fire</code> ist intern.')}
`);

  const history = API_HISTORY.map((h) => [mono(h.version), L(h.text.en, h.text.de)]);
  const versions = section('versions', T.versions, `
${list([
    ['<strong>SemVer:</strong> the major version changes with every incompatible change, the minor version with additions, the patch version with fixes.', '<strong>SemVer:</strong> Die Hauptversion steigt bei jeder inkompatiblen Änderung, die Nebenversion bei Ergänzungen, der Patch bei Fehlerbehebungen.'],
    ['<strong>Stable:</strong> <code>api.*</code> plus the released internal types <code>ConfigTab</code>, <code>ConfigTabHost</code>, <code>StepSlider</code>, <code>Palette</code>, <code>Metrics</code>, <code>ThemeText</code>, <code>ThemeDraw</code>, <code>ThemedWidgets</code>, <code>ThemedScreen</code>, <code>FlatButton</code>, <code>ScrollPanel</code>, <code>TextField</code> and <code>guide.scene.*</code>. Everything else is internal and may change in any version.', '<strong>Stabil:</strong> <code>api.*</code> und die freigegebenen internen Typen <code>ConfigTab</code>, <code>ConfigTabHost</code>, <code>StepSlider</code>, <code>Palette</code>, <code>Metrics</code>, <code>ThemeText</code>, <code>ThemeDraw</code>, <code>ThemedWidgets</code>, <code>ThemedScreen</code>, <code>FlatButton</code>, <code>ScrollPanel</code>, <code>TextField</code> und <code>guide.scene.*</code>. Alles andere ist intern und darf sich in jeder Version ändern.'],
    ['<strong>Records:</strong> definitions only through builders; value records keep their canonical constructor (a new component comes with an extra constructor).', '<strong>Records:</strong> Definitionen nur über Builder; Wertrecords behalten ihren kanonischen Konstruktor (eine neue Komponente kommt mit einem zusätzlichen Konstruktor).'],
    ['<strong>Enums</strong> get new constants at the end in minor versions, so always <code>switch</code> with a <code>default</code>. <strong>Interfaces</strong> only get new methods with a default implementation.', '<strong>Enums</strong> bekommen in Nebenversionen neue Konstanten am Ende, also <code>switch</code> immer mit <code>default</code>. <strong>Interfaces</strong> bekommen neue Methoden nur mit Default-Implementierung.'],
    ['JSON <code>"format": 1</code> gains new optional fields in minor versions. Anything deprecated is announced at least one minor version ahead and only removed in the next major version.', 'JSON <code>"format": 1</code> bekommt in Nebenversionen neue optionale Felder. Veraltetes wird mindestens eine Nebenversion vorher angekündigt und erst in der nächsten Hauptversion entfernt.'],
  ])}
${h3('versions-history', 'API versions', 'API-Versionen')}
${table([['API', 'API'], ['Added', 'Neu']], history)}
${P(`Propwash ${v} ships API ${api.version} and network protocol ${meta.protocol}.`, `Propwash ${v} bringt API ${api.version} und Netzwerkprotokoll ${meta.protocol}.`)}
`);

  const multiplayer = section('multiplayer', T.multiplayer, list([
    ['When a player connects, Propwash compares the Propwash version, the network protocol, the add-on list and the part lists of server and client (ids and a short hash per definition). If the server has parts the player lacks (or a different version of them), or the protocol differs, the player cannot join: the flight model runs on the client and has to see the same data. The player then sees the join overview with one card per add-on – which version to install, update or remove, and a link from your loader metadata (see <a href="#setup-join">Name, version and homepage</a>); the server log lists the same differences.', 'Beim Verbinden vergleicht Propwash Version, Netzprotokoll, Add-on-Liste und Teile-Listen von Server und Client (Ids und ein kurzer Hash je Definition). Fehlen dem Spieler Teile des Servers (oder hat er sie in anderer Version) oder weicht das Protokoll ab, kann der Spieler nicht beitreten: Das Flugmodell läuft auf dem Client und muss dieselben Daten sehen. Der Spieler sieht dann die Beitritts-Übersicht mit einer Karte je Add-on – welche Version er installieren, aktualisieren oder entfernen soll, und einen Link aus deinen Loader-Metadaten (siehe <a href="#setup-join">Name, Version und Homepage</a>); das Server-Log nennt dieselben Unterschiede.'],
    ['An add-on without parts that only one side has (for example a pure HUD add-on on the client) does not block joining; the overview lists it only as a note.', 'Ein Add-on ohne Teile, das nur eine Seite hat (etwa ein reines HUD-Add-on beim Client), blockiert den Beitritt nicht; die Übersicht nennt es nur als Hinweis.'],
    ['<strong>Add-on only on the player’s side (since 0.5.0):</strong> a player with your add-on may join a server without it. Propwash switches the add-on off for that session and shows “Add-on inactive on this server”: its parts and cell chemistries, part items, creative tab, presets, workbench extensions, configurator tabs and Flight School scenes are hidden, and imports with its parts are not sent. Ask for the state with <code>PropwashClientApi.isAddonActive("&lt;modid&gt;")</code> (API 1.5). For this to work: create every id (parts, items, presets, workbench extensions, tabs <code>&lt;modid&gt;:…</code>, scenes <code>&lt;modid&gt;:…</code>) in the namespace of your mod id; register your own items, blocks or entities only if you must and hide directly registered items while the add-on is inactive; register network channels as <em>optional</em> (NeoForge: <code>event.registrar("1").optional()</code>) and check before sending (<code>connection.hasChannel(…)</code>, Fabric <code>ClientPlayNetworking.canSend(…)</code>); never send anything about your parts yourself – use <code>sendImport</code>/<code>sendCreateDrone</code>. Server-side features (commands, loot, recipes, server events) only run where the add-on is installed anyway.',
      '<strong>Add-on nur beim Spieler (seit 0.5.0):</strong> Ein Spieler mit deinem Add-on darf einem Server ohne es beitreten. Propwash schaltet das Add-on für diese Sitzung ab und zeigt „Add-on auf diesem Server inaktiv“: Seine Teile und Zellchemien, Teil-Items, Kreativ-Tab, Presets, Werkbank-Erweiterungen, Konfigurator-Tabs und Flugschul-Szenen sind ausgeblendet, Importe mit seinen Teilen werden nicht gesendet. Den Zustand fragst du mit <code>PropwashClientApi.isAddonActive("&lt;modid&gt;")</code> ab (API 1.5). Damit das klappt: Lege jede Id (Teile, Items, Presets, Werkbank-Erweiterungen, Tabs <code>&lt;modid&gt;:…</code>, Szenen <code>&lt;modid&gt;:…</code>) im Namensraum deiner Mod-Id an; registriere eigene Items, Blöcke oder Entities nur, wenn es sein muss, und blende direkt registrierte Items aus, solange das Add-on inaktiv ist; melde Netzwerk-Kanäle <em>optional</em> an (NeoForge: <code>event.registrar("1").optional()</code>) und prüfe vor dem Senden (<code>connection.hasChannel(…)</code>, Fabric <code>ClientPlayNetworking.canSend(…)</code>); sende nie selbst etwas über deine Teile – nimm <code>sendImport</code>/<code>sendCreateDrone</code>. Server-Funktionen (Befehle, Beute, Rezepte, Server-Events) laufen ohnehin nur dort, wo das Add-on installiert ist.'],
    ['If an add-on is removed from a world, drones with its parts survive: Propwash keeps the unknown id in a placeholder part (not armable, tooltip “Unknown part”). When the add-on comes back, the drone is complete again.', 'Wird ein Add-on aus einer Welt entfernt, bleiben Drohnen mit seinen Teilen erhalten: Propwash behält die unbekannte Id in einem Platzhalter (nicht scharfschaltbar, Tooltip „Unbekanntes Bauteil“). Kommt das Add-on zurück, ist die Drohne wieder vollständig.'],
  ]));

  const webConfigurator = section('web-configurator', T['web-configurator'], `
${P(`The <a href="${prefix}configurator/">configurator on this website</a> shows the parts of add-ons next to Propwash’s own: players compare them, build with them and share codes. It gets them in two ways, and in neither is anything uploaded.`,
    `Der <a href="${prefix}configurator/">Konfigurator auf dieser Website</a> zeigt die Teile von Add-ons neben denen von Propwash: Spieler vergleichen sie, bauen damit und teilen Codes. Er bekommt sie auf zwei Wegen, und bei keinem wird etwas hochgeladen.`)}
${list([
    ['<strong>Your jar in the browser:</strong> with the <em>Open add-on jar</em> button a player opens your jar right in the configurator. It is read only in memory and forgotten on reload: id, name and version from <code>fabric.mod.json</code> or <code>META-INF/neoforge.mods.toml</code>, the part files <code>data/&lt;namespace&gt;/propwash_parts/&lt;category&gt;/*.json</code>, the texts in <code>assets/&lt;namespace&gt;/lang/</code>, models, textures and the part table. Parts you register only in Java can’t be seen this way: they show as unknown, with the hint that the add-on needs a web export.',
      '<strong>Dein Jar im Browser:</strong> Über den Knopf <em>Add-on-Jar öffnen</em> lädt ein Spieler dein Jar direkt in den Konfigurator. Es wird nur im Speicher gelesen und beim Neuladen vergessen: Id, Name und Version aus <code>fabric.mod.json</code> bzw. <code>META-INF/neoforge.mods.toml</code>, die Teile-Dateien <code>data/&lt;namensraum&gt;/propwash_parts/&lt;art&gt;/*.json</code>, die Texte in <code>assets/&lt;namensraum&gt;/lang/</code>, Modelle, Texturen und die Teile-Tabelle. Teile, die du nur in Java anmeldest, sieht der Browser so nicht: Sie erscheinen als unbekannt, mit dem Hinweis, dass das Add-on einen Web-Export braucht.'],
    [`<strong>Your web export in the directory:</strong> for the add-ons of the <a href="${prefix}addons/">add-on directory</a> the configurator loads their web export by itself, each with a switch in its add-on bar. A web export also carries parts registered in Java, your presets with their key figures and PW3 codes, and the models.`,
      `<strong>Dein Web-Export im Verzeichnis:</strong> Für die Add-ons im <a href="${prefix}addons/">Add-on-Verzeichnis</a> lädt der Konfigurator ihren Web-Export selbst, jedes mit einem Schalter in seiner Add-on-Leiste. Ein Web-Export bringt auch Teile mit, die in Java angemeldet sind, dazu deine Presets mit Kennzahlen und PW3-Codes und die Modelle.`],
  ])}
${P('<code>/propwash webexport</code> writes this data package: parts, mounts, cell chemistries, presets, analyses, texts and models, one folder per namespace plus <code>base/</code> for Propwash’s own rules, paint slots and tune groups. Every add-on gets its export without code of its own – Propwash exports what you registered through the API.',
    '<code>/propwash webexport</code> schreibt dieses Datenpaket: Teile, Halterungen, Zellchemien, Presets, Analysen, Texte und Modelle, ein Ordner je Namensraum und dazu <code>base/</code> mit Propwashs eigenen Regeln, Lack-Plätzen und Tuning-Gruppen. Jedes Add-on bekommt seinen Export ohne eigenen Code – Propwash exportiert, was du über die API angemeldet hast.')}
${table([['Command', 'Befehl'], ['Writes', 'Schreibt']], [
    [L('<code>/propwash webexport &lt;namespace&gt;</code>', '<code>/propwash webexport &lt;namensraum&gt;</code>'), L('only <code>&lt;namespace&gt;/</code> – the export of your add-on', 'nur <code>&lt;namensraum&gt;/</code> – der Export deines Add-ons')],
    ['<code>/propwash webexport propwash</code>', L('<code>base/</code> and <code>propwash/</code>', '<code>base/</code> und <code>propwash/</code>')],
    [L('<code>/propwash webexport</code> or <code>/propwash webexport all</code>', '<code>/propwash webexport</code> oder <code>/propwash webexport all</code>'), L('<code>base/</code> and every namespace with parts, presets or cell chemistries', '<code>base/</code> und jeden Namensraum mit Teilen, Presets oder Zellchemien')],
  ])}
${list([
    ['Permission level 4: the server console, an operator with level 4, or in singleplayer the host with cheats allowed. Tab completion offers <code>all</code> and every namespace.', 'Rechtestufe 4: die Server-Konsole, ein Operator mit Stufe 4 oder im Einzelspieler der Host mit erlaubten Cheats. Die Tab-Vervollständigung bietet <code>all</code> und jeden Namensraum an.'],
    ['The export goes to <code>&lt;game folder&gt;/propwash/web-export/</code>, and the folder is emptied before every run. The same mods give byte-identical files; only <code>generated_at</code> in the top <code>manifest.json</code> changes.', 'Der Export landet in <code>&lt;spielordner&gt;/propwash/web-export/</code>, und der Ordner wird vor jedem Lauf geleert. Gleiche Mods ergeben byte-gleiche Dateien; nur <code>generated_at</code> im obersten <code>manifest.json</code> ändert sich.'],
    ['It runs on the server thread and holds the server for several seconds – not in the middle of a race.', 'Er rechnet auf dem Server-Thread und hält den Server für einige Sekunden an – also nicht mitten im Rennen.'],
    ['The chat names parts, namespaces, warnings and the folder; the log gets one line <code>Propwash-Web-Export: PASS …</code> or <code>… FAIL …</code>, the details are in <code>problems.json</code>. <code>FAIL</code> means an error: a build rule that differs from <code>PropwashApi.builds().check</code>, or a preset whose default tune can’t be computed. Missing texts, help texts, models or part-table entries are warnings.', 'Der Chat nennt Teile, Namensräume, Warnungen und den Ordner; ins Log kommt eine Zeile <code>Propwash-Web-Export: PASS …</code> bzw. <code>… FAIL …</code>, Einzelheiten stehen in <code>problems.json</code>. <code>FAIL</code> heißt Fehler: eine Bauregel, die von <code>PropwashApi.builds().check</code> abweicht, oder ein Preset, dessen Standard-Tuning sich nicht berechnen lässt. Fehlende Texte, Hilfen, Modelle oder Einträge der Teile-Tabelle sind Warnungen.'],
    ['Texts, models and the part table are found only if your mod id equals your namespace (<a href="#rules">rules for add-ons</a>).', 'Texte, Modelle und die Teile-Tabelle findet der Export nur, wenn deine Mod-Id gleich deinem Namensraum ist (<a href="#rules">Regeln für Add-ons</a>).'],
  ])}
${P('Without starting the game: in a checkout of the Propwash source code, the Gradle task <code>runWebExport</code> starts a dedicated server without the example add-on, exports your namespace with your jar loaded and stops; the result is in <code>build/web-export/</code>.',
    'Ohne das Spiel zu starten: In einem Checkout des Propwash-Quellcodes startet der Gradle-Task <code>runWebExport</code> einen dedizierten Server ohne das Beispiel-Add-on, exportiert deinen Namensraum mit deinem geladenen Jar und beendet sich; das Ergebnis liegt in <code>build/web-export/</code>.')}
${code('./gradlew :fabric:runWebExport -PpropwashWebExportSelection=<namespace> -PpropwashWebExportMods=<path/to/your-addon.jar>', 'shell')}
${P(`To bring your add-on into the configurator for everyone, send the export of your namespace with your <a href="${prefix}addons/#listing">listing request</a>. The directory keeps it per version, and the configurator loads the version the directory names. The full format is described in <code>docs/web-export.md</code> of the Propwash source code.`,
    `Damit dein Add-on für alle im Konfigurator steht, schick den Export deines Namensraums mit deinem <a href="${prefix}addons/#listing">Antrag auf einen Eintrag</a>. Das Verzeichnis legt ihn je Version ab, und der Konfigurator lädt die Version, die das Verzeichnis nennt. Das ganze Format beschreibt <code>docs/web-export.md</code> im Propwash-Quellcode.`)}
`);

  const example = section('example', T.example, `
${P('The Propwash source code contains a complete example add-on in the namespace <code>propwash_example</code> (<code>common/src/devtest/java/de/lardtom/propwash/dev/example/</code>, MIT licensed) that uses <strong>only the API</strong>: version check, events, three parts in Java (2806.5 motor, 13″ carbon prop, stretched-X race frame with its own arms), five parts and a cell chemistry in JSON, items, a preset, its own creative tab, a workbench button with a child screen (preview, part check, import), a configurator tab (OSD layout via the clipboard, rates on the held drone) and a Flight School scene linked to its frames.',
    'Der Propwash-Quellcode enthält ein vollständiges Beispiel-Add-on im Namensraum <code>propwash_example</code> (<code>common/src/devtest/java/de/lardtom/propwash/dev/example/</code>, MIT-lizenziert), das <strong>nur die API</strong> benutzt: Versionsprüfung, Events, drei Teile in Java (Motor 2806,5, 13″-Carbon-Prop, Stretched-X-Race-Rahmen mit eigenen Armen), fünf Teile und eine Zellchemie in JSON, Items, ein Preset, ein eigener Kreativ-Tab, ein Werkbank-Knopf mit Kind-Fenster (Vorschau, Teile-Check, Import), ein Konfigurator-Tab (OSD-Layout über die Zwischenablage, Rates auf die gehaltene Drohne) und eine Flugschul-Szene, die mit seinen Rahmen verknüpft ist.')}
${P(`Its deadcat frame as JSON is shown on the <a href="${prefix}docs/parts-format/#example-addon">parts format page</a>. <em>Propwash: Just More Parts</em> is the first real add-on built the same way.`,
    `Sein Deadcat-Rahmen als JSON steht auf der <a href="${prefix}docs/parts-format/#example-addon">Seite zum Teile-Format</a>. <em>Propwash: Just More Parts</em> ist das erste echte Add-on, das genauso gebaut ist.`)}
`);

  const checklist = section('checklist', T.checklist, `
${list([
    [`<code>requireVersion</code> at start-up, dependency <code>&gt;=${range.fabric}</code> (Fabric) and <code>[${range.neoforge},)</code> (NeoForge) in the loader metadata, <code>side = "BOTH"</code>.`, `<code>requireVersion</code> beim Start, Abhängigkeit <code>&gt;=${range.fabric}</code> (Fabric) und <code>[${range.neoforge},)</code> (NeoForge) in den Loader-Metadaten, <code>side = "BOTH"</code>.`],
    ['Parts and items in the <strong>common</strong> init, client extensions in the client init.', 'Teile und Items in der <strong>gemeinsamen</strong> Init, Client-Erweiterungen in der Client-Init.'],
    ['Every id: path only <code>[a-z0-9_.-]</code>, unique across all categories, in your own namespace – never <code>propwash</code> (<a href="#rules">rules for add-ons</a>).', 'Jede Id: Pfad nur <code>[a-z0-9_.-]</code>, eindeutig über alle Kategorien, im eigenen Namensraum – nie <code>propwash</code> (<a href="#rules">Regeln für Add-ons</a>).'],
    ['A part table for share codes in your jar (<a href="#share">Share codes</a>), checked with <code>ShareTableCheck</code>.', 'Eine Teile-Tabelle für Sharecodes im Jar (<a href="#share">Sharecodes</a>), geprüft mit <code>ShareTableCheck</code>.'],
    ['An item icon <code>assets/&lt;ns&gt;/items/&lt;path&gt;.json</code> and a name <code>part.&lt;ns&gt;.&lt;path&gt;</code> for every part, in English and German.', 'Ein Item-Symbol <code>assets/&lt;ns&gt;/items/&lt;pfad&gt;.json</code> und ein Name <code>part.&lt;ns&gt;.&lt;pfad&gt;</code> für jedes Teil, auf Englisch und Deutsch.'],
    ['New mounts appear on at least one frame <em>and</em> one part (otherwise Propwash warns when the registry freezes).', 'Neue Halterungen tauchen bei mindestens einem Rahmen <em>und</em> einem Teil auf (sonst warnt Propwash beim Einfrieren).'],
  ])}
${table([['Message or behaviour', 'Meldung oder Verhalten'], ['Cause', 'Ursache']], [
    [mono('IllegalStateException … Propwash-API …'), L('Propwash too old or a new major version', 'Propwash zu alt oder neue Hauptversion')],
    [L('<code>IllegalStateException</code> on <code>register</code>', '<code>IllegalStateException</code> beim <code>register</code>'), L('registered after the registry froze (for example from an event or the client init)', 'nach dem Einfrieren angemeldet (zum Beispiel aus einem Event oder der Client-Init)')],
    [L('Start-up stops with a list of JSON files', 'Start bricht mit einer Liste von JSON-Dateien ab'), L('a required field is missing or a value is invalid; the message names file and field', 'Pflichtfeld fehlt oder Wert ungültig; die Meldung nennt Datei und Feld')],
    [L('Disconnected: parts differ', 'Verbindung getrennt: Teile weichen ab'), L('the add-on is missing on one side or has other values', 'Add-on fehlt auf einer Seite oder hat andere Werte')],
    [L('Part missing in the workbench', 'Teil fehlt in der Werkbank'), L('no item registered (<code>registerItems</code> forgotten)', 'kein Item angemeldet (<code>registerItems</code> vergessen)')],
    [L('Import returns <code>NO_TARGET</code>', 'Import liefert <code>NO_TARGET</code>'), L('workbench not open or no drone in the main hand', 'Werkbank nicht offen oder keine Drohne in der Haupthand')],
    [L('Import returns <code>BUSY</code>', 'Import liefert <code>BUSY</code>'), L('more than two requests per second', 'mehr als zwei Anfragen pro Sekunde')],
  ])}
`);

  const license = section('license', T.license, `${P(LICENSE_NOTE.en, LICENSE_NOTE.de)}`);

  return {
    id: 'api',
    title: { en: 'Add-on API – Propwash FPV docs', de: 'Add-on-API – Propwash-FPV-Doku' },
    description: {
      en: `Build add-ons for Propwash FPV: new drone parts in Java or JSON, presets, creative tabs, workbench buttons, configurator tabs, Flight School scenes, switches, OSD elements, collision rules, events and the rules for add-ons. API ${api.version}.`,
      de: `Add-ons für Propwash FPV bauen: neue Drohnenteile in Java oder JSON, Presets, Kreativ-Tabs, Werkbank-Knöpfe, Konfigurator-Tabs, Flugschul-Szenen, Schalter, OSD-Elemente, Kollisionsregeln, Events und die Regeln für Add-ons. API ${api.version}.`,
    },
    kicker: L(`Docs · For mod authors · API ${api.version}`, `Doku · Für Mod-Autoren · API ${api.version}`),
    heading: { en: 'Add-on API', de: 'Add-on-API' },
    lead: {
      en: 'Extend Propwash FPV from your own mod without changing Propwash: new parts of every category, presets, a creative tab, buttons in the workbench, configurator tabs, Flight School scenes, switches, OSD elements, collision rules and more – and share codes for your parts.',
      de: 'Propwash FPV aus dem eigenen Mod erweitern, ohne Propwash zu ändern: neue Teile jeder Kategorie, Presets, ein Kreativ-Tab, Knöpfe in der Werkbank, Konfigurator-Tabs, Flugschul-Szenen, Schalter, OSD-Elemente, Kollisionsregeln und mehr – und Sharecodes für deine Teile.',
    },
    toc,
    body: [what, rules, setup, lifecycle, parts, items, presets, builds, share, webConfigurator, client, flight, api17, events, versions, multiplayer, example, checklist, license].join('\n'),
  };
}

export function apiHistoryProblem(apiVersion) {
  const m = minor(apiVersion);
  return API_HISTORY.some((h) => h.version === m) ? null
    : `API ${m} fehlt in API_HISTORY (tools/docs/pages/api.mjs) – Inhalt aus docs/api/changes.md des Propwash-Repositorys übernehmen`;
}
