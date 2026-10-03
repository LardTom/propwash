// Player guide: first flight, radio setup, controls and the server side. The key table, the switch functions and the
// server.json table come from the mod's code (KeyDefaults, SwitchFunction, ServerRulesConfig and the language files);
// the steps and explanations are written here.

import { L, P, esc, list, note, section, table, code, figure, siteImage, h3, kbd, mono } from '../html.mjs';

const KEYBOARD_FALLBACK = { kb_throttle_up: 'W', kb_throttle_down: 'S', kb_yaw_left: 'A', kb_yaw_right: 'D' };

export const SERVER_FIELDS = {
  pilotPermissionLevel: {
    en: 'Permission level a player needs to fly a drone. 0 = everyone, 2 = operators.',
    de: 'Rechtestufe, die ein Spieler zum Fliegen braucht. 0 = alle, 2 = Operatoren.',
  },
  allowUnlimitedRange: {
    en: 'Allows flying without the distance limit below (for players with the next permission level). The radio and video range of the drone still applies.',
    de: 'Erlaubt Fliegen ohne die Entfernungsgrenze darunter (für Spieler mit der nächsten Rechtestufe). Die Funk- und Videoreichweite der Drohne gilt weiter.',
  },
  unlimitedRangePermissionLevel: {
    en: 'Permission level for flying without the distance limit.',
    de: 'Rechtestufe für Fliegen ohne Entfernungsgrenze.',
  },
  maxPilotDistance: {
    en: 'Largest distance between pilot and drone in blocks when the range is limited; further away, the flight ends.',
    de: 'Größte Entfernung zwischen Pilot und Drohne in Blöcken, wenn die Reichweite begrenzt ist; weiter weg endet der Flug.',
  },
  maxDroneSpeed: {
    en: 'Speed limit in blocks per second for checking drone movement; faster movement packets are rejected. 0 = no limit.',
    de: 'Tempolimit in Blöcken pro Sekunde für die Prüfung der Drohnenbewegung; schnellere Bewegungspakete werden verworfen. 0 = ohne Grenze.',
  },
  droneViewDistance: {
    en: 'View distance around the drone in chunks (at most the player’s and the server’s own view distance).',
    de: 'Sichtweite um die Drohne in Chunks (höchstens die Sichtweite des Spielers und des Servers).',
  },
  maxStreamedChunks: {
    en: 'Chunk budget shared by all drones on the server.',
    de: 'Chunk-Budget, das sich alle Drohnen auf dem Server teilen.',
  },
  chunkChecksPerTick: {
    en: 'How many chunks the server checks per tick while streaming around drones.',
    de: 'Wie viele Chunks der Server pro Tick prüft, während er um Drohnen herum lädt.',
  },
  onlyGeneratedChunks: {
    en: 'Together with the next two settings: who may generate new terrain with a drone. Off = every drone generates terrain.',
    de: 'Zusammen mit den nächsten beiden Einstellungen: wer mit einer Drohne neues Gelände erzeugen darf. Aus = jede Drohne erzeugt Gelände.',
  },
  generateChunksPermissionLevel: {
    en: 'Permission level for generating new terrain: 0 = everyone (default), 2 = operators, 5 = nobody. Others only fly over terrain that already exists.',
    de: 'Rechtestufe für neues Gelände: 0 = alle (Standard), 2 = Operatoren, 5 = niemand. Alle anderen fliegen nur über schon erzeugtem Gelände.',
  },
  hostGeneratesChunks: {
    en: 'The host of a singleplayer or LAN world always generates terrain.',
    de: 'Der Host einer Einzelspieler- oder LAN-Welt erzeugt immer Gelände.',
  },
  allowPilotingInSpawnProtection: {
    en: 'Allows flying inside the spawn protection.',
    de: 'Erlaubt Fliegen im Spawnschutz.',
  },
  batteryChargeSeconds: {
    en: 'Seconds the charger needs for a full 1300 mAh pack.',
    de: 'Sekunden, die das Ladegerät für einen vollen 1300-mAh-Akku braucht.',
  },
  batteryChargeCapacityExponent: {
    en: 'How charge time grows with capacity: time × (mAh ÷ 1300) to the power of this value.',
    de: 'Wie die Ladezeit mit der Kapazität wächst: Zeit × (mAh ÷ 1300) hoch diesen Wert.',
  },
  batteryChargeMinSeconds: {
    en: 'Shortest charge time for a full pack.',
    de: 'Kürzeste Ladezeit für einen vollen Akku.',
  },
  redstoneChargeMultiplier: {
    en: 'A charger powered by redstone charges this many times faster.',
    de: 'Ein Ladegerät mit Redstone-Signal lädt so viel schneller.',
  },
  worldCourses: {
    en: 'Ready-made race courses appear in newly generated terrain.',
    de: 'Fertige Rennkurse erscheinen in neu erzeugtem Gelände.',
  },
  allowSpectating: {
    en: 'Players with goggles may watch other pilots’ video channels.',
    de: 'Spieler mit Brille dürfen die Videokanäle anderer Piloten ansehen.',
  },
};

function serverValue(field, value, lang) {
  if (value === null || value === undefined) return '–';
  if (field.type === 'boolean') return `<code>${value}</code>`;
  return lang === 'de' ? String(value).replace('.', ',') : String(value);
}

function serverRange(f, lang) {
  const known = (v) => v !== undefined && v !== null;
  if (f.type === 'boolean') return '–';
  if (known(f.min) && known(f.max)) return `<span class="nowrap">${serverValue(f, f.min, lang)}–${serverValue(f, f.max, lang)}</span>`;
  if (known(f.max)) return `<span class="nowrap">≤ ${serverValue(f, f.max, lang)}</span>`;
  return '–';
}

function keyRows(keys, filter) {
  return keys.filter(filter).map((k) => {
    let key = kbd(k.key);
    let extra = { en: '', de: '' };
    if (!k.key && KEYBOARD_FALLBACK[k.name]) {
      key = `<span class="docs-muted">${L('until bound:', 'bis belegt:')}</span> ${kbd(KEYBOARD_FALLBACK[k.name])}`;
    } else if (!k.key) {
      key = `<span class="docs-muted">${L('not bound', 'nicht belegt')}</span>`;
    }
    if (k.sharedWith.length) {
      extra = { en: ` <span class="docs-muted">(shared on purpose)</span>`, de: ` <span class="docs-muted">(bewusst geteilt)</span>` };
    }
    return [`${L(esc(k.title.en) + extra.en, esc(k.title.de) + extra.de)}`, key];
  });
}

export default function guidePage(ctx) {
  const { controls, server, meta } = ctx.data;
  const prefix = ctx.prefix;
  const toc = [
    { id: 'start', title: { en: 'Before you start', de: 'Bevor es losgeht' } },
    { id: 'first-flight', title: { en: 'First flight', de: 'Erster Flug' } },
    { id: 'radio', title: { en: 'Radio, gamepad, keyboard', de: 'Funke, Gamepad, Tastatur' } },
    { id: 'controls', title: { en: 'Keys', de: 'Tasten' } },
    { id: 'modes', title: { en: 'Flight modes and tuning', de: 'Flugmodi und Tuning' } },
    { id: 'servers', title: { en: 'For server owners', de: 'Für Server-Betreiber' } },
    { id: 'help', title: { en: 'Help', de: 'Hilfe' } },
  ];

  const start = section('start', toc[0].title, `
${list([
    [`Propwash FPV ${meta.propwash} runs on Minecraft ${meta.minecraft} with <strong>Fabric</strong> (with Fabric API) or <strong>NeoForge</strong>. Download it from <a href="https://www.curseforge.com/minecraft/mc-mods/propwash-fpv" target="_blank" rel="noopener">CurseForge</a> or <a href="https://modrinth.com/mod/propwash-fpv" target="_blank" rel="noopener">Modrinth</a>.`,
      `Propwash FPV ${meta.propwash} läuft auf Minecraft ${meta.minecraft} mit <strong>Fabric</strong> (mit Fabric API) oder <strong>NeoForge</strong>. Herunterladen auf <a href="https://www.curseforge.com/minecraft/mc-mods/propwash-fpv" target="_blank" rel="noopener">CurseForge</a> oder <a href="https://modrinth.com/mod/propwash-fpv" target="_blank" rel="noopener">Modrinth</a>.`],
    ['On a server, Propwash goes on the server <em>and</em> on every client. Add-ons such as Just More Parts also go on both sides.', 'Auf einem Server gehört Propwash auf den Server <em>und</em> auf jeden Client. Add-ons wie Just More Parts ebenfalls auf beide Seiten.'],
    ['In creative mode the <em>Propwash FPV</em> tab has five ready-to-fly drones (Whoop, Cinewhoop, Freestyle, Racer, Long Range) and every part. In survival you craft the parts or find them in chests.', 'Im Kreativmodus hat der Tab <em>Propwash FPV</em> fünf flugfertige Drohnen (Whoop, Cinewhoop, Freestyle, Racer, Long Range) und alle Teile. Im Überlebensmodus stellst du die Teile her oder findest sie in Truhen.'],
    ['A real RC radio is the best way to fly, but a gamepad or the keyboard work too.', 'Am besten fliegt es sich mit einer echten Funke, ein Gamepad oder die Tastatur gehen aber auch.'],
  ])}
`);

  const first = section('first-flight', toc[1].title, `
${list([
    ['<strong>Build a drone.</strong> Place a <em>Drone Workbench</em> and right-click it. Frame in the middle, flight controller stack above it, four motors, four propellers, the video unit at the nose and a battery that fits the frame. The panel on the right shows weight, thrust-to-weight, hover throttle, top speed, flight time and any problems. Take the finished drone out on the right.',
      '<strong>Drohne bauen.</strong> Eine <em>Drohnen-Werkbank</em> aufstellen und rechtsklicken. Rahmen in die Mitte, Flight-Controller-Stack darüber, vier Motoren, vier Propeller, das Videomodul an die Nase und ein Akku, der zum Rahmen passt. Rechts stehen Gewicht, Schub-Gewicht-Verhältnis, Schwebegas, Höchstgeschwindigkeit, Flugzeit und Probleme. Die fertige Drohne rechts herausnehmen.'],
    ['<strong>Place it.</strong> Right-click a block with the drone.', '<strong>Hinstellen.</strong> Mit der Drohne einen Block rechtsklicken.'],
    ['<strong>Bind the radio.</strong> Hold the <em>FPV Remote</em> and right-click the drone.', '<strong>Funke binden.</strong> Die <em>FPV-Funke</em> halten und die Drohne rechtsklicken.'],
    ['<strong>Bind the goggles.</strong> Hold the goggles and right-click the drone. They only bind if they receive the drone’s video system: analog goggles for analog video, digital goggles for digital video, creative goggles for both.',
      '<strong>Brille binden.</strong> Die Brille halten und die Drohne rechtsklicken. Sie bindet nur, wenn sie das Videosystem der Drohne empfängt: analoge Brille für analoges Video, digitale für digitales, die Kreativ-Brille für beides.'],
    ['<strong>Put the goggles on</strong> (head slot, or right-click into the air with them).', '<strong>Brille aufsetzen</strong> (Kopf-Slot, oder damit in die Luft rechtsklicken).'],
    ['<strong>Take off.</strong> Hold the bound radio and right-click into the air. With bound, matching goggles on your head you fly <strong>FPV</strong> through the drone’s camera; otherwise you fly <strong>line of sight</strong>, with your view turning towards the drone and a small radio display for battery, signal and flight mode.',
      '<strong>Abheben.</strong> Die gebundene Funke halten und in die Luft rechtsklicken. Mit passender, gebundener Brille auf dem Kopf fliegst du <strong>FPV</strong> durch die Kamera der Drohne, sonst <strong>auf Sicht</strong>: Dein Blick folgt der Drohne, eine kleine Funkanzeige zeigt Akku, Signal und Flugmodus.'],
    ['<strong>Arm and fly.</strong> Arm with the arm switch or <kbd>Z</kbd>. Arming only works with the drone level and the throttle down. While you fly, walking is locked and you keep holding the radio.',
      '<strong>Scharfschalten und fliegen.</strong> Mit dem Arm-Schalter oder <kbd>Z</kbd> scharfschalten. Das geht nur, wenn die Drohne gerade steht und das Gas unten ist. Während des Flugs kannst du nicht laufen und hältst die Funke weiter in der Hand.'],
    ['<strong>Stop.</strong> Land, disarm, then right-click with the radio again or press <kbd>Y</kbd>. The drone stays bound.', '<strong>Aufhören.</strong> Landen, entschärfen, dann mit der Funke erneut rechtsklicken oder <kbd>Y</kbd> drücken. Die Drohne bleibt gebunden.'],
  ], true, 'docs-steps')}
${siteImage(prefix, 'workbench-freestyle', [800, 1600], { en: 'The Drone Workbench with a 5-inch freestyle drone, its 3D preview and the build analysis', de: 'Die Drohnen-Werkbank mit einer 5-Zoll-Freestyle-Drohne, 3D-Vorschau und Build-Analyse' }, { en: 'The workbench checks every build: red problems stop it, yellow warnings explain what will feel off.', de: 'Die Werkbank prüft jeden Bau: Rote Probleme verhindern ihn, gelbe Warnungen erklären, was sich komisch anfühlen wird.' }, [800, 450])}
${note('With an empty hand, right-clicking a drone picks it up; battery, tune and bindings stay with it. Sneak + right-click opens the service menu for the battery, props and camera angle. Hold <kbd>M</kbd> over any Propwash item in your inventory for its Flight School lesson and <kbd>Shift</kbd> for a detailed tooltip.',
    'Mit leerer Hand hebt ein Rechtsklick die Drohne auf; Akku, Tuning und Bindungen bleiben dran. Schleichen + Rechtsklick öffnet das Wartungsmenü für Akku, Props und Kamerawinkel. <kbd>M</kbd> über einem Propwash-Item im Inventar halten öffnet seine Flugschul-Lektion, <kbd>Shift</kbd> zeigt einen ausführlichen Tooltip.')}
`);

  const switchItems = controls.switches.map((s) => [esc(s.title.en), esc(s.title.de)]);
  const radio = section('radio', toc[2].title, `
${h3('radio-edgetx', 'EdgeTX and OpenTX radios', 'EdgeTX- und OpenTX-Funken')}
${P('Connect the radio by USB and choose <strong>USB Joystick (HID)</strong> on the radio. Propwash detects it on its own and starts with channel order AETR, AUX1 = arm, AUX2 = flight mode (low Acro, middle Horizon, high Angle), AUX3 = beeper, AUX4 = rescue and full-travel throttle.',
    'Die Funke per USB anschließen und an der Funke <strong>USB Joystick (HID)</strong> wählen. Propwash erkennt sie selbst und startet mit der Kanalreihenfolge AETR, AUX1 = Scharfschalten, AUX2 = Flugmodus (unten Acro, Mitte Horizon, oben Angle), AUX3 = Piepser, AUX4 = Rescue und Gas über den vollen Weg.')}
${h3('radio-wizard', 'Setting up a new device', 'Ein neues Gerät einrichten')}
${P('The first time a radio or gamepad shows up, Propwash asks whether to set it up now (never mid-flight): <em>Set up</em>, <em>Later</em> or <em>Never for this device</em>. The receiver wizard (configurator <kbd>K</kbd> → <em>Receiver</em> → <em>Receiver wizard…</em>) then walks you through four steps:',
    'Taucht eine Funke oder ein Gamepad zum ersten Mal auf, fragt Propwash, ob es jetzt eingerichtet werden soll (nie mitten im Flug): <em>Einrichten</em>, <em>Später</em> oder <em>Nie für dieses Gerät</em>. Der Empfänger-Assistent (Konfigurator <kbd>K</kbd> → <em>Empfänger</em> → <em>Empfänger-Assistent…</em>) führt dann durch vier Schritte:')}
${list([
    ['<strong>Device:</strong> pick the radio, a gamepad or the keyboard.', '<strong>Gerät:</strong> Funke, Gamepad oder Tastatur wählen.'],
    ['<strong>Channels:</strong> move each stick when asked. For the throttle: push it fully up first, then pull it fully down and hold it there; where it rested before does not matter. A check page shows every channel live; <em>Inv.</em> flips one that moves the wrong way.', '<strong>Kanäle:</strong> jeden Knüppel bewegen, wenn danach gefragt wird. Beim Gas: zuerst ganz nach oben schieben, dann ganz nach unten ziehen und dort halten; wo es vorher stand, spielt keine Rolle. Eine Prüfseite zeigt jeden Kanal live; <em>Inv.</em> dreht einen, der falsch herum läuft.'],
    ['<strong>Calibrate:</strong> sticks centred, then every end stop.', '<strong>Kalibrieren:</strong> Knüppel in die Mitte, dann alle Endanschläge.'],
    ['<strong>Switches:</strong> click <em>Assign</em> and flip the switch you want for a function.', '<strong>Schalter:</strong> <em>Zuweisen</em> klicken und den gewünschten Schalter umlegen.'],
  ], true)}
${figure(prefix, ctx.images.receiver_wizard, { en: 'The receiver wizard checking channels: roll, pitch and yaw at 1500, throttle at 2000, inverted throttle detected, raw axes on the right', de: 'Der Empfänger-Assistent prüft die Kanäle: Roll, Nick und Gier bei 1500, Gas bei 2000, invertiertes Gas erkannt, rohe Achsen rechts' }, { en: 'The check page of the receiver wizard: throttle down must read 1000, up 2000.', de: 'Die Prüfseite des Empfänger-Assistenten: Gas unten muss 1000 zeigen, oben 2000.' })}
${P('Once set up, a device reconnects silently with its profile. Switch functions can also be assigned by hand in the <em>Modes</em> tab, to any AUX range (900–2100 µs) or button, inverted, held or as a toggle:',
    'Einmal eingerichtet, verbindet sich ein Gerät später still mit seinem Profil. Schalter-Funktionen lassen sich auch von Hand im Tab <em>Modi</em> belegen, auf jeden AUX-Bereich (900–2100 µs) oder Knopf, invertiert, gehalten oder als Umschalter:')}
${list(switchItems, false, 'docs-inline-list')}
${h3('radio-gamepad', 'Gamepad and keyboard', 'Gamepad und Tastatur')}
${list([
    ['<strong>Gamepads</strong> are detected with a Mode 2 layout: throttle and yaw on the left stick. The throttle starts in <em>Upper half</em> mode (centred stick = no throttle); <em>Incremental</em> holds the throttle like cruise control.', '<strong>Gamepads</strong> werden mit Mode-2-Belegung erkannt: Gas und Gier auf dem linken Stick. Das Gas startet im Modus <em>Obere Hälfte</em> (Stick in der Mitte = kein Gas); <em>Schrittweise</em> hält das Gas wie ein Tempomat.'],
    ['<strong>Keyboard</strong> flight is the fallback without a radio or gamepad and starts in Angle mode. The device list also has <em>Keyboard</em> to fly with the keyboard even when a controller is connected.', '<strong>Tastatur</strong>-Flug ist der Rückfall ohne Funke oder Gamepad und startet im Angle-Modus. In der Geräteliste steht auch <em>Tastatur</em>, um trotz angeschlossenem Controller mit der Tastatur zu fliegen.'],
    ['<strong>macOS:</strong> Propwash finds radios such as the Radiomaster Pocket without Apple’s GameController framework. A pure MFi gamepad that only works through that framework needs <em>Apple GameController</em> under <em>Receiver → Advanced (macOS)</em>.', '<strong>macOS:</strong> Propwash findet Funken wie die Radiomaster Pocket ohne Apples GameController-Framework. Ein reines MFi-Gamepad, das nur darüber funktioniert, braucht <em>Apples GameController</em> unter <em>Empfänger → Erweitert (macOS)</em>.'],
  ])}
`);

  const keyHeaders = [['Action', 'Aktion'], ['Default key', 'Standardtaste']];
  const controlsSection = section('controls', toc[3].title, `
${P('Every function has its own key. Change them in the configurator’s <em>Keys</em> tab or under <em>Options → Controls → Key Binds → Propwash FPV</em>. The defaults are key positions on a US layout; the game shows them with your keyboard’s labels (on a German keyboard the arm key shows as <kbd>Y</kbd> and the stop key as <kbd>Z</kbd>).',
    'Jede Funktion hat ihre eigene Taste. Ändern im Konfigurator-Tab <em>Tasten</em> oder unter <em>Optionen → Steuerung → Tastenbelegung → Propwash FPV</em>. Die Standards sind Tastenpositionen auf einer US-Tastatur; das Spiel zeigt sie mit den Beschriftungen deiner Tastatur (auf einer deutschen Tastatur heißt die Arm-Taste <kbd>Y</kbd> und die Stopp-Taste <kbd>Z</kbd>).')}
${h3('controls-keyboard', 'Keyboard flight', 'Tastatur-Flug')}
${table(keyHeaders, keyRows(controls.keys, (k) => k.flightStick))}
${h3('controls-drone', 'Drone', 'Drohne')}
${table(keyHeaders, keyRows(controls.keys, (k) => !k.flightStick && ['drone_', 'beeper', 'receiver_wizard', 'rescue', 'set_home'].some((p) => k.name.startsWith(p))))}
${h3('controls-more', 'Everything else', 'Alles andere')}
${table(keyHeaders, keyRows(controls.keys, (k) => !k.flightStick && !['drone_', 'beeper', 'receiver_wizard', 'rescue', 'set_home'].some((p) => k.name.startsWith(p))))}
${note('Right-clicking with the radio also ends a flight. The rotate-gate key shares <kbd>R</kbd> with the flight mode on purpose: one works only with a gate in hand, the other only while flying.',
    'Rechtsklick mit der Funke beendet ebenfalls einen Flug. Die Taste „Gate drehen“ teilt sich <kbd>R</kbd> absichtlich mit dem Flugmodus: Die eine wirkt nur mit einem Gate in der Hand, die andere nur im Flug.')}
`);

  const modes = section('modes', toc[4].title, `
${list([
    ['<strong>Acro</strong> (rate mode) holds the angle you leave it at, like a real freestyle or racing quad. <strong>Angle</strong> levels itself and limits the tilt. <strong>Horizon</strong> levels near the centre and flips at full stick.', '<strong>Acro</strong> (Rate-Modus) hält den Winkel, in dem du sie lässt, wie ein echter Freestyle- oder Race-Quad. <strong>Angle</strong> richtet sich selbst gerade und begrenzt die Neigung. <strong>Horizon</strong> richtet sich in der Mitte gerade und flippt bei vollem Ausschlag.'],
    ['<strong>ALTHOLD</strong> and <strong>POSHOLD</strong> hold height and position on simulated barometer, GPS and compass, so they never hold perfectly. Without a GPS fix POSHOLD only holds the height.', '<strong>ALTHOLD</strong> und <strong>POSHOLD</strong> halten Höhe und Position mit simuliertem Barometer, GPS und Kompass, also nie perfekt. Ohne GPS-Fix hält POSHOLD nur die Höhe.'],
    ['Rates, PID, filters and the throttle curve are set in the configurator tabs <em>Rates</em> and <em>PID Tuning</em> and saved to the drone you fly or hold. The <a href="' + prefix + 'configurator/">online configurator</a> uses the same defaults.', 'Rates, PID, Filter und Gaskurve stellst du in den Konfigurator-Tabs <em>Rates</em> und <em>PID-Tuning</em> ein; sie werden auf der Drohne gespeichert, die du fliegst oder hältst. Der <a href="' + prefix + 'configurator/">Online-Konfigurator</a> nutzt dieselben Standards.'],
  ])}
`);

  const serverRows = server.fields.map((f) => {
    const d = SERVER_FIELDS[f.name];
    return [mono(f.name), L(serverValue(f, f.default, 'en'), serverValue(f, f.default, 'de')), L(serverRange(f, 'en'), serverRange(f, 'de')), L(d.en, d.de)];
  });
  const servers = section('servers', toc[5].title, `
${P(`Install Propwash on the server and on every client. Client and server need the same network protocol (Propwash ${meta.propwash}: protocol ${meta.protocol}); a mismatch is reported with both versions when you connect.`,
    `Propwash gehört auf den Server und auf jeden Client. Client und Server brauchen dasselbe Netzwerkprotokoll (Propwash ${meta.propwash}: Protokoll ${meta.protocol}); passt es nicht, nennt die Meldung beim Verbinden beide Versionen.`)}
${h3('servers-rules', 'World rules', 'Welt-Regeln')}
${P(`Physics, wind, battery life, crash damage, video range and video channels are <a href="${prefix}docs/gamerules/">world rules</a>: gamerules that apply to every player in the world. Operators change them in the configurator tab <em>World rules</em> or with <code>/gamerule propwash:&lt;rule&gt; &lt;value&gt;</code>; everyone else sees them read-only in the same tab.`,
    `Physik, Wind, Akkulaufzeit, Crash-Schaden, Videoreichweite und Videokanäle sind <a href="${prefix}docs/gamerules/">Welt-Regeln</a>: Gamerules, die für alle Spieler der Welt gelten. Operatoren ändern sie im Konfigurator-Tab <em>Welt-Regeln</em> oder mit <code>/gamerule propwash:&lt;regel&gt; &lt;wert&gt;</code>; alle anderen sehen sie im selben Tab nur lesend.`)}
${h3('servers-config', 'server.json', 'server.json')}
${P(`Rights, limits and server technology stay in <code>${server.file}</code>. <code>/propwash reload</code> reads the file again without a restart.`,
    `Rechte, Grenzen und Server-Technik bleiben in <code>${server.file}</code>. <code>/propwash reload</code> liest die Datei ohne Neustart neu ein.`)}
${table([['Setting', 'Einstellung'], ['Default', 'Standard'], ['Range', 'Bereich'], ['What it does', 'Wirkung']], serverRows, 'docs-table--server')}
${h3('servers-commands', 'Commands', 'Befehle')}
${table([['Command', 'Befehl'], ['What it does', 'Wirkung']], [
    [mono('/propwash rules'), L('Lists the server settings and all world rules.', 'Listet Server-Einstellungen und alle Welt-Regeln.')],
    [mono('/propwash range [player]'), L('Shows range, view distance and chunk streaming of a pilot.', 'Zeigt Reichweite, Sichtweite und Chunk-Laden eines Piloten.')],
    [mono('/propwash pilots'), L('Lists everyone who is flying.', 'Listet alle, die gerade fliegen.')],
    [mono('/propwash reload'), L('Reloads server.json (operators).', 'Lädt server.json neu (Operatoren).')],
    [mono('/propwash race courses | leaderboard | laps | reset | delete | archive'), L('Race courses and leaderboards.', 'Rennkurse und Bestenlisten.')],
  ])}
`);

  const help = section('help', toc[6].title, list([
    ['<strong>Flight School:</strong> press <kbd>M</kbd> in the world for all lessons, or hold it over an item in your inventory for the matching one. Animated 3D lessons cover building, binding, batteries, racing, video, the configurator, rescue, hold modes, crashes, repairs and survival.', '<strong>Flugschule:</strong> <kbd>M</kbd> in der Welt öffnet alle Lektionen, über einem Item im Inventar gehalten die passende. Animierte 3D-Lektionen erklären Bauen, Binden, Akkus, Rennen, Video, Konfigurator, Rescue, Halte-Modi, Abstürze, Reparaturen und Überleben.'],
    ['<strong>Tooltips:</strong> hold <kbd>Shift</kbd> over any Propwash item.', '<strong>Tooltips:</strong> <kbd>Shift</kbd> über einem Propwash-Item halten.'],
    [`<strong>Questions and bug reports:</strong> the <a href="https://discord.gg/bNhkSXYSgZ" target="_blank" rel="noopener">Propwash Discord</a>.`, `<strong>Fragen und Fehlermeldungen:</strong> der <a href="https://discord.gg/bNhkSXYSgZ" target="_blank" rel="noopener">Propwash-Discord</a>.`],
  ]));

  return {
    id: 'guide',
    title: { en: 'Player guide – Propwash FPV docs', de: 'Spielerhandbuch – Propwash-FPV-Doku' },
    description: {
      en: 'Your first FPV flight in Propwash FPV: building and binding a drone, setting up an RC radio or gamepad, all default keys, flight modes and the server side.',
      de: 'Dein erster FPV-Flug in Propwash FPV: Drohne bauen und binden, Funke oder Gamepad einrichten, alle Standardtasten, Flugmodi und die Server-Seite.',
    },
    kicker: L('Docs · For players', 'Doku · Für Spieler'),
    heading: { en: 'Player guide', de: 'Spielerhandbuch' },
    lead: {
      en: 'From the parts bin to your first FPV flight, setting up your radio and what server owners need to know.',
      de: 'Von der Teilekiste zum ersten FPV-Flug, die Funke einrichten und was Server-Betreiber wissen müssen.',
    },
    toc,
    body: [start, first, radio, controlsSection, modes, servers, help].join('\n'),
  };
}
