// Docs start page: what is where, for whom, and which release the pages describe.

import { L, P, list, section } from '../html.mjs';

export default function indexPage(ctx) {
  const { meta, gamerules, api, parts, controls } = ctx.data;
  const prefix = ctx.prefix;
  const card = (href, title, text, who) => `<a class="docs-card" href="${prefix}${href}">
<span class="docs-card__who">${L(who.en, who.de)}</span>
<span class="docs-card__title">${L(title.en, title.de)}</span>
<span class="docs-card__text">${L(text.en, text.de)}</span>
</a>`;
  const typeCount = api.packages.reduce((n, p) => n + p.types.length, 0);
  const toc = [
    { id: 'sections', title: { en: 'What is here', de: 'Was hier steht' } },
    { id: 'made', title: { en: 'How these pages are made', de: 'Wie diese Seiten entstehen' } },
  ];
  const cards = section('sections', toc[0].title, `<div class="docs-cards">
${card('docs/guide/', { en: 'Player guide', de: 'Spielerhandbuch' },
    { en: `First flight, binding the radio and wearing matching goggles, radio and gamepad setup, all ${controls.keys.length} keys and what server owners need.`, de: `Erster Flug, Funke binden und passende Brille aufsetzen, Funke und Gamepad einrichten, alle ${controls.keys.length} Tasten und was Server-Betreiber brauchen.` },
    { en: 'Players', de: 'Spieler' })}
${card('docs/blackbox/', { en: 'Blackbox tuning', de: 'Tuning mit der Blackbox' },
    { en: 'Record every flight as a Betaflight blackbox log and tune your drone with Blackbox Explorer and PIDtoolbox.', de: 'Jeden Flug als Betaflight-Blackbox-Log aufzeichnen und die Drohne mit Blackbox Explorer und PIDtoolbox tunen.' },
    { en: 'Players', de: 'Spieler' })}
${card('docs/gamerules/', { en: 'World rules', de: 'Welt-Regeln' },
    { en: `All ${gamerules.rules.length} gamerules: gravity, wind, battery life, crash damage, video range and channels, with commands and recipes.`, de: `Alle ${gamerules.rules.length} Gamerules: Schwerkraft, Wind, Akkulaufzeit, Crash-Schaden, Videoreichweite und Kanäle, mit Befehlen und Rezepten.` },
    { en: 'Players and server owners', de: 'Spieler und Server-Betreiber' })}
${card('docs/api/', { en: 'Add-on API', de: 'Add-on-API' },
    { en: 'Add parts, presets, creative tabs, workbench buttons, configurator tabs and Flight School scenes from your own mod.', de: 'Teile, Presets, Kreativ-Tabs, Werkbank-Knöpfe, Konfigurator-Tabs und Flugschul-Szenen aus dem eigenen Mod hinzufügen.' },
    { en: 'Mod authors', de: 'Mod-Autoren' })}
${card('docs/api/reference/', { en: 'API reference', de: 'API-Referenz' },
    { en: `All ${typeCount} public types of API ${api.version} with every component and method.`, de: `Alle ${typeCount} öffentlichen Typen der API ${api.version} mit jeder Komponente und Methode.` },
    { en: 'Mod authors', de: 'Mod-Autoren' })}
${card('docs/parts-format/', { en: 'Parts format (JSON)', de: 'Teile-Format (JSON)' },
    { en: `Every field of frames, stacks, motors, props, video units, batteries, accessories and chemistries (format ${parts.format}).`, de: `Jedes Feld von Rahmen, Stacks, Motoren, Props, Videomodulen, Akkus, Zubehör und Zellchemien (Format ${parts.format}).` },
    { en: 'Mod and data pack authors', de: 'Mod- und Daten-Autoren' })}
</div>
${P('In the game itself, the Flight School explains every item: hold <kbd>M</kbd> over it in your inventory, or press <kbd>M</kbd> in the world for all lessons. Hold <kbd>Shift</kbd> for detailed tooltips.',
    'Im Spiel selbst erklärt die Flugschule jedes Item: <kbd>M</kbd> darüber im Inventar halten oder in der Welt drücken für alle Lektionen. <kbd>Shift</kbd> zeigt ausführliche Tooltips.')}`);

  const made = section('made', toc[1].title, `
${P(`These pages describe <strong>Propwash FPV ${meta.propwash}</strong> for Minecraft ${meta.minecraft} (Fabric and NeoForge), API ${meta.api}, network protocol ${meta.protocol}. They are generated from the source code of that release and refreshed with every new version:`,
    `Diese Seiten beschreiben <strong>Propwash FPV ${meta.propwash}</strong> für Minecraft ${meta.minecraft} (Fabric und NeoForge), API ${meta.api}, Netzwerkprotokoll ${meta.protocol}. Sie entstehen aus dem Quellcode dieser Version und werden mit jeder neuen Version erneuert:`)}
${list([
    ['the world rules from the game’s own rule catalogue, with the same texts as in the game,', 'die Welt-Regeln aus dem Regel-Katalog des Spiels, mit denselben Texten wie im Spiel,'],
    ['the keys and switch functions from the key defaults and language files,', 'die Tasten und Schalter-Funktionen aus den Standardbelegungen und Sprachdateien,'],
    ['the API reference from the API sources, and the parts format checked against the part reader,', 'die API-Referenz aus den API-Quellen und das Teile-Format geprüft gegen den Teile-Leser,'],
    ['the server.json settings with their defaults and limits from the server configuration.', 'die server.json-Einstellungen mit Standards und Grenzen aus der Server-Konfiguration.'],
  ])}
${P('The explanations around them are written by hand. Found something wrong? Tell us on <a href="https://discord.gg/bNhkSXYSgZ" target="_blank" rel="noopener">Discord</a>.',
    'Die Erklärungen drumherum sind von Hand geschrieben. Etwas falsch gefunden? Sag es uns auf <a href="https://discord.gg/bNhkSXYSgZ" target="_blank" rel="noopener">Discord</a>.')}
`);

  return {
    id: 'overview',
    title: { en: 'Docs – Propwash FPV', de: 'Doku – Propwash FPV' },
    description: {
      en: `Official documentation of Propwash FPV ${meta.propwash}: player guide, world rules (gamerules), add-on API with reference and the JSON parts format.`,
      de: `Offizielle Dokumentation von Propwash FPV ${meta.propwash}: Spielerhandbuch, Welt-Regeln (Gamerules), Add-on-API mit Referenz und das JSON-Teile-Format.`,
    },
    kicker: L(`Propwash FPV ${meta.propwash} · Docs`, `Propwash FPV ${meta.propwash} · Doku`),
    heading: { en: 'Documentation', de: 'Dokumentation' },
    lead: {
      en: 'Everything about Propwash FPV in one place: how your first drone gets into the air, the world rules for server owners, and the add-on API with its data format for mod authors.',
      de: 'Alles über Propwash FPV an einem Ort: wie deine erste Drohne in die Luft kommt, die Welt-Regeln für Server-Betreiber und die Add-on-API samt Datenformat für Mod-Autoren.',
    },
    toc,
    body: [cards, made].join('\n'),
  };
}
