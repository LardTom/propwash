// Add-on API guide: how a third-party mod extends Propwash FPV through the public API (package
// de.lardtom.propwash.api). Condensed from docs/api/addon-guide.md of the Propwash repository; versions, the event list
// and the API history check come from the extracted data.

import { L, P, esc, list, note, section, table, code, h3, mono, SHIELD, SOURCE } from '../html.mjs';

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
};

export const API_HISTORY = [
  { version: '1.0', text: { en: 'Parts in Java or JSON, items, presets, builds, paint, tune groups, OSD layouts, server-checked import, events, workbench buttons with child screens, configurator tabs, Flight School scenes.', de: 'Teile in Java oder JSON, Items, Presets, Baupläne, Lack, Tuning-Gruppen, OSD-Layouts, vom Server geprüfter Import, Events, Werkbank-Knöpfe mit Unterfenstern, Konfigurator-Tabs, Flugschul-Szenen.' } },
  { version: '1.1', text: { en: '<code>BuildAccess#cameraView(spec)</code>: the FPV camera and prop discs as Propwash draws them.', de: '<code>BuildAccess#cameraView(spec)</code>: FPV-Kamera und Prop-Scheiben, wie Propwash sie zeichnet.' } },
  { version: '1.2', text: { en: 'A creative tab per add-on (<code>PropwashApi.extensionTab(ns)</code>), <code>power_w</code> and <code>usable_fraction</code> for the energy model, all flight times in <code>BuildStats</code>.', de: 'Ein Kreativ-Tab je Add-on (<code>PropwashApi.extensionTab(ns)</code>), <code>power_w</code> und <code>usable_fraction</code> für das Energiemodell, alle Flugzeiten in <code>BuildStats</code>.' } },
  { version: '1.3', text: { en: 'Flight School links for items of any namespace (<code>linkFlightSchoolItems</code>, <code>linkFlightSchoolParts</code>, <code>FlightSchoolScenes</code>).', de: 'Flugschul-Verknüpfungen für Items jedes Namensraums (<code>linkFlightSchoolItems</code>, <code>linkFlightSchoolParts</code>, <code>FlightSchoolScenes</code>).' } },
  { version: '1.4', text: { en: 'Chest loot without loader code (<code>PropwashApi.loot()</code>), rarity in JSON, more analysis figures, <code>ESC_BURNED</code>, part condition and paint cost, batteries with partial charge, the <code>NAME</code> import layer and new drones from the client, Propwash’s own JSON codec, language texts on the server, workbench header space and icon buttons, camera field of view from <code>camera_fov_deg</code> and the uptilt range of the camera mount.', de: 'Truhen-Beute ohne Loader-Code (<code>PropwashApi.loot()</code>), Seltenheit im JSON, mehr Analysewerte, <code>ESC_BURNED</code>, Teilezustand und Lackkosten, Akkus mit Teilladung, Import-Ebene <code>NAME</code> und neue Drohnen vom Client, Propwashs eigener JSON-Codec, Sprachtexte auf dem Server, Platz im Werkbank-Kopf und Symbol-Knöpfe, Kamera-Sichtfeld aus <code>camera_fov_deg</code> und der Uptilt-Bereich des Kamerahalters.' } },
  { version: '1.5', text: { en: 'Three new built-in Flight School lessons for item links: <code>FlightSchoolScenes.TRICKS</code> (freestyle tricks, after <code>RACE</code>), <code>FlightSchoolScenes.GRIPPER</code> (gripper, after <code>ACTION_CAM</code>) and <code>FlightSchoolScenes.MODE_3D</code> (3D mode, after <code>HOLD</code>), all in <code>FlightSchoolScenes.ALL</code>. Props can declare their reverse thrust for 3D mode: <code>PropDefinition#reverseThrust()</code>, builder <code>reverseThrust(r)</code>, JSON <code>reverse_thrust</code>.', de: 'Drei neue eingebaute Flugschul-Lektionen für Item-Verknüpfungen: <code>FlightSchoolScenes.TRICKS</code> (Freestyle-Tricks, nach <code>RACE</code>), <code>FlightSchoolScenes.GRIPPER</code> (Greifer, nach <code>ACTION_CAM</code>) und <code>FlightSchoolScenes.MODE_3D</code> (3D-Modus, nach <code>HOLD</code>), alle in <code>FlightSchoolScenes.ALL</code>. Props können ihren Umkehrschub für den 3D-Modus angeben: <code>PropDefinition#reverseThrust()</code>, Builder <code>reverseThrust(r)</code>, JSON <code>reverse_thrust</code>.' } },
  { version: '1.6', text: { en: 'Building blocks for the add-ons <em>Mob Defense</em> and a cinematic camera drone: the front accessory mount (<code>AccessorySlot.FRONT</code>), accessory behaviours with synchronised inventories and accessory actions 1–4 (<code>PropwashApi.accessories()</code>), drone queries, impulses and pushes (<code>PropwashApi.drones()</code>), flight assists and force providers inside the flight model (<code>PropwashApi.flight()</code>), the events <code>DRONE_HIT_ENTITY</code>, <code>DRONE_DAMAGED</code> and <code>ACCESSORY_ACTION</code>, and on the client HUD elements, gimbal cameras and input (<code>registerHudElement</code>, <code>registerGimbal</code>, <code>input()</code>). Network protocol 16. Behaviour: an add-on flight assist that outputs anything makes a race lap an assisted lap (reason <code>other</code> with the assist’s id), forces from <code>registerForces</code> do not; the <em>Accessories</em> window never takes shulker boxes or drone items with accessory contents of their own; a release reaches <code>onAction</code> only while the action is held.', de: 'Bausteine für die Add-ons <em>Mob Defense</em> und eine Kino-Drohne: die Zubehör-Halterung vorne (<code>AccessorySlot.FRONT</code>), Zubehör-Verhalten mit synchronisierten Inventaren und Zubehör-Aktionen 1–4 (<code>PropwashApi.accessories()</code>), Drohnen-Abfragen, Stöße und Schübe (<code>PropwashApi.drones()</code>), Flughilfen und Kräfte im Flugmodell (<code>PropwashApi.flight()</code>), die Events <code>DRONE_HIT_ENTITY</code>, <code>DRONE_DAMAGED</code> und <code>ACCESSORY_ACTION</code> und im Client HUD-Elemente, Gimbal-Kameras und Eingaben (<code>registerHudElement</code>, <code>registerGimbal</code>, <code>input()</code>). Netzprotokoll 16. Verhalten: Eine Flughilfe eines Add-ons, die etwas ausgibt, macht eine Rennrunde zur Runde mit Flughilfe (Grund <code>other</code> mit der Id der Flughilfe), Kräfte aus <code>registerForces</code> nicht; das Fenster <em>Zubehör</em> nimmt nie Shulkerkisten oder Drohnen-Items mit eigenem Zubehör-Inhalt an; ein Loslassen erreicht <code>onAction</code> nur, solange die Aktion gehalten ist.' } },
];

function minor(version) {
  return version.split('.').slice(0, 2).join('.');
}

export default function apiPage(ctx) {
  const { meta, api } = ctx.data;
  const prefix = ctx.prefix;
  const mc = meta.minecraft;
  const v = meta.propwash;
  const apiMinor = minor(meta.api);
  const toc = [
    { id: 'what', title: { en: 'What add-ons can do', de: 'Was Add-ons können' } },
    { id: 'setup', title: { en: 'Project setup', de: 'Projekt aufsetzen' } },
    { id: 'lifecycle', title: { en: 'Entry points', de: 'Einstiegspunkte' } },
    { id: 'parts', title: { en: 'Parts', de: 'Bauteile' } },
    { id: 'items', title: { en: 'Items, assets, texts', de: 'Items, Assets, Texte' } },
    { id: 'presets', title: { en: 'Presets and creative tab', de: 'Presets und Kreativ-Tab' } },
    { id: 'builds', title: { en: 'Builds and import', de: 'Baupläne und Import' } },
    { id: 'client', title: { en: 'Client extensions', de: 'Client-Erweiterungen' } },
    { id: 'flight', title: { en: 'Accessories, flight and HUD', de: 'Zubehör, Flug und HUD' } },
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
    { header: false, cells: [L('items, tooltips, workbench, analysis, flight model, rendering and saving come for free', 'Items, Tooltips, Werkbank, Analyse, Flugmodell, Rendering und Speichern gibt es geschenkt'), L('new paint slots, accessory mounts beyond top, bottom and front, placeable elements in the OSD editor', 'neue Lack-Plätze, Zubehör-Halterungen außer oben, unten und vorne, platzierbare Elemente im OSD-Editor')] },
    { header: false, cells: [L('presets and an own creative tab right after the Propwash tab', 'Presets und ein eigener Kreativ-Tab direkt hinter dem Propwash-Tab'), L('own item classes for parts (Propwash provides the part items)', 'eigene Item-Klassen für Teile (Propwash stellt die Teil-Items)')] },
    { header: false, cells: [L('reading builds, creating drone items, setting tune and paint, a server-checked import', 'Baupläne lesen, Drohnen-Items erzeugen, Tuning und Lack setzen, ein vom Server geprüfter Import'), L('changing or removing built-in parts', 'eingebaute Teile ändern oder entfernen')] },
    { header: false, cells: [L('workbench buttons, child screens, configurator tabs, Flight School scenes, events, chest loot', 'Werkbank-Knöpfe, Kind-Fenster, Konfigurator-Tabs, Flugschul-Szenen, Events, Truhen-Beute'), '&nbsp;'] },
  ])}
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
${note(`The Modrinth Maven above only resolves once the Propwash project is actually live on Modrinth, which it is not yet (see the note on the <a href="${prefix}">landing page</a>). Until then, download the jar from the <a href="${SOURCE}/releases" target="_blank" rel="noopener">GitHub releases</a> or build Propwash from its source repository (<a href="${SOURCE}" target="_blank" rel="noopener">github.com/LardTom/propwash-fpv</a>) and depend on it as a local file or a <code>mavenLocal()</code> publish instead:`,
    `Das Modrinth-Maven oben löst erst auf, sobald das Propwash-Projekt wirklich auf Modrinth steht – das ist noch nicht der Fall (siehe der Hinweis auf der <a href="${prefix}">Startseite</a>). Bis dahin das Jar aus den <a href="${SOURCE}/releases" target="_blank" rel="noopener">GitHub-Releases</a> herunterladen oder Propwash aus dem Quellcode-Repository bauen (<a href="${SOURCE}" target="_blank" rel="noopener">github.com/LardTom/propwash-fpv</a>) und stattdessen als lokale Datei oder über <code>mavenLocal()</code> einbinden:`)}
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
  "propwash": ">=${v}"
}`, 'json', mono('fabric.mod.json'))}
${code(`[[dependencies.examplemod]]
modId = "propwash"
type = "required"
versionRange = "[${v},)"
ordering = "AFTER"
side = "BOTH"`, 'toml', mono('neoforge.mods.toml'))}
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
        PropwashClientApi.registerWorkbenchExtension(new ShareCodeButton());
        PropwashClientApi.registerConfigTab(ShareCodeTab::new);
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
${P('Not buildable (problems): <code>missing_part</code>, <code>motor_mount</code>, <code>prop_too_large</code>, <code>prop_too_small</code>, <code>prop_mount</code>, <code>stack_mount</code>, <code>battery_frame</code>, <code>accessory_mount</code>. Warnings: <code>motor_overvoltage</code>, <code>motor_undervoltage</code>, <code>stack_voltage</code>, <code>esc_undersized</code>, <code>battery_weak</code>, <code>battery_undersized</code>. Texts: <code>propwash.build.issue.&lt;key&gt;</code>.',
    'Nicht baubar (Probleme): <code>missing_part</code>, <code>motor_mount</code>, <code>prop_too_large</code>, <code>prop_too_small</code>, <code>prop_mount</code>, <code>stack_mount</code>, <code>battery_frame</code>, <code>accessory_mount</code>. Warnungen: <code>motor_overvoltage</code>, <code>motor_undervoltage</code>, <code>stack_voltage</code>, <code>esc_undersized</code>, <code>battery_weak</code>, <code>battery_undersized</code>. Texte: <code>propwash.build.issue.&lt;schlüssel&gt;</code>.')}
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
${note('Share codes live in the add-on: Propwash provides the data, the check and the server-checked import. Never put the video channel (<code>TuneGroup.VTX</code>), switch assignments, battery charge or bindings into a code.',
    'Sharecodes leben im Add-on: Propwash liefert Daten, Prüfung und den vom Server geprüften Import. Nie den Videokanal (<code>TuneGroup.VTX</code>), Schalterbelegung, Akkustand oder Bindungen in einen Code schreiben.')}
`);

  const client = section('client', T.client, `
${h3('client-workbench', 'Workbench buttons', 'Werkbank-Knöpfe')}
${code(`public final class ShareCodeButton implements WorkbenchExtension {
    @Override
    public Identifier id() {
        return ExampleMod.id("share_code");
    }

    @Override
    public void init(WorkbenchContext context) {
        context.addButton(Component.translatable("examplemod.workbench.code"),
                Component.translatable("examplemod.workbench.code.tooltip"),
                () -> context.openChild(parent -> new ShareCodeScreen(parent, context)));
    }
}`, 'java')}
${P('<code>init</code> runs every time the workbench screen is built. Up to two buttons sit left of <em>Paint</em>, more go behind “⋯”; <code>headerSpace()</code>, short labels and 13 × 13 px icon buttons help with long texts. <code>WorkbenchContext</code> gives the slots, the finished drone (<code>result()</code>), <code>missingParts(data)</code> and the import into the workbench.',
    '<code>init</code> läuft bei jedem Aufbau des Werkbank-Screens. Bis zu zwei Knöpfe stehen links neben <em>Lackierung</em>, weitere hinter „⋯“; <code>headerSpace()</code>, Kurzbeschriftungen und Symbol-Knöpfe mit 13 × 13 px helfen bei langen Texten. <code>WorkbenchContext</code> liefert die Slots, die fertige Drohne (<code>result()</code>), <code>missingParts(data)</code> und den Import in die Werkbank.')}
${h3('client-tabs', 'Configurator tabs', 'Konfigurator-Tabs')}
${P('<code>PropwashClientApi.registerConfigTab(ShareCodeTab::new)</code>. A tab extends <code>ui.client.config.ConfigTab</code>: an id with namespace, its own <code>order()</code> from 1000, widgets in <code>build()</code>, drawing in <code>extract(…)</code>, <code>save()</code> and <code>discard()</code>. <code>openConfigTab(id, parent)</code> opens the configurator right on it.',
    '<code>PropwashClientApi.registerConfigTab(ShareCodeTab::new)</code>. Ein Tab erweitert <code>ui.client.config.ConfigTab</code>: Id mit Namensraum, eigene <code>order()</code> ab 1000, Widgets in <code>build()</code>, Zeichnen in <code>extract(…)</code>, <code>save()</code> und <code>discard()</code>. <code>openConfigTab(id, parent)</code> öffnet den Konfigurator direkt darauf.')}
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

  const example = section('example', T.example, `
${P('The Propwash source code contains a complete example add-on in the namespace <code>propwash_example</code> (<code>common/src/devtest/java/de/lardtom/propwash/dev/example/</code>, MIT licensed) that uses <strong>only the API</strong>: version check, events, three parts in Java (2806.5 motor, 13″ carbon prop, stretched-X race frame with its own arms), five parts and a cell chemistry in JSON, items, a preset, its own creative tab, a workbench button with a child screen (preview, part check, import), a configurator tab (OSD layout via the clipboard, rates on the held drone) and a Flight School scene linked to its frames.',
    'Der Propwash-Quellcode enthält ein vollständiges Beispiel-Add-on im Namensraum <code>propwash_example</code> (<code>common/src/devtest/java/de/lardtom/propwash/dev/example/</code>, MIT-lizenziert), das <strong>nur die API</strong> benutzt: Versionsprüfung, Events, drei Teile in Java (Motor 2806,5, 13″-Carbon-Prop, Stretched-X-Race-Rahmen mit eigenen Armen), fünf Teile und eine Zellchemie in JSON, Items, ein Preset, ein eigener Kreativ-Tab, ein Werkbank-Knopf mit Kind-Fenster (Vorschau, Teile-Check, Import), ein Konfigurator-Tab (OSD-Layout über die Zwischenablage, Rates auf die gehaltene Drohne) und eine Flugschul-Szene, die mit seinen Rahmen verknüpft ist.')}
${P(`Its deadcat frame as JSON is shown on the <a href="${prefix}docs/parts-format/#example-addon">parts format page</a>. <em>Propwash: Just More Parts</em> is the first real add-on built the same way.`,
    `Sein Deadcat-Rahmen als JSON steht auf der <a href="${prefix}docs/parts-format/#example-addon">Seite zum Teile-Format</a>. <em>Propwash: Just More Parts</em> ist das erste echte Add-on, das genauso gebaut ist.`)}
`);

  const checklist = section('checklist', T.checklist, `
${list([
    [`<code>requireVersion</code> at start-up, dependency <code>propwash &gt;= ${v}</code> in both loader metadata files, <code>side = "BOTH"</code>.`, `<code>requireVersion</code> beim Start, Abhängigkeit <code>propwash &gt;= ${v}</code> in beiden Loader-Metadaten, <code>side = "BOTH"</code>.`],
    ['Parts and items in the <strong>common</strong> init, client extensions in the client init.', 'Teile und Items in der <strong>gemeinsamen</strong> Init, Client-Erweiterungen in der Client-Init.'],
    ['Every id: path only <code>[a-z0-9_.-]</code>, unique across all categories, namespace not <code>propwash</code>.', 'Jede Id: Pfad nur <code>[a-z0-9_.-]</code>, eindeutig über alle Kategorien, Namensraum nicht <code>propwash</code>.'],
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
      en: `Build add-ons for Propwash FPV: new drone parts in Java or JSON, presets, creative tabs, workbench buttons, configurator tabs, Flight School scenes and events. API ${api.version}.`,
      de: `Add-ons für Propwash FPV bauen: neue Drohnenteile in Java oder JSON, Presets, Kreativ-Tabs, Werkbank-Knöpfe, Konfigurator-Tabs, Flugschul-Szenen und Events. API ${api.version}.`,
    },
    kicker: L(`Docs · For mod authors · API ${api.version}`, `Doku · Für Mod-Autoren · API ${api.version}`),
    heading: { en: 'Add-on API', de: 'Add-on-API' },
    lead: {
      en: 'Extend Propwash FPV from your own mod without changing Propwash: new parts of every category, presets, a creative tab, buttons in the workbench, configurator tabs, Flight School scenes and a share-code system.',
      de: 'Propwash FPV aus dem eigenen Mod erweitern, ohne Propwash zu ändern: neue Teile jeder Kategorie, Presets, ein Kreativ-Tab, Knöpfe in der Werkbank, Konfigurator-Tabs, Flugschul-Szenen und ein Sharecode-System.',
    },
    toc,
    body: [what, setup, lifecycle, parts, items, presets, builds, client, flight, events, versions, multiplayer, example, checklist, license].join('\n'),
  };
}

export function apiHistoryProblem(apiVersion) {
  const m = minor(apiVersion);
  return API_HISTORY.some((h) => h.version === m) ? null
    : `API ${m} fehlt in API_HISTORY (tools/docs/pages/api.mjs) – Inhalt aus docs/api/changes.md des Propwash-Repositorys übernehmen`;
}
