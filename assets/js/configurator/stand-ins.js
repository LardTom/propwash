// Textures of Minecraft itself that an add-on's model uses and no web export or jar carries (Minecraft's own
// textures are not part of any mod and are not shipped by this site). The 3D view draws such faces with a texture of
// its own instead, drawn for this site in the size of the original: catalog-build.js (add-on jars) and
// tools/build-configurator-models.mjs (web export) put it into the model file and name it in "stand_ins".
//
// minecraft:block/dispenser_front – the front plate of Mob Defense's dispenser mount: grey stone with a dark opening.

export const STAND_INS = Object.freeze({
  'assets/minecraft/textures/block/dispenser_front.png': Object.freeze({
    id: 'minecraft:block/dispenser_front',
    png: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAwUlEQVR42qVSyw3FIAzrCEzQKZiBE2dm4MgADMDWPJnKlQOor3rv4CbKxzVJjpRS/wcHPq21nnMegF9rHbaUMnzE1TIfQrgI5mY2kgRAnpZ1N4EWsQlWff0z4zeByosxPoIERgFlgwRF3vstSMAfLgpAgqLzPLtzzgAx5PR5Zogc3FsCo0DX+I1A17us8a0CqlieoAp2QI612zVyiE/QeZkZzEczn+98neYJvDK9ffqM6/S3a9QmvTYl1hswa4TzKz6BtxNbswmMmQAAAABJRU5ErkJggg==',
  }),
});

/** The stand-in of a texture path (assets/<ns>/textures/….png) as {id, png (base64)}, or null. */
export function standIn(rel) {
  return Object.prototype.hasOwnProperty.call(STAND_INS, rel) ? STAND_INS[rel] : null;
}
