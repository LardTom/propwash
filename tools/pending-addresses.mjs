// External addresses that only answer once a release is published (tools/test-links.mjs marks them “after
// publishing”, tools/test-go-live.mjs checks the list): the public source repositories of Propwash and its official
// add-ons, and every CurseForge or Modrinth page of assets/data/platforms.json that is not live yet (a project in
// review may not be public; Modrinth releases the projects one by one, so their pages stay pending until
// node tools/go-live.mjs modrinth … switches them).

export const SOURCE_REPOSITORIES = [
  'https://github.com/LardTom/propwash-fpv',
  'https://github.com/LardTom/propwash-justmoreparts',
  'https://github.com/LardTom/propwash-camera-drones',
  'https://github.com/LardTom/propwash-mob-defense',
];

/** The pending addresses for the given platforms.json. */
export function pendingAddresses(platforms) {
  const pages = [];
  for (const product of Object.values((platforms && platforms.products) || {})) {
    for (const key of ['curseforge', 'modrinth']) {
      const p = product[key];
      if (p && p.url && p.status !== 'live') pages.push(p.url);
    }
  }
  return [...SOURCE_REPOSITORIES, ...pages];
}
