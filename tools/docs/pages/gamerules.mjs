// World rules (gamerules): generated from the mod's export of its rule catalogue (tools/export_rules.sh in the
// Propwash repository). Rule names, descriptions, value names, ranges and defaults come from the export; only the
// explanations around the tables are written here.

import { L, P, esc, list, note, section, table, code, figure, h3 } from '../html.mjs';

const NB = ' ';

export const RECIPES = [
  {
    id: 'relaxed',
    title: { en: 'Relaxed building server', de: 'Entspannter Bau-Server' },
    text: {
      en: 'Crashes cost nothing and batteries last twice as long. Battery life counts as physics, so flights on this server do not go into the leaderboards.',
      de: 'Abstürze kosten nichts, Akkus halten doppelt so lange. Die Akkulaufzeit zählt zur Physik, Flüge auf diesem Server landen also nicht in den Bestenlisten.',
    },
    commands: ['/gamerule propwash:crash_damage false', '/gamerule propwash:battery_scale 200'],
  },
  {
    id: 'race-night',
    title: { en: 'Race night', de: 'Rennabend' },
    text: {
      en: 'At most eight pilots on air at once, like the eight channels of a real race heat, and crashes do not wear the parts, so nobody swaps props between heats. Both rules leave the physics alone: laps still count for the leaderboard.',
      de: 'Höchstens acht Piloten gleichzeitig in der Luft, wie die acht Kanäle eines echten Rennlaufs, und Abstürze nutzen keine Teile ab, damit niemand zwischen den Läufen Props tauscht. Beide Regeln lassen die Physik in Ruhe: Runden zählen weiter für die Bestenliste.',
    },
    commands: ['/gamerule propwash:max_video_channels 8', '/gamerule propwash:crash_damage false'],
  },
  {
    id: 'long-range',
    title: { en: 'Exploring the world', de: 'Die Welt erkunden' },
    text: {
      en: 'Digital drones never lose picture or radio link and batteries last five times as long. The distance limit in server.json still applies.',
      de: 'Digitale Drohnen verlieren nie Bild und Funk, Akkus halten fünfmal so lange. Die Entfernungsgrenze aus server.json gilt weiter.',
    },
    commands: ['/gamerule propwash:infinite_range_digital true', '/gamerule propwash:battery_scale 500'],
  },
  {
    id: 'hardcore',
    title: { en: 'Hardcore', de: 'Hardcore' },
    text: {
      en: 'Storm-strength wind, crashes count earlier and wear the parts twice as fast. Wind and crash tolerance change the physics, so these flights stay off the leaderboards.',
      de: 'Wind in Sturmstärke, Abstürze zählen früher und nutzen die Teile doppelt so schnell ab. Wind und Crash-Toleranz ändern die Physik, diese Flüge bleiben also aus den Bestenlisten.',
    },
    commands: ['/gamerule propwash:wind 3', '/gamerule propwash:crash_tolerance 75', '/gamerule propwash:crash_damage_scale 200'],
  },
  {
    id: 'freestyle-park',
    title: { en: 'Freestyle playground', de: 'Freestyle-Spielplatz' },
    text: {
      en: 'Every drone pulls a trail in its own colour, so you see each other in FPV, and fast drones smash through glass – spawn protection and claims stay whole. Neither rule changes the physics: laps still count for the leaderboards.',
      de: 'Jede Drohne zieht eine Spur in ihrer eigenen Farbe, so seht ihr euch im FPV-Bild, und schnelle Drohnen zerbrechen Glas – Spawn-Schutz und Claims bleiben ganz. Keine der beiden Regeln ändert die Physik: Runden zählen weiter für die Bestenlisten.',
    },
    commands: ['/gamerule propwash:drone_trails true', '/gamerule propwash:drones_break_blocks true'],
  },
];

function fmt(n, lang) {
  return lang === 'de' ? String(n).replace('.', ',') : String(n);
}

function unit(rule, n, lang) {
  return rule.unit === '%' ? `${fmt(n, lang)}${NB}%` : fmt(n, lang);
}

// Lower-cases only the leading letter, so a named value folds into a sentence ("0 = kein Stoß") without
// lower-casing a German noun further in (capitalisation elsewhere in the string is never incidental).
function decap(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function defaultText(rule) {
  if (rule.type === 'boolean') return rule.default ? { en: 'On', de: 'An' } : { en: 'Off', de: 'Aus' };
  const named = rule.values && rule.values[String(rule.default)];
  if (named) return { en: `${unit(rule, rule.default, 'en')} (${named.en})`, de: `${unit(rule, rule.default, 'de')} (${named.de})` };
  return { en: unit(rule, rule.default, 'en'), de: unit(rule, rule.default, 'de') };
}

export function valuesText(rule) {
  if (rule.type === 'boolean') return { en: '<span class="nowrap"><code>true</code> / <code>false</code></span>', de: '<span class="nowrap"><code>true</code> / <code>false</code></span>' };
  if (rule.display === 'levels' && rule.values) {
    const parts = (lang) => Object.entries(rule.values).map(([k, v]) => `<code>${k}</code>${NB}${esc(v[lang])}`).join(', ');
    return { en: parts('en'), de: parts('de') };
  }
  const range = (lang) => `${unit(rule, rule.min, lang)}–${unit(rule, rule.max, lang)}`.replace(`${NB}%–`, '–');
  const special = (lang) => Object.entries(rule.values || {}).map(([k, v]) => `; <code>${k}</code> = ${esc(decap(v[lang]))}`).join('');
  return { en: range('en') + special('en'), de: range('de') + special('de') };
}

export function presetValueText(rule, value) {
  if (rule.type === 'boolean') return value ? { en: 'on', de: 'an' } : { en: 'off', de: 'aus' };
  const named = rule.values && rule.values[String(value)];
  if (named) return { en: `${unit(rule, value, 'en')} (${decap(named.en)})`, de: `${unit(rule, value, 'de')} (${decap(named.de)})` };
  return { en: unit(rule, value, 'en'), de: unit(rule, value, 'de') };
}

export function checkCommand(rules, command) {
  const m = command.match(/^\/gamerule (propwash:[a-z0-9_]+) (\S+)$/);
  if (!m) return `kein /gamerule-Befehl: ${command}`;
  const rule = rules.find((r) => r.id === m[1]);
  if (!rule) return `unbekannte Regel: ${m[1]}`;
  if (rule.type === 'boolean') return ['true', 'false'].includes(m[2]) ? null : `${m[1]} erwartet true/false: ${m[2]}`;
  const v = Number(m[2]);
  if (!Number.isInteger(v) || v < rule.min || v > rule.max) return `${m[1]} außerhalb ${rule.min}–${rule.max}: ${m[2]}`;
  return null;
}

export default function gamerulesPage(ctx) {
  const data = ctx.data.gamerules;
  const rules = data.rules;
  const physics = rules.filter((r) => r.changes_physics);
  const toc = [
    { id: 'how', title: { en: 'How they work', de: 'So funktionieren sie' } },
    { id: 'presets', title: { en: 'Presets', de: 'Voreinstellungen' } },
    ...data.groups.map((g) => ({ id: `group-${g.id}`, title: g.title })),
    { id: 'recipes', title: { en: 'Recipes for server owners', de: 'Rezepte für Server-Betreiber' } },
    { id: 'from-04', title: { en: 'Coming from 0.4', de: 'Umstieg von 0.4' } },
    { id: 'data', title: { en: 'As data', de: 'Als Daten' } },
  ];

  const how = section('how', toc[0].title, `
${P('World rules are Minecraft game rules of the world. They apply to every player in it, are saved with the world and reach every client from the server. With all rules at their defaults drones fly with the refined flight model of 0.5.0: compared with 0.4 every size climbs a little stronger and sinks a little faster under throttle, the 65 mm whoop falls and flies faster, and the 5″ race drone carries its battery underneath. The other difference is that drones now hit mobs and players (<em>Drones hit mobs and players</em>, on by default).',
    'Welt-Regeln sind Minecraft-Spielregeln der Welt. Sie gelten für alle Spieler darin, werden mit der Welt gespeichert und erreichen jeden Client vom Server. Stehen alle Regeln auf Standard, fliegen Drohnen mit dem verfeinerten Flugmodell von 0.5.0: Gegenüber 0.4 steigen alle Größen etwas kräftiger und sinken unter Gas etwas schneller, der 65-mm-Whoop fällt und fliegt schneller, und die 5″-Race-Drohne trägt ihren Akku unten. Anders ist außerdem, dass Drohnen jetzt Lebewesen treffen (<em>Drohnen treffen Lebewesen</em>, Standard an).')}
${figure(ctx.prefix, ctx.images.world_rules, { en: 'The World rules tab in the Propwash configurator: the presets Realistic, Training and Arcade at the top, then physics, wind and weather and battery rules with sliders and switches', de: 'Der Tab „Welt-Regeln“ im Propwash-Konfigurator: oben die Voreinstellungen Realistisch, Training und Arcade, darunter Physik, Wind und Wetter und Akku mit Reglern und Schaltern' }, { en: 'Configurator (<kbd>K</kbd>) → <em>World rules</em>. Hover a rule for its explanation, default, range and command.', de: 'Konfigurator (<kbd>K</kbd>) → <em>Welt-Regeln</em>. Mit der Maus über einer Regel stehen Erklärung, Standard, Bereich und Befehl.' })}
${h3('how-change', 'Who can change them', 'Wer sie ändern darf')}
${list([
    ['<strong>Singleplayer and LAN host:</strong> always, in the configurator tab <em>World rules</em>, even in a world without cheats.', '<strong>Einzelspieler und LAN-Host:</strong> immer, im Konfigurator-Tab <em>Welt-Regeln</em>, auch in einer Welt ohne Cheats.'],
    ['<strong>Servers:</strong> everyone allowed to use <code>/gamerule</code>, in the same tab or with the command – operators (permission level 2) and, since 0.5.1, admins who get that permission from a permission mod. A rule a permission mod locks for someone stays locked in the tab too. Presets need <code>/propwash rules preset</code> or the right to set every rule.', '<strong>Server:</strong> alle, die <code>/gamerule</code> nutzen dürfen, im selben Tab oder mit dem Befehl – Operatoren (Rechtestufe 2) und seit 0.5.1 auch Admins, die das Recht über einen Rechte-Mod bekommen. Sperrt ein Rechte-Mod jemandem eine Regel, bleibt sie auch im Tab gesperrt. Voreinstellungen brauchen <code>/propwash rules preset</code> oder das Recht, jede Regel zu setzen.'],
    ['<strong>Everyone else</strong> sees the same tab as a read-only list with every explanation, so nobody has to guess what applies.', '<strong>Alle anderen</strong> sehen denselben Tab als lesbare Liste mit allen Erklärungen und müssen nicht raten, was gilt.'],
    ['Every change made in the tab shows up for all players as a grey chat line naming who changed which rule.', 'Jede Änderung aus dem Tab sehen alle Spieler als graue Chatzeile, die nennt, wer welche Regel geändert hat.'],
  ])}
${h3('how-commands', 'Commands', 'Befehle')}
${code(`${data.command.replace('<id>', 'propwash:<rule>')}\n/gamerule propwash:wind\n/propwash rules\n/propwash rules preset <name>`, 'chat')}
${P('<code>/gamerule</code> without a value shows the current one. <code>/propwash rules</code> lists the server settings and all world rules at once and names the preset they match; <code>/propwash rules preset</code> sets all rules of a preset (operators). When you create a world, the rules are also in Minecraft’s <em>Game Rules</em> screen under the category <em>Propwash FPV</em>.',
    '<code>/gamerule</code> ohne Wert zeigt den aktuellen. <code>/propwash rules</code> listet Server-Einstellungen und alle Welt-Regeln auf einmal und nennt die Voreinstellung, der sie entsprechen; <code>/propwash rules preset</code> setzt alle Regeln einer Voreinstellung (Operatoren). Beim Anlegen einer Welt stehen die Regeln auch in Minecrafts Fenster <em>Spielregeln</em> unter der Kategorie <em>Propwash FPV</em>.')}
${h3('how-leaderboards', 'Leaderboards', 'Bestenlisten')}
${P(`Rules marked <span class="docs-badge docs-badge--physics">physics</span> change how drones fly (${physics.length} of ${rules.length}). As soon as one of them differs from its default, flights no longer count for leaderboards and server records, so records stay comparable. The server checks this itself.`,
    `Regeln mit <span class="docs-badge docs-badge--physics">Physik</span> ändern, wie Drohnen fliegen (${physics.length} von ${rules.length}). Sobald eine davon vom Standard abweicht, zählen Flüge nicht mehr für Bestenlisten und Server-Rekorde, damit Rekorde vergleichbar bleiben. Das prüft der Server selbst.`)}
`);

  const presetList = data.presets || [];
  const presetCards = presetList.map((preset) => {
    const changed = (preset.differs_from_default || []).map((name) => {
      const rule = rules.find((r) => r.name === name);
      const value = presetValueText(rule, preset.values[name]);
      return [`<a href="#rule-${rule.name}">${esc(rule.title.en)}</a>: ${value.en}`, `<a href="#rule-${rule.name}">${esc(rule.title.de)}</a>: ${value.de}`];
    });
    const physicsNote = preset.changes_physics
      ? P('Changes physics rules: flights do not count for leaderboards.', 'Ändert Physik-Regeln: Flüge zählen nicht für Bestenlisten.')
      : '';
    return `<div class="docs-card docs-card--plain" id="preset-${preset.id}">
<h3 class="docs-card__title">${L(esc(preset.title.en), esc(preset.title.de))}</h3>
${P(esc(preset.description.en), esc(preset.description.de))}
${changed.length ? list(changed) : ''}
${physicsNote}
${code(preset.command, 'chat')}
</div>`;
  }).join('\n');
  const countWord = (n, lang) => (lang === 'de' ? ['keine', 'eine', 'zwei', 'drei', 'vier', 'fünf'] : ['no', 'one', 'two', 'three', 'four', 'five'])[n] ?? String(n);
  const presets = section('presets', toc[1].title, `
${P(`The top of the <em>World rules</em> tab has ${countWord(presetList.length, 'en')} presets. One click sets every rule for everyone in the world; single rules stay adjustable afterwards, and the tab shows which preset the world matches or <em>Custom rules</em>. Who may click them is the same as for single rules: the host and operators.`,
    `Oben im Tab <em>Welt-Regeln</em> stehen ${countWord(presetList.length, 'de')} Voreinstellungen. Ein Klick setzt jede Regel für alle in der Welt; einzelne Regeln bleiben danach einstellbar, und der Tab zeigt, welcher Voreinstellung die Welt entspricht, oder <em>Eigene Regeln</em>. Klicken dürfen dieselben wie bei einzelnen Regeln: der Host und Operatoren.`)}
<div class="docs-recipes">
${presetCards}
</div>
`);

  const groups = data.groups.map((group) => {
    const rows = rules.filter((r) => r.group === group.id).map((rule) => {
      const badge = rule.changes_physics ? ` <span class="docs-badge docs-badge--physics">${L('physics', 'Physik')}</span>` : '';
      return {
        attrs: `id="rule-${rule.name}"`,
        cells: [
          `<span class="docs-rule__title">${L(esc(rule.title.en), esc(rule.title.de))}</span>${badge}<br><code class="docs-rule__id">${esc(rule.id).replace(':', ':<wbr>')}</code>`,
          L(defaultText(rule)),
          L(valuesText(rule)),
          `${P(esc(rule.description.en), esc(rule.description.de))}<p class="docs-rule__example"><code>${esc(rule.example)}</code></p>`,
        ],
      };
    });
    return section(`group-${group.id}`, group.title, table([['Rule', 'Regel'], ['Default', 'Standard'], ['Values', 'Werte'], ['What it does', 'Wirkung']], rows, 'docs-table--rules'));
  }).join('\n');

  const recipes = section('recipes', toc[toc.length - 3].title, `
${P('A few combinations that work well. Type them in the chat if you may use <code>/gamerule</code>, or change the same rules in the tab.',
    'Ein paar Kombinationen, die gut funktionieren. In den Chat tippen, wenn du <code>/gamerule</code> nutzen darfst, oder dieselben Regeln im Tab ändern.')}
<div class="docs-recipes">
${RECIPES.map((r) => `<div class="docs-card docs-card--plain" id="recipe-${r.id}">
<h3 class="docs-card__title">${L(r.title.en, r.title.de)}</h3>
${P(r.text.en, r.text.de)}
${code(r.commands.join('\n'), 'chat')}
</div>`).join('\n')}
</div>
${note('Back to normal: right-click a rule in the tab for its default, or use the tab’s Defaults button for all of them.',
    'Zurück zum Normalzustand: Rechtsklick auf eine Regel im Tab setzt ihren Standard, der Knopf „Standard“ alle.')}
`);

  const from04 = section('from-04', toc[toc.length - 2].title, list([
    ['The personal <em>Simulation</em> tab is gone; its physics options are world rules now. Old values in <code>config/propwash/drone.json</code> are ignored and removed on the next save.', 'Der persönliche Tab <em>Simulation</em> ist weg, seine Physik-Optionen sind jetzt Welt-Regeln. Alte Werte in <code>config/propwash/drone.json</code> werden ignoriert und beim nächsten Speichern entfernt.'],
    ['The server setting <code>partWear</code> in <code>server.json</code> is replaced by <code>/gamerule propwash:crash_damage false</code>. A <code>"partWear": false</code> from 0.4 is carried over once when the server first starts with 0.5.', 'An die Stelle der Server-Einstellung <code>partWear</code> in <code>server.json</code> tritt <code>/gamerule propwash:crash_damage false</code>. Ein <code>"partWear": false</code> aus 0.4 übernimmt der Server beim ersten Start mit 0.5 einmal.'],
    ['Creative goggles no longer unlock physics options. They keep their free radio range and their own video settings.', 'Die Kreativ-Brille schaltet keine Physik-Optionen mehr frei. Sie behält ihre freie Funkreichweite und ihre eigenen Video-Einstellungen.'],
    ['Existing worlds get every rule with its default when they are loaded. Drones then bounce off mobs and players; <code>/gamerule propwash:drone_hits_entities false</code> lets them fly through as before.', 'Bestehende Welten bekommen beim Laden jede Regel mit ihrem Standardwert. Drohnen prallen dann an Lebewesen ab; mit <code>/gamerule propwash:drone_hits_entities false</code> fliegen sie wie früher hindurch.'],
    [`The flight model itself is refined in 0.5.0 and no world rule switches that back: drones climb a little stronger and sink a little faster under throttle, punch-outs pull harder, the 65 mm whoop is faster, and the 5″ race drone carries its battery underneath. Hovering and hover flight times stay the same. The <a href="${ctx.prefix}changelog/#propwash-0.5.0">changelog</a> has the full list.`, `Das Flugmodell selbst ist in 0.5.0 verfeinert, und keine Welt-Regel stellt das zurück: Drohnen steigen etwas kräftiger und sinken unter Gas etwas schneller, Punch-outs ziehen kräftiger, der 65-mm-Whoop ist schneller, und die 5″-Race-Drohne trägt ihren Akku unten. Schweben und Flugzeiten im Schwebeflug bleiben gleich. Die ganze Liste steht im <a href="${ctx.prefix}changelog/#propwash-0.5.0">Changelog</a>.`],
    ['Personal settings stay personal: controls, OSD, FPV display and graphics.', 'Persönlich bleibt, was persönlich ist: Steuerung, OSD, FPV-Anzeige und Grafik.'],
  ]));

  const asData = section('data', toc[toc.length - 1].title, `
${P(`This page is generated from the rule catalogue of Propwash ${ctx.data.meta.propwash}. The same list as JSON (id, type, default, range, group, texts in English and German, example command) is <a href="gamerules.json" download>gamerules.json</a>, for server panels and tools.`,
    `Diese Seite entsteht aus dem Regel-Katalog von Propwash ${ctx.data.meta.propwash}. Dieselbe Liste als JSON (Id, Typ, Standard, Bereich, Gruppe, Texte auf Englisch und Deutsch, Beispielbefehl) ist <a href="gamerules.json" download>gamerules.json</a>, für Server-Panels und Werkzeuge.`)}
`);

  return {
    id: 'gamerules',
    title: { en: 'World rules (gamerules) – Propwash FPV docs', de: 'Welt-Regeln (Gamerules) – Propwash-FPV-Doku' },
    description: {
      en: `All ${rules.length} Propwash FPV world rules (gamerules) for singleplayer and servers: gravity, wind, battery life, crash damage, video range and channels, with defaults, ranges and commands.`,
      de: `Alle ${rules.length} Welt-Regeln (Gamerules) von Propwash FPV für Einzelspieler und Server: Schwerkraft, Wind, Akkulaufzeit, Crash-Schaden, Videoreichweite und Kanäle, mit Standardwerten, Bereichen und Befehlen.`,
    },
    kicker: L('Docs · For players and server owners', 'Doku · Für Spieler und Server-Betreiber'),
    heading: { en: 'World rules', de: 'Welt-Regeln' },
    lead: {
      en: `${rules.length} gamerules decide how drones behave in a world: physics, wind, battery life, crash damage, video range and how many pilots may be on air. They apply to everyone in the world.`,
      de: `${rules.length} Gamerules bestimmen, wie sich Drohnen in einer Welt verhalten: Physik, Wind, Akkulaufzeit, Crash-Schaden, Videoreichweite und wie viele Piloten gleichzeitig fliegen. Sie gelten für alle in der Welt.`,
    },
    toc,
    body: [how, presets, groups, recipes, from04, asData].join('\n'),
    extraFiles: { 'gamerules.json': JSON.stringify(data, null, 2) + '\n' },
  };
}
