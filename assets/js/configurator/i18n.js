// Texts of the configurator page that are not in the web export (EN/DE).

export const lang = () => (document.documentElement.lang === 'de' ? 'de' : 'en');

const TEXT = {
  categories: {
    frame: ['Frame', 'Rahmen'], stack: ['Stack', 'Stack'], motor: ['Motors', 'Motoren'], prop: ['Props', 'Props'],
    video: ['Video', 'Video'], battery: ['Battery', 'Akku'], accessory: ['Accessories', 'Zubehör'],
  },
  categoryPick: {
    frame: ['Choose a frame', 'Rahmen wählen'], stack: ['Choose a stack', 'Stack wählen'], motor: ['Choose the motors', 'Motoren wählen'],
    prop: ['Choose the props', 'Props wählen'], video: ['Choose the video system', 'Videosystem wählen'],
    battery: ['Choose a battery', 'Akku wählen'], accessory: ['Choose accessories', 'Zubehör wählen'],
  },
  roles: {
    whoop: ['Whoop', 'Whoop'], toothpick: ['Toothpick', 'Toothpick'], cinewhoop: ['Cinewhoop', 'Cinewhoop'],
    freestyle: ['Freestyle', 'Freestyle'], race: ['Race', 'Race'], long_range: ['Long range', 'Long Range'], x_class: ['X-Class', 'X-Class'],
    analog: ['Analog', 'Analog'], digital: ['Digital', 'Digital'], top: ['Top mount', 'Halter oben'], bottom: ['Bottom mount', 'Halter unten'],
  },
  mounts: { top: ['Top', 'Oben'], bottom: ['Bottom', 'Unten'] },
  stats: {
    mass_grams: ['Weight', 'Gewicht', 'g', 1],
    thrust_to_weight: ['Thrust-to-weight', 'Schub-Gewicht', ':1', 1],
    hover_throttle_percent: ['Hover throttle', 'Schwebegas', '%', 1],
    mixed_flight_time_min: ['Flight time (mixed, typical flying for the class)', 'Flugzeit gemischt (typisches Fliegen der Klasse)', 'min', 1],
    aggressive_flight_time_min: ['Flight time, aggressive / racing', 'Flugzeit aggressiv / Rennen', 'min', 1],
    hover_flight_time_min: ['Hover down to landing voltage', 'Schweben bis zur Landespannung', 'min', 1],
    cruise_flight_time_min: ['Cruise ({speed} straight)', 'Reisen ({speed} geradeaus)', 'min', 1],
    cruise_speed_kmh: ['Cruise speed', 'Reisegeschwindigkeit', 'km/h', 0],
    top_speed_kmh: ['Top speed', 'Höchstgeschwindigkeit', 'km/h', 0],
    hover_current_a: ['Current, hovering', 'Strom im Schweben', 'A', 1],
    cruise_current_a: ['Current, cruising', 'Strom beim Reisen', 'A', 1],
    mixed_current_a: ['Current, mixed (average)', 'Strom gemischt (Mittel)', 'A', 1],
    full_throttle_current_a: ['Current at full throttle', 'Strom bei Vollgas', 'A', 1],
    landing_cell_voltage: ['Landing voltage per cell under load (mixed)', 'Landespannung je Zelle unter Last (gemischt)', 'V', 2],
    avionics_power_w: ['Base load flight controller and video', 'Grundlast Flugcontroller und Video', 'W', 1],
    esc_load_percent: ['ESC load', 'ESC-Last', '%', 0],
    battery_load_percent: ['Battery load', 'Akku-Last', '%', 0],
    motor_response_ms: ['Motor response', 'Motor-Ansprechzeit', 'ms', 1],
    crash_speed_ms: ['Survives crashes up to', 'Übersteht Crashs bis', 'm/s', 1],
    motor_temp_minute_c: ['Motor temperature after 60 s full throttle in place', 'Motortemperatur nach 60 s Vollgas im Stand', '°C', 0],
    mixed_motor_temp_c: ['Motor temperature after a mixed flight', 'Motortemperatur nach gemischtem Flug', '°C', 0],
    sustained_motor_temp_c: ['Motor temperature, full throttle in place until the pack is empty', 'Motortemperatur bei Vollgas im Stand bis der Akku leer ist', '°C', 0],
    props_in_view_percent: ['Props in the camera view', 'Props im Kamerabild', '%', 1],
  },
  keyStats: {
    mass_grams: ['Weight', 'Gewicht'], thrust_to_weight: ['Thrust/weight', 'Schub/Gewicht'], hover_throttle_percent: ['Hover throttle', 'Schwebegas'],
    mixed_flight_time_min: ['Flight time (mixed)', 'Flugzeit gemischt'], top_speed_kmh: ['Top speed', 'Spitze'],
  },
  tune: {
    'rates.type': ['Rates type', 'Rate-Typ'],
    rcRate: ['RC rate', 'RC-Rate'], superRate: ['Super rate', 'Super-Rate'], rcExpo: ['RC expo', 'RC-Expo'],
    centerRateDps: ['Center rate', 'Mitten-Rate'], maxRateDps: ['Max rate', 'Max. Rate'], actualExpo: ['Expo', 'Expo'],
    'rates.rcDeadband': ['Stick deadband', 'Stick-Totzone'], 'rates.yawDeadband': ['Yaw deadband', 'Yaw-Totzone'],
    'pid.source': ['PID values', 'PID-Werte'],
    'pid.angleStrength': ['Angle strength', 'Angle-Stärke'], 'pid.angleLimitDeg': ['Angle limit', 'Angle-Grenze'],
    'pid.horizonStrength': ['Horizon strength', 'Horizon-Stärke'], 'pid.itermRelax': ['I-term relax', 'I-Term-Relax'],
    'pid.antiGravityGain': ['Anti-gravity', 'Anti-Gravity'], 'pid.airmode': ['Air mode', 'Air Mode'],
    'pid.tpaMode': ['TPA mode', 'TPA-Modus'], 'pid.tpaRatePercent': ['TPA rate', 'TPA-Rate'], 'pid.tpaBreakpoint': ['TPA breakpoint', 'TPA-Breakpoint'],
    'pid.motorIdlePercent': ['Motor idle', 'Motor-Leerlauf'], 'pid.throttleMid': ['Throttle mid', 'Gas-Mitte'],
    'pid.throttleExpo': ['Throttle expo', 'Gas-Expo'], 'pid.throttleLimitType': ['Throttle limit', 'Gasbegrenzung'],
    'pid.throttleLimitPercent': ['Throttle limit value', 'Gasgrenze'], 'pid.thrustLinearPercent': ['Thrust linearisation', 'Schub-Linearisierung'],
    'pid.vbatSagCompensationPercent': ['Sag compensation', 'Spannungsausgleich'],
    'filters.pidLoop': ['PID loop', 'PID-Loop'], 'filters.gyroLpfHz': ['Gyro lowpass', 'Gyro-Tiefpass'],
    'filters.dtermLpf1Hz': ['D-term lowpass 1', 'D-Term-Tiefpass 1'], 'filters.dtermLpf2Hz': ['D-term lowpass 2', 'D-Term-Tiefpass 2'],
    'filters.rcSmoothingHz': ['RC smoothing', 'RC-Glättung'],
    ff: ['Feedforward', 'Feedforward'],
  },
  options: {
    betaflight: ['Betaflight', 'Betaflight'], actual: ['Actual', 'Actual'], derived: ['Derived from the build', 'Aus dem Bauplan'],
    manual: ['Manual', 'Manuell'], off: ['Off', 'Aus'], rp: ['Roll + pitch', 'Roll + Pitch'], rpy: ['Roll + pitch + yaw', 'Roll + Pitch + Yaw'],
    d: ['D only', 'Nur D'], pd: ['P and D', 'P und D'], scale: ['Scale', 'Skalieren'], clip: ['Clip', 'Abschneiden'],
    on: ['On', 'An'], hz_2000: ['2 kHz', '2 kHz'], hz_1000: ['1 kHz', '1 kHz'], hz_500: ['500 Hz', '500 Hz'],
  },
  axes: { roll: ['Roll', 'Roll'], pitch: ['Pitch', 'Pitch'], yaw: ['Yaw', 'Yaw'] },
  // Names of the paint swatches, as in the game's paint screen (propwash.paint.swatch.*).
  swatches: {
    white: ['White', 'Weiß'], light_gray: ['Light grey', 'Hellgrau'], gray: ['Grey', 'Grau'], black: ['Black', 'Schwarz'],
    brown: ['Brown', 'Braun'], red: ['Red', 'Rot'], orange: ['Orange', 'Orange'], yellow: ['Yellow', 'Gelb'],
    lime: ['Lime', 'Hellgrün'], green: ['Green', 'Grün'], cyan: ['Cyan', 'Türkis'], light_blue: ['Light blue', 'Hellblau'],
    blue: ['Blue', 'Blau'], purple: ['Purple', 'Violett'], magenta: ['Magenta', 'Magenta'], pink: ['Pink', 'Rosa'],
    carbon: ['Carbon', 'Carbon'], gunmetal: ['Gunmetal', 'Titan'], aluminium: ['Aluminium', 'Aluminium'], gold: ['Gold', 'Gold'],
    copper: ['Copper', 'Kupfer'],
  },
  osdPresets: {
    minimal: ['Minimal', 'Minimal', 'Only the essentials along the edges; the middle of the picture stays clear.', 'Nur das Nötigste am Rand, die Bildmitte bleibt frei.'],
    standard: ['Standard', 'Standard', 'The usual flight data: battery, speed, altitude, throttle, flight time and race info.', 'Die üblichen Flugdaten: Akku, Tempo, Höhe, Gas, Flugzeit und Renn-Infos.'],
    full: ['Full / telemetry', 'Voll / Telemetrie', 'Every element, including artificial horizon, compass, current and stick overlay.', 'Alle Elemente, auch künstlicher Horizont, Kompass, Strom und Stick-Anzeige.'],
    race: ['Race', 'Rennen', 'For racing: laps, lap times, split delta and gate counter.', 'Fürs Rennen: Runden, Rundenzeiten, Split-Delta und Gate-Zähler.'],
  },
  ui: {
    loading: ['Loading parts …', 'Teile werden geladen …'],
    loadFailed: ['The parts data could not be loaded. Please reload the page.', 'Die Teiledaten konnten nicht geladen werden. Bitte lade die Seite neu.'],
    presetPlaceholder: ['Choose a preset …', 'Preset wählen …'],
    presetGroupPropwash: ['Propwash', 'Propwash'], presetGroupJmp: ['Just More Parts', 'Just More Parts'],
    namePlaceholder: ['e.g. “Bando basher”', 'z. B. „Bando-Basher“'],
    search: ['Search', 'Suchen'], searchPlaceholder: ['Name, size, KV …', 'Name, Größe, KV …'],
    all: ['All', 'Alle'], classFilter: ['Drone class', 'Drohnenklasse'], fitsOnly: ['Only parts that fit', 'Nur passende Teile'],
    noMatch: ['No part matches the filter.', 'Kein Teil passt zum Filter.'],
    fits: ['fits', 'passt'], fitsWarn: ['fits, with a warning', 'passt, mit Warnung'], noFit: ['does not fit', 'passt nicht'],
    selected: ['selected', 'gewählt'], current: ['Current', 'Aktuell'], none: ['None', 'Keins'],
    unknownPart: ['Unknown part', 'Unbekanntes Teil'], builtin: ['Propwash', 'Propwash'], addon: ['JMP', 'JMP'],
    builtinLong: ['Part of Propwash FPV', 'Teil von Propwash FPV'], addonLong: ['Added by Just More Parts', 'Aus Just More Parts'],
    prosCons: ['Details, pros and cons', 'Details, Vor- und Nachteile'],
    ifSwapped: ['With this part', 'Mit diesem Teil'],
    statusProblems: ['Can’t be built', 'Nicht baubar'], statusWarnings: ['Buildable, with warnings', 'Baubar, mit Warnungen'],
    statusOk: ['Ready to fly', 'Flugbereit'], statusUnknown: ['Contains unknown parts', 'Enthält unbekannte Teile'],
    unknownExplain: ['This page does not know these parts (an addon that is not in the data, or a newer version): ', 'Diese Teile kennt die Seite nicht (ein Addon, das nicht in den Daten ist, oder eine neuere Version): '],
    wrongKindExplain: ['These parts sit in the wrong place: ', 'Diese Teile stecken am falschen Platz: '],
    noAnalysis: ['No flight figures while parts are unknown or an accessory sits in the wrong mount.', 'Keine Flugwerte, solange Teile unbekannt sind oder Zubehör am falschen Halter sitzt.'],
    noValue: ['–', '–'],
    flightWarning: ['Flight', 'Flug'],
    problem: ['Problem', 'Problem'], warning: ['Warning', 'Warnung'],
    checksLabel: ['Problems and warnings', 'Probleme und Warnungen'],
    autoRotate: ['Auto-rotate', 'Drehen'],
    shotCopied: ['Screenshot copied', 'Screenshot in der Zwischenablage'],
    shotDownloaded: ['This browser can’t copy images here, so the PNG was downloaded.', 'Bilder lassen sich hier nicht kopieren, das PNG wurde heruntergeladen.'],
    shotFailed: ['The screenshot could not be made.', 'Der Screenshot konnte nicht erstellt werden.'],
    cardUnnamed: ['Custom build', 'Eigener Build'],
    noWebgl: ['The 3D view needs WebGL 2, which this browser does not offer. Everything else works.', 'Die 3D-Ansicht braucht WebGL 2, das dieser Browser nicht bietet. Alles andere funktioniert.'],
    viewerLabel: ['3D model of the drone. Drag to turn, scroll or pinch to zoom; with focus, the arrow keys turn it, + and − zoom, 0 resets the view.', '3D-Modell der Drohne. Ziehen dreht, Scrollen oder zwei Finger zoomen; mit Fokus drehen die Pfeiltasten, + und − zoomen, 0 setzt die Ansicht zurück.'],
    noFrame: ['No 3D view: this page does not know the frame.', 'Keine 3D-Ansicht: Diese Seite kennt den Rahmen nicht.'],
    viewerFailed: ['The 3D view could not be started.', 'Die 3D-Ansicht konnte nicht gestartet werden.'],
    cameraLabel: ['FPV camera image of the drone as in the game: {percent} % of the image covered by props.', 'FPV-Kamerabild der Drohne wie im Spiel: {percent} % des Bilds von Props verdeckt.'],
    fpvNoteDefault: ['As in the game: frame uptilt {tilt}°, {link} goggles {fov}°. In FPV the game shows only the props, not the drone itself.', 'Wie im Spiel: Uptilt des Rahmens {tilt}°, Brille {link} {fov}°. Im FPV zeigt das Spiel nur die Props, nicht die Drohne selbst.'],
    fpvNoteChanged: ['Your own uptilt and FOV. The workbench analysis uses the defaults ({tilt}°, {fov}°): {percent} %.', 'Eigener Uptilt und FOV. Die Analyse der Werkbank rechnet mit den Standardwerten ({tilt}°, {fov}°): {percent} %.'],
    fpvNone: ['No camera view while parts are unknown or an accessory sits in the wrong mount.', 'Keine Kameraansicht, solange Teile unbekannt sind oder Zubehör am falschen Halter sitzt.'],
    fpvLink: { analog: ['analog', 'analog'], digital: ['digital', 'digital'], creative: ['creative', 'Kreativ'] },
    procedural: ['This frame has no model; the game and this page draw it from its measurements, and paint does not show on it.', 'Dieser Rahmen hat kein Modell; Spiel und Seite zeichnen ihn aus seinen Maßen, Lack ist darauf nicht zu sehen.'],
    paintIntro: ['Paint works like the paint screen in the game: every slot gets one of the 16 dye colours, a finish or a custom colour; unpainted slots keep the original colours.', 'Lackieren funktioniert wie im Lackier-Bildschirm im Spiel: Jeder Platz bekommt eine der 16 Farbstoff-Farben, eine Oberfläche oder eine eigene Farbe, ungelackte Plätze behalten die Originalfarben.'],
    randomPaint: ['Randomize', 'Zufällig'],
    randomPaintHint: ['Paint every part with a random colour scheme', 'Alle Teile mit einem zufälligen Farbschema lackieren'],
    paintCustom: ['Custom colour', 'Eigene Farbe'], paintCustomHint: ['Opens the colour picker', 'Öffnet die Farbauswahl'],
    paintDye: ['dye', 'Farbstoff'], paintFinish: ['finish', 'Oberfläche'],
    linkProps: ['Same colour on all four props', 'Gleiche Farbe für alle vier Props'],
    original: ['original', 'original'], painted: ['painted', 'lackiert'],
    resetSlot: ['Reset to the original colour', 'Auf Originalfarbe zurücksetzen'], resetPaint: ['Remove all paint', 'Allen Lack entfernen'],
    notOnBuild: ['not on this build', 'nicht an dieser Drohne'],
    paintHidden: ['paint does not show (frame without a model)', 'Lack nicht sichtbar (Rahmen ohne Modell)'],
    tuneIntro: ['The flight tune travels in the share code. Changed values are marked; everything else stays at the defaults the game derives from the build.', 'Das Flug-Tuning reist im Sharecode mit. Geänderte Werte sind markiert, alles andere bleibt auf den Standardwerten, die das Spiel aus dem Bauplan ableitet.'],
    tuneUnavailable: ['The tune editor needs a build with known parts.', 'Der Tuning-Editor braucht einen Bauplan mit bekannten Teilen.'],
    resetTune: ['Reset the whole tune', 'Ganzes Tuning zurücksetzen'], resetValue: ['Back to the default', 'Auf Standard zurücksetzen'],
    changed: ['changed', 'geändert'], defaultValue: ['Default', 'Standard'],
    derivedNote: ['Derived PIDs follow the build. Changing a PID value switches to manual PIDs, like in the game.', 'Abgeleitete PIDs folgen dem Bauplan. Wer einen PID-Wert ändert, schaltet wie im Spiel auf manuelle PIDs um.'],
    offHint: ['0 = off', '0 = aus'], stick: ['Stick', 'Stick'], rate: ['Rate', 'Rate'], output: ['Output', 'Ausgabe'],
    rateGraph: ['Rate curves: turn rate over stick travel', 'Rate-Kurven: Drehrate über den Stickweg'],
    throttleGraph: ['Throttle curve: motor output over throttle stick', 'Gaskurve: Motorausgabe über den Gas-Stick'],
    osdIntro: ['The OSD layer is off by default, like in the game. When it is in the code, importing it replaces the OSD layout of the player who imports it.', 'Die OSD-Ebene ist wie im Spiel standardmäßig aus. Steht sie im Code, ersetzt der Import das OSD-Layout von dem, der importiert.'],
    osdInclude: ['Put an OSD layout into the code', 'OSD-Layout in den Code packen'],
    osdImported: ['Layout from the opened code', 'Layout aus dem geöffneten Code'],
    osdImportedInfo: ['Preset {preset}, {count} elements set individually', 'Preset {preset}, {count} Elemente einzeln eingestellt'],
    osdImportedInfoOne: ['Preset {preset}, 1 element set individually', 'Preset {preset}, 1 Element einzeln eingestellt'],
    osdPresetNote: ['A preset puts the elements where the game’s preset has them, with the default style.', 'Ein Preset setzt die Elemente dorthin, wo das Preset im Spiel sie hat, mit dem Standard-Stil.'],
    layers: { parts: ['Parts', 'Teile'], paint: ['Paint', 'Lack'], tune: ['Tuning', 'Tuning'], osd: ['OSD', 'OSD'], name: ['Name', 'Name'] },
    layerNoPaint: ['(no paint yet)', '(noch kein Lack)'], layerNoName: ['(no name yet)', '(noch kein Name)'], layerNoOsd: ['(choose in the OSD tab)', '(im OSD-Reiter wählen)'],
    codeMeta: ['{n} characters · {layers}', '{n} Zeichen · {layers}'],
    chatOk: ['Short enough for the chat command.', 'Kurz genug für den Chat-Befehl.'],
    chatLong: ['Longer than 256 characters: paste it in the workbench’s share code window instead of the chat.', 'Länger als 256 Zeichen: im Sharecode-Fenster der Werkbank einfügen statt im Chat.'],
    copied: ['Copied to the clipboard.', 'In die Zwischenablage kopiert.'], copyFailed: ['Copying failed – select the code and copy it by hand.', 'Kopieren fehlgeschlagen – markier den Code und kopier ihn von Hand.'],
    linkCopied: ['Link copied.', 'Link kopiert.'],
    encodeFailed: ['This build cannot be written as a code: ', 'Dieser Bauplan lässt sich nicht als Code schreiben: '],
    importLoaded: ['Code read – the build is loaded.', 'Code gelesen – der Bauplan ist geladen.'],
    linkLoaded: ['Build from the link loaded.', 'Bauplan aus dem Link geladen.'],
    presetLoaded: ['Preset “{name}” loaded.', 'Preset „{name}“ geladen.'],
    undo: ['Undo', 'Rückgängig'], dismiss: ['Close', 'Schließen'],
    importLayers: ['In the code: {layers}', 'Im Code: {layers}'],
    importUnknown: ['Unknown parts: {ids}', 'Unbekannte Teile: {ids}'],
    importSkipped: ['Skipped entries: {n}', 'Übersprungene Einträge: {n}'],
    importRenamed: ['Renamed parts: {n}', 'Umbenannte Teile: {n}'],
    badLink: ['The link does not contain a readable code: ', 'Der Link enthält keinen lesbaren Code: '],
    mm: ['mm', 'mm'], props: ['props', 'Props'], blades: ['blades', 'Blätter'], blocks: ['blocks', 'Blöcke'], kv: ['KV', 'KV'],
    massOf: ['{g} g', '{g} g'],
  },
};

/** Text by path, e.g. t('ui.copied'); {name} placeholders are filled from vars. */
export function t(path, vars) {
  let node = TEXT;
  for (const key of path.split('.')) node = node == null ? undefined : node[key];
  let text = Array.isArray(node) ? node[lang() === 'de' ? 1 : 0] : path;
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return text;
}

/** Text of a key that itself contains dots (tune keys): tk('tune', 'rates.type'). */
export function tk(group, key) {
  const node = TEXT[group] && TEXT[group][key];
  return Array.isArray(node) ? node[lang() === 'de' ? 1 : 0] : null;
}

export function entry(path) {
  let node = TEXT;
  for (const key of path.split('.')) node = node == null ? undefined : node[key];
  return node;
}

/** Number in the page language with fixed decimals; NaN/null gives '–'. */
export function num(value, decimals = 1) {
  if (value == null || !Number.isFinite(value)) return '–';
  return new Intl.NumberFormat(lang() === 'de' ? 'de-DE' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
