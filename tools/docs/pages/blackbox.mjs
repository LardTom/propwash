// Tuning with the blackbox: switching it on, flying a test log, opening it in Betaflight Blackbox Explorer or PIDtoolbox
// and reading it. The default key and the switch function come from the mod's key defaults and language files; the
// field list matches the log writer of the release (de.lardtom.propwash.blackbox).

import { L, P, list, note, section, table, figure, kbd, mono, esc } from '../html.mjs';

export default function blackboxPage(ctx) {
  const { controls, meta } = ctx.data;
  const prefix = ctx.prefix;
  const key = controls.keys.find((k) => k.name === 'blackbox');
  const keyText = key && key.key ? kbd(key.key) : L('a key of your choice', 'eine Taste deiner Wahl');
  const switchFn = controls.switches.find((s) => s.name === 'blackbox');
  const fnName = switchFn ? switchFn.title : { en: 'Blackbox', de: 'Blackbox' };
  const toc = [
    { id: 'what', title: { en: 'What the blackbox records', de: 'Was die Blackbox aufzeichnet' } },
    { id: 'switch-on', title: { en: 'Switch it on', de: 'Einschalten' } },
    { id: 'test-flight', title: { en: 'Fly a test log', de: 'Einen Testflug fliegen' } },
    { id: 'open', title: { en: 'Open the log', de: 'Log öffnen' } },
    { id: 'read', title: { en: 'Read it and tune', de: 'Lesen und tunen' } },
    { id: 'fields', title: { en: 'Fields and units', de: 'Felder und Einheiten' } },
    { id: 'faq', title: { en: 'Questions', de: 'Fragen' } },
  ];

  const what = section('what', toc[0].title, `
${P(`Like a real drone with Betaflight, Propwash ${meta.propwash} can record every flight: sticks, setpoints, gyro, PID terms, motors and battery at every pass of the flight controller loop – 2 kHz with the default PID loop. The logs are real Betaflight blackbox logs (<code>.bbl</code>), so real tuning tools open them:`,
    `Wie eine echte Drohne mit Betaflight zeichnet Propwash ${meta.propwash} auf Wunsch jeden Flug auf: Knüppel, Sollwerte, Gyro, PID-Anteile, Motoren und Akku bei jedem Durchlauf der Regelschleife – 2 kHz mit der Standard-Regelschleife. Die Logs sind echte Betaflight-Blackbox-Logs (<code>.bbl</code>), also öffnen sie echte Tuning-Werkzeuge:`)}
${list([
    ['<strong>Betaflight Blackbox Explorer</strong> – in the browser at <a href="https://blackbox.betaflight.com/" target="_blank" rel="noopener">blackbox.betaflight.com</a> or as an app: every trace over time, the sticks, the motors and a spectrum of the noise.',
      '<strong>Betaflight Blackbox Explorer</strong> – im Browser unter <a href="https://blackbox.betaflight.com/" target="_blank" rel="noopener">blackbox.betaflight.com</a> oder als Programm: alle Kurven über der Zeit, die Knüppel, die Motoren und ein Spektrum des Rauschens.'],
    ['<strong>PIDtoolbox</strong> – <a href="https://pidtoolbox.com/" target="_blank" rel="noopener">pidtoolbox.com</a>: step response per axis (how fast and how cleanly the gyro follows the setpoint), noise by throttle and frequency.',
      '<strong>PIDtoolbox</strong> – <a href="https://pidtoolbox.com/" target="_blank" rel="noopener">pidtoolbox.com</a>: Sprungantwort je Achse (wie schnell und sauber das Gyro dem Sollwert folgt), Rauschen nach Gas und Frequenz.'],
  ])}
${P('The flight model of Propwash reacts to PIDs, filters and rates like a real drone, so what you learn from the log goes straight back into the configurator.',
    'Das Flugmodell von Propwash reagiert auf PIDs, Filter und Rates wie eine echte Drohne – was du aus dem Log lernst, trägst du direkt im Konfigurator ein.')}
`);

  const on = section('switch-on', toc[1].title, `
${list([
    ['Open the configurator (<kbd>K</kbd>) and go to the <em>Blackbox</em> tab.', 'Konfigurator öffnen (<kbd>K</kbd>), Tab <em>Blackbox</em>.'],
    ['Set <em>Log while armed</em> to <em>On</em>. Leave <em>Logging rate</em> at 1/1 (every loop, about 4 MB per flight minute); 1/2 to 1/8 make smaller logs.', '<em>Beim Scharfschalten loggen</em> auf <em>An</em>. <em>Lograte</em> auf 1/1 lassen (jeder Durchlauf, etwa 4 MB pro Flugminute); 1/2 bis 1/8 ergeben kleinere Logs.'],
    ['<em>Storage for logs</em> caps the folder (128 MB to 4 GB, default 512 MB): before a new log starts, the oldest logs are deleted until it fits.', '<em>Speicher für Logs</em> begrenzt den Ordner (128 MB bis 4 GB, Standard 512 MB): Bevor ein neuer Log beginnt, werden die ältesten Logs gelöscht, bis er hineinpasst.'],
    ['Save. From now on every arm starts a new log and disarming ends it. The logs stay on your computer; nothing is sent to the server.', 'Speichern. Ab jetzt beginnt jedes Scharfschalten einen neuen Log, Entschärfen beendet ihn. Die Logs bleiben auf deinem Rechner, nichts geht an den Server.'],
  ], true)}
${P(`Only some flights: put <em>${esc(fnName.en)}</em> on a radio switch in the <em>Modes</em> tab, like the BLACKBOX mode in Betaflight – then the blackbox logs only while the switch is on (in a failsafe it always logs). Without that switch, the key ${keyText} pauses and resumes logging; every arm starts with logging running.`,
    `Nur bestimmte Flüge: <em>${esc(fnName.de)}</em> im Tab <em>Modi</em> auf einen Schalter legen, wie den Modus BLACKBOX in Betaflight – dann loggt die Blackbox nur, solange der Schalter an ist (im Failsafe immer). Ohne diesen Schalter pausiert die Taste ${keyText} die Aufzeichnung und setzt sie fort; jedes Scharfschalten beginnt mit laufender Aufzeichnung.`)}
${ctx.images.blackbox_tab ? figure(prefix, ctx.images.blackbox_tab, { en: 'The Blackbox tab of the configurator: logging switched on, logging rate 1/1 at 2 kHz, storage limit, a list of logs with date, duration and size, and the status ready', de: 'Der Tab Blackbox des Konfigurators: Aufzeichnung eingeschaltet, Lograte 1/1 bei 2 kHz, Speichergrenze, eine Liste der Logs mit Datum, Dauer und Größe und der Status bereit' }, { en: 'The Blackbox tab with the logs of the last flights.', de: 'Der Tab Blackbox mit den Logs der letzten Flüge.' }) : ''}
`);

  const flight = section('test-flight', toc[2].title, `
${P('Good tuning logs are short (30 s to 2 min) and contain what you want to check:', 'Gute Tuning-Logs sind kurz (30 s bis 2 min) und enthalten, was du prüfen willst:')}
${list([
    ['<strong>Step response (P, D, feedforward):</strong> in Acro, short hard stick snaps on roll and pitch with the sticks released in between, a few flips and rolls.', '<strong>Sprungantwort (P, D, Feedforward):</strong> im Acro-Modus kurze, harte Knüppelschläge auf Roll und Nick, dazwischen loslassen, ein paar Flips und Rollen.'],
    ['<strong>Noise and filters:</strong> one slow throttle sweep to full and back, then quick punches.', '<strong>Rauschen und Filter:</strong> einmal langsam bis Vollgas und zurück, dann kurze Gasstöße.'],
    ['<strong>Prop wash:</strong> steep dives into your own air and hard turns.', '<strong>Prop-Wash:</strong> steile Sturzflüge in die eigene Luft und harte Kehren.'],
    ['<strong>I-term:</strong> long turns and fast straight flight with changing throttle.', '<strong>I-Anteil:</strong> lange Kurven und schneller Geradeausflug mit wechselndem Gas.'],
  ])}
`);

  const open = section('open', toc[3].title, `
${P(`Click <em>Open folder</em> in the <em>Blackbox</em> tab. The logs are in ${mono('propwash/blackbox')} in your game directory, named ${mono('propwash_YYYY-MM-DD_HH-MM-SS_<drone name>.bbl')}.`,
    `Im Tab <em>Blackbox</em> auf <em>Ordner öffnen</em> klicken. Die Logs liegen in ${mono('propwash/blackbox')} im Spielverzeichnis und heißen ${mono('propwash_JJJJ-MM-TT_HH-MM-SS_<Name der Drohne>.bbl')}.`)}
${list([
    ['<strong>Blackbox Explorer:</strong> open the file (or drop it on the page). The header shows the firmware line “Betaflight 4.5.1 compatible (Propwash v…)” and your drone’s PIDs, rates and filters. Lay gyro and setpoint of one axis on top of each other and show the spectrum.', '<strong>Blackbox Explorer:</strong> Datei öffnen (oder auf die Seite ziehen). Der Kopf zeigt die Firmware-Zeile „Betaflight 4.5.1 compatible (Propwash v…)“ und PIDs, Rates und Filter deiner Drohne. Gyro und Sollwert einer Achse übereinanderlegen und das Spektrum einblenden.'],
    ['<strong>PIDtoolbox:</strong> load the file (PIDtoolbox decodes it with blackbox_decode), then look at the step response and the spectral analysis.', '<strong>PIDtoolbox:</strong> Datei laden (PIDtoolbox dekodiert sie mit blackbox_decode), dann Sprungantwort und Spektralanalyse ansehen.'],
  ])}
${note('Propwash is not Betaflight: the logs report compatibility with Betaflight 4.5.1 (header “Betaflight 4.5.1 compatible (Propwash v…)”, board “PROPWASH”) so that both tools understand and scale every field. Filters the flight model doesn’t have – dynamic notch, RPM filter, dynamic lowpasses – are 0 in the header.',
    'Propwash ist kein Betaflight: Die Logs melden Kompatibilität mit Betaflight 4.5.1 (Kopf „Betaflight 4.5.1 compatible (Propwash v…)“, Board „PROPWASH“), damit beide Werkzeuge jedes Feld verstehen und richtig skalieren. Filter, die das Flugmodell nicht hat – dynamischer Notch, RPM-Filter, dynamische Tiefpässe –, stehen im Kopf auf 0.')}
`);

  const row = (a, b, c) => ({ cells: [L(a[0], a[1]), L(b[0], b[1]), L(c[0], c[1])] });
  const read = section('read', toc[4].title, `
${table([['What you see', 'Was du siehst'], ['Meaning', 'Bedeutung'], ['Change in the <em>PID tuning</em> or <em>Rates</em> tab', 'Im Tab <em>PID-Tuning</em> oder <em>Rates</em> ändern']], [
    row(['Step response rises slowly and stays below 1', 'Sprungantwort steigt langsam und bleibt unter 1'], ['Too little P or feedforward', 'Zu wenig P oder Feedforward'], ['Raise P or FF', 'P oder FF erhöhen']),
    row(['Step response overshoots well above 1 and rings', 'Sprungantwort schießt deutlich über 1 und schwingt nach'], ['Too much P, too little D', 'Zu viel P, zu wenig D'], ['Lower P or raise D', 'P senken oder D erhöhen']),
    row(['Gyro lags behind the setpoint', 'Gyro folgt dem Sollwert verzögert'], ['Feedforward too small, filters too low', 'Feedforward zu klein, Filter zu tief'], ['Raise FF, raise the gyro or D-term lowpass', 'FF erhöhen, Gyro- oder D-Tiefpass höher']),
    row(['Oscillation in dives and hard turns (prop wash)', 'Schwingen in Sturzflügen und harten Kehren (Prop-Wash)'], ['Too little D', 'Zu wenig D'], ['Raise D, check I-term relax', 'D erhöhen, I-Relax prüfen']),
    row(['Broad noise above 100–200 Hz in the gyro spectrum', 'Breites Rauschen über 100–200 Hz im Gyro-Spektrum'], ['Motor and frame vibration, damaged props', 'Motor- und Rahmenvibration, beschädigte Props'], ['Lower the gyro lowpass, swap damaged props', 'Gyro-Tiefpass senken, beschädigte Props tauschen']),
    row(['Very busy D-term, warm motors', 'D-Anteil sehr unruhig, warme Motoren'], ['D or the D-term lowpass too high', 'D oder D-Tiefpass zu hoch'], ['Lower D or the D-term lowpass', 'D oder D-Tiefpass senken']),
    row(['I-term drifts far in long turns', 'I-Anteil wandert in langen Kurven weit'], ['Wind, center of gravity or too little I', 'Wind, Schwerpunkt oder zu wenig I'], ['Raise I', 'I erhöhen']),
    row(['Motors often hit 100 %', 'Motoren stoßen oft an 100 %'], ['Weak drone or very hard rates', 'Schwache Drohne oder sehr harte Rates'], ['Lower the rates, use stronger parts', 'Rates senken, stärkere Teile']),
  ])}
${P('Change one thing at a time, fly the same test again and compare.', 'Eine Sache auf einmal ändern, denselben Test noch einmal fliegen und vergleichen.')}
`);

  const f = (name, en, de) => ({ cells: [mono(name), L(en, de)] });
  const fields = section('fields', toc[5].title, `
${table([['Field', 'Feld'], ['Content', 'Inhalt']], [
    f('gyroADC[0–2]', 'Filtered gyro in °/s (roll, pitch, yaw)', 'Gefiltertes Gyro in °/s (Roll, Nick, Gier)'),
    f('gyroUnfilt[0–2], debug[0–2]', 'Raw gyro before the lowpass (debug mode Gyro Scaled)', 'Rohes Gyro vor dem Tiefpass (Debug-Modus Gyro Scaled)'),
    f('setpoint[0–3]', 'Setpoint in °/s, throttle of the mixer', 'Sollwert in °/s, Gas des Mischers'),
    f('rcCommand[0–3]', 'Sticks after the deadband (±500, throttle 1000–2000)', 'Knüppel nach dem Totband (±500, Gas 1000–2000)'),
    f('axisP/I/D/F[0–2]', 'PID terms (D only on axes with a D gain)', 'PID-Anteile (D nur auf Achsen mit D-Wert)'),
    f('motor[0–3], eRPM[0–3]', 'Motor output 0–100 % as a DShot value, motor speed', 'Motorleistung 0–100 % als DShot-Wert, Motordrehzahl'),
    f('vbatLatest, amperageLatest', 'Battery voltage and current', 'Akkuspannung und -strom'),
    f('baroAlt, rssi', 'Barometer height, radio link', 'Barometerhöhe, Funkverbindung'),
    f('GPS', 'Position of the simulated GPS receiver around 0° N 0° E (the world has no real coordinates), speed and course', 'Position des simulierten GPS-Empfängers um 0° N 0° O (die Welt hat keine echten Koordinaten), Tempo und Kurs'),
    f('flightModeFlags', 'Arm, Angle, Horizon, Airmode, 3D, failsafe, GPS rescue, beeper, blackbox switch', 'Scharf, Angle, Horizon, Airmode, 3D, Failsafe, GPS-Rettung, Piepser, Blackbox-Schalter'),
  ])}
`);

  const faq = section('faq', toc[6].title, `
${list([
    ['<strong>No log?</strong> Is the blackbox switched on and saved in the tab? If the <em>Blackbox</em> function is on a switch, the switch must be on while you fly. The status line in the tab tells what the blackbox is doing.', '<strong>Kein Log?</strong> Ist die Blackbox im Tab eingeschaltet und gespeichert? Liegt die Funktion <em>Blackbox</em> auf einem Schalter, muss er beim Fliegen an sein. Die Statuszeile im Tab sagt, was die Blackbox gerade tut.'],
    ['<strong>Logs disappear?</strong> The storage limit was reached; copy logs you want to keep or raise the limit.', '<strong>Logs verschwinden?</strong> Die Speichergrenze ist erreicht; Logs, die du behalten willst, wegkopieren oder die Grenze erhöhen.'],
    ['<strong>Altitude or position hold?</strong> Betaflight 4.5 has no flag for them, so the log shows them as Angle.', '<strong>Höhe oder Position halten?</strong> Betaflight 4.5 hat dafür kein Flag, der Log zeigt sie als Angle.'],
  ])}
`);

  return {
    id: 'blackbox',
    title: { en: 'Blackbox tuning – Propwash FPV docs', de: 'Tuning mit der Blackbox – Propwash-FPV-Doku' },
    description: {
      en: `Record flights in Propwash FPV ${meta.propwash} as Betaflight blackbox logs and tune your drone with Blackbox Explorer and PIDtoolbox.`,
      de: `Flüge in Propwash FPV ${meta.propwash} als Betaflight-Blackbox-Logs aufzeichnen und die Drohne mit Blackbox Explorer und PIDtoolbox tunen.`,
    },
    kicker: L('Docs · For players', 'Doku · Für Spieler'),
    heading: { en: 'Tuning with Blackbox Explorer and PIDtoolbox', de: 'Tuning mit Blackbox Explorer und PIDtoolbox' },
    lead: {
      en: 'Every armed flight as a real Betaflight blackbox log – open it in the tools real pilots use.',
      de: 'Jeder scharfe Flug als echter Betaflight-Blackbox-Log – zum Öffnen in den Werkzeugen echter Piloten.',
    },
    toc,
    body: [what, on, flight, open, read, fields, faq].join('\n'),
  };
}
