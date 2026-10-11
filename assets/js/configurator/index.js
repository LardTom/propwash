// Configurator core: one import for the page scripts.
//
//   import { loadCatalog, sharecode } from './configurator/index.js';
//   const catalog = await loadCatalog();
//   catalog.check(build); catalog.analyze(build); catalog.defaultTune(build);
//   const code = catalog.encode({ build, paint, tune, name }); const result = catalog.decode(code);

export { loadCatalog, createCatalog, localText, langKey, CATEGORIES, CATALOG_URL } from './data.js?v=d51a314a';
export * as sharecode from './sharecode.js?v=f703cd12';
export * as rules from './rules.js?v=147e54d1';
export * as analysis from './analysis.js?v=11771e54';
export * as tune from './tune.js?v=f4084d0e';
export * as tuning from './tuning.js?v=1700c67a';
