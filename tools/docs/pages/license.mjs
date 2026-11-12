// The licenses of Propwash FPV and its official add-ons in plain words (owner finding OF-6). The page only explains:
// binding are LICENSE, LICENSE-MIT and NOTICE of each project. What it says comes from those texts and from the
// rules for add-ons (ADDONS.md, section “Licensing in short”). tools/test-license.mjs holds it against them.
//
// The additional permissions are PERMISSIONS below, one entry each with the number they have in LICENSE. A further
// additional permission that lardtom releases is one more entry there (and one more line in the test).

import { L, P, h3, list, section, note, code, SHIELD, SOURCES } from '../html.mjs';

export const PERMISSIONS = [
  {
    id: 'modpacks',
    number: 1,
    title: { en: 'Modpacks', de: 'Modpacks' },
    text: {
      en: 'You may put the unchanged release files of Propwash FPV and its official add-ons, as lardtom published them, into a modpack, and modpack platforms may host and deliver them as part of that modpack. Such a modpack does not count as competing. What this does not allow: offering the files on their own, or as the main content of a download, in place of the official pages on CurseForge and Modrinth.',
      de: 'Du darfst die unveränderten Release-Dateien von Propwash FPV und seinen offiziellen Add-ons, so wie lardtom sie veröffentlicht hat, in ein Modpack packen, und Modpack-Plattformen dürfen sie als Teil dieses Modpacks bereitstellen und ausliefern. So ein Modpack gilt nicht als Konkurrenz. Was das nicht erlaubt: die Dateien allein oder als Hauptinhalt eines Downloads anzubieten, anstelle der offiziellen Seiten auf CurseForge und Modrinth.',
    },
  },
  {
    id: 'exit',
    number: 2,
    title: { en: 'Exit clause', de: 'Ausstiegsklausel' },
    text: {
      en: 'If lardtom publishes no new release of a project for 12 months in a row and there is no maintainer activity in its official source repository either, everyone automatically gets an additional license under the MIT License for every version published until then. That license cannot be taken back. If work starts again later, those versions stay MIT, and new versions come under the usual terms again.',
      de: 'Veröffentlicht lardtom 12 Monate am Stück kein neues Release eines Projekts und gibt es auch keine Aktivität eines Maintainers in seinem offiziellen Quellcode-Repository, bekommt jeder automatisch eine zusätzliche Lizenz unter der MIT-Lizenz für jede bis dahin veröffentlichte Version. Diese Lizenz kann nicht zurückgenommen werden. Geht die Arbeit später weiter, bleiben diese Versionen MIT, und neue Versionen stehen wieder unter den üblichen Bedingungen.',
    },
  },
];

const PROJECTS = [
  { key: 'propwash', name: 'Propwash FPV', mit: { en: 'the add-on API (<code>de.lardtom.propwash.api</code>), the example add-on and the documentation', de: 'die Add-on-API (<code>de.lardtom.propwash.api</code>), das Beispiel-Add-on und die Doku' },
    since: { en: 'from version 0.5.0 on; 0.4.0 and older stay All Rights Reserved', de: 'ab Version 0.5.0; 0.4.0 und älter bleiben All Rights Reserved' } },
  { key: 'justmoreparts', name: 'Propwash: Just More Parts', mit: { en: 'the documentation', de: 'die Doku' },
    since: { en: 'from the first version after 1.0.0 on; 1.0.0 stays All Rights Reserved', de: 'ab der ersten Version nach 1.0.0; 1.0.0 bleibt All Rights Reserved' } },
  { key: 'camdrones', name: 'Propwash: Camera Drones', mit: { en: 'the documentation', de: 'die Doku' },
    since: { en: 'for all versions', de: 'für alle Versionen' } },
  { key: 'mobdefense', name: 'Propwash: Mob Defense', mit: { en: 'the documentation', de: 'die Doku' },
    since: { en: 'for all versions', de: 'für alle Versionen' } },
];

export default function licensePage(ctx) {
  const prefix = ctx.prefix;
  const ext = 'target="_blank" rel="noopener"';
  const toc = [
    { id: 'short', title: { en: 'In short', de: 'Kurz gesagt' } },
    { id: 'allowed', title: { en: 'What you may do', de: 'Was du darfst' } },
    { id: 'not-allowed', title: { en: 'What is not allowed', de: 'Was nicht erlaubt ist' } },
    { id: 'notice', title: { en: 'Passing it on: the Required Notice', de: 'Weitergeben: die Required Notice' } },
    { id: 'permissions', title: { en: 'Additional permissions', de: 'Zusatzerlaubnisse' } },
    { id: 'projects', title: { en: 'Which project, which license', de: 'Welches Projekt, welche Lizenz' } },
    { id: 'binding', title: { en: 'The binding texts', de: 'Die verbindlichen Texte' } },
  ];

  const short = section('short', toc[0].title, `
${P(`Propwash FPV and its official add-ons are <strong>source-available</strong>, not open source: the code is public, and you may use it for almost anything except competing with it. The core is under the <a href="${SHIELD}" ${ext}>PolyForm Shield License 1.0.0</a> with two additional permissions; the add-on API, the example add-on and the documentation are under the <strong>MIT License</strong>, so add-ons can use them freely.`,
    `Propwash FPV und seine offiziellen Add-ons sind <strong>source-available</strong>, nicht Open Source: Der Code ist öffentlich, und du darfst ihn für fast alles nutzen, nur nicht, um ihm Konkurrenz zu machen. Der Kern steht unter der <a href="${SHIELD}" ${ext}>PolyForm Shield License 1.0.0</a> mit zwei Zusatzerlaubnissen; die Add-on-API, das Beispiel-Add-on und die Doku stehen unter der <strong>MIT-Lizenz</strong>, Add-ons dürfen sie also frei nutzen.`)}
${note('This page explains the licenses in plain words. It is not legal advice, and it changes nothing: only the license texts are binding.',
    'Diese Seite erklärt die Lizenzen in klaren Worten. Sie ist keine Rechtsberatung und ändert nichts: Verbindlich sind allein die Lizenztexte.')}
`);

  const allowed = section('allowed', toc[1].title, `
${list([
    ['<strong>Play</strong> Propwash and its add-ons, alone, with friends or on your own server, public or private.',
      '<strong>Spielen:</strong> Propwash und seine Add-ons, allein, mit Freunden oder auf deinem eigenen Server, öffentlich oder privat.'],
    [`<strong>Show it:</strong> videos, streams, screenshots and articles about Propwash are welcome. The <a href="${prefix}brand/">brand kit</a> has the logo, the colors and the rules for using them.`,
      `<strong>Zeigen:</strong> Videos, Streams, Screenshots und Artikel über Propwash sind willkommen. Das <a href="${prefix}brand/">Brand-Kit</a> hat das Logo, die Farben und die Regeln dazu.`],
    ['<strong>Modpacks:</strong> put the unchanged release files into a modpack (additional permission 1).',
      '<strong>Modpacks:</strong> Die unveränderten Release-Dateien in ein Modpack packen (Zusatzerlaubnis 1).'],
    ['<strong>Read and build the code:</strong> read it, build it yourself, change it for your own use and send pull requests.',
      '<strong>Code lesen und bauen:</strong> Lies ihn, bau ihn selbst, ändere ihn für dich und schick Pull Requests.'],
    [`<strong>Make add-ons:</strong> depend on Propwash, use the add-on API, add your own parts and use mixins with <code>@Shadow</code> signatures, following the <a href="${prefix}docs/api/#rules">rules for add-ons</a>.`,
      `<strong>Add-ons bauen:</strong> Von Propwash abhängen, die Add-on-API nutzen, eigene Teile hinzufügen und Mixins mit <code>@Shadow</code>-Signaturen verwenden, nach den <a href="${prefix}docs/api/#rules">Regeln für Add-ons</a>.`],
    ['<strong>Your own license for your own code:</strong> what you write yourself, you license as you like.',
      '<strong>Eigene Lizenz für eigenen Code:</strong> Was du selbst schreibst, lizenzierst du, wie du willst.'],
  ])}
`);

  const notAllowed = section('not-allowed', toc[2].title, `
${list([
    ['<strong>Copying core code</strong> of Propwash or an official add-on into your own add-on or mod.',
      '<strong>Kern-Code kopieren:</strong> Code von Propwash oder einem offiziellen Add-on in dein eigenes Add-on oder deine Mod übernehmen.'],
    ['<strong>Shipping Propwash or Just More Parts inside your own jar:</strong> players install them next to your add-on, from CurseForge or Modrinth.',
      '<strong>Propwash oder Just More Parts in dein eigenes Jar packen:</strong> Spieler installieren sie neben deinem Add-on, von CurseForge oder Modrinth.'],
    ['<strong>Publishing a fork as your own mod</strong>, re-uploading the release files as an alternative download, or building a competing drone mod from the code. That is the “Shield” in PolyForm Shield, and it also counts when the competing mod is free.',
      '<strong>Einen Fork als eigene Mod veröffentlichen</strong>, die Release-Dateien als alternativen Download neu hochladen oder aus dem Code eine konkurrierende Drohnen-Mod bauen. Das ist das „Shield“ in PolyForm Shield, und es gilt auch, wenn die konkurrierende Mod kostenlos ist.'],
    ['<strong>Using the namespace <code>propwash</code></strong> or the Java package <code>de.lardtom.propwash</code> for your own things: they are reserved for Propwash. Resource packs and data packs may still replace Propwash’s existing assets and data.',
      '<strong>Den Namensraum <code>propwash</code></strong> oder das Java-Paket <code>de.lardtom.propwash</code> für eigene Dinge nutzen: Sie sind für Propwash reserviert. Ressourcen- und Datenpakete dürfen die vorhandenen Assets und Daten von Propwash trotzdem ersetzen.'],
  ])}
`);

  const notice = section('notice', toc[3].title, `
${P('If you pass on any part of a project, for example in a modpack, pass on its <code>LICENSE</code>, <code>LICENSE-MIT</code> and <code>NOTICE</code> with it, or their web addresses, including the line', 'Gibst du einen Teil eines Projekts weiter, etwa in einem Modpack, gib seine <code>LICENSE</code>, <code>LICENSE-MIT</code> und <code>NOTICE</code> mit, oder ihre Webadressen, samt der Zeile')}
${code('Required Notice: Copyright (c) 2026 lardtom', 'text')}
${P('Modpack platforms usually show the license of every mod in a pack; naming the project and lardtom as its author keeps the credit where it belongs.',
    'Modpack-Plattformen zeigen meist die Lizenz jeder Mod im Pack; nennst du das Projekt und lardtom als Autor, bleibt die Anerkennung, wo sie hingehört.')}
`);

  const permissions = section('permissions', toc[4].title, `
${P('On top of the PolyForm Shield License, every project grants these permissions. They only add rights and never take any away.',
    'Zusätzlich zur PolyForm Shield License gibt jedes Projekt diese Erlaubnisse. Sie geben nur Rechte dazu und nehmen nie welche weg.')}
${PERMISSIONS.map((p) => `${h3(`permission-${p.id}`, `${p.number}. ${p.title.en}`, `${p.number}. ${p.title.de}`)}
${P(p.text.en, p.text.de)}`).join('\n')}
`);

  const rows = PROJECTS.map((p) => `<li>${L(`<strong>${p.name}:</strong> core under PolyForm Shield 1.0.0 with the additional permissions, ${p.mit.en} under MIT; ${p.since.en}.`,
    `<strong>${p.name}:</strong> Kern unter PolyForm Shield 1.0.0 mit den Zusatzerlaubnissen, ${p.mit.de} unter MIT; ${p.since.de}.`)}</li>`).join('\n');
  const projects = section('projects', toc[5].title, `
<ul>
${rows}
</ul>
`);

  const files = (p) => ['LICENSE', 'LICENSE-MIT', 'NOTICE'].map((f) => `<a href="${SOURCES[p.key]}/blob/main/${f}" ${ext}><code>${f}</code></a>`).join(' · ');
  const binding = section('binding', toc[6].title, `
${P('These texts are what counts. If this page and a license text ever say something different, the license text is right.',
    'Diese Texte zählen. Sagen diese Seite und ein Lizenztext einmal etwas anderes, hat der Lizenztext recht.')}
<ul>
${PROJECTS.map((p) => `<li>${p.name}: ${files(p)}</li>`).join('\n')}
</ul>
${P(`The full PolyForm Shield License 1.0.0 is also at <a href="${SHIELD}" ${ext}>polyformproject.org</a>. Questions about the license? Ask on the <a href="https://discord.gg/bNhkSXYSgZ" ${ext}>Discord</a>.`,
    `Die vollständige PolyForm Shield License 1.0.0 steht auch auf <a href="${SHIELD}" ${ext}>polyformproject.org</a>. Fragen zur Lizenz? Frag auf dem <a href="https://discord.gg/bNhkSXYSgZ" ${ext}>Discord</a>.`)}
`);

  return {
    id: 'license',
    title: { en: 'License in plain words · Propwash FPV docs', de: 'Lizenz in klaren Worten · Propwash-FPV-Doku' },
    description: {
      en: 'What the licenses of Propwash FPV and its official add-ons allow: playing, servers, videos, modpacks and add-ons, what is not allowed, the Required Notice and the exit clause.',
      de: 'Was die Lizenzen von Propwash FPV und seinen offiziellen Add-ons erlauben: Spielen, Server, Videos, Modpacks und Add-ons, was nicht erlaubt ist, die Required Notice und die Ausstiegsklausel.',
    },
    kicker: L('Docs · License', 'Doku · Lizenz'),
    heading: { en: 'The license in plain words', de: 'Die Lizenz in klaren Worten' },
    lead: {
      en: 'What you may do with Propwash FPV and its official add-ons, and what not. For players, server owners, video makers, modpack makers and add-on authors.',
      de: 'Was du mit Propwash FPV und seinen offiziellen Add-ons machen darfst und was nicht. Für Spieler, Server-Betreiber, Video-Macher, Modpack-Bauer und Add-on-Autoren.',
    },
    toc,
    body: [short, allowed, notAllowed, notice, permissions, projects, binding].join('\n'),
  };
}
