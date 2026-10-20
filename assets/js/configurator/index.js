// Configurator core: one import for the page scripts.
//
//   import { loadCatalog, sharecode } from './configurator/index.js';
//   const catalog = await loadCatalog();
//   catalog.check(build); catalog.analyze(build); catalog.defaultTune(build);
//   const code = catalog.encode({ build, paint, tune, name }); const result = catalog.decode(code);

export { loadCatalog, createCatalog, localText, langKey, CATEGORIES, CATALOG_URL } from './data.js?v=1dd0de36';
export * as sharecode from './sharecode.js?v=594888f1';
export * as rules from './rules.js?v=147e54d1';
export * as analysis from './analysis.js?v=b089a0c4';
export * as tune from './tune.js?v=f4084d0e';
export * as tuning from './tuning.js?v=ddb9460a';
