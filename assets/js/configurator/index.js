// Configurator core: one import for the page scripts.
//
//   import { loadCatalog, sharecode } from './configurator/index.js';
//   const catalog = await loadCatalog();
//   catalog.check(build); catalog.analyze(build); catalog.defaultTune(build);
//   const code = catalog.encode({ build, paint, tune, name }); const result = catalog.decode(code);

export { loadCatalog, createCatalog, localText, langKey, CATEGORIES, CATALOG_URL } from './data.js?v=f1d2acbd';
export * as sharecode from './sharecode.js?v=024bd980';
export * as rules from './rules.js?v=6634f777';
export * as analysis from './analysis.js?v=f3f32120';
export * as tune from './tune.js?v=f4084d0e';
export * as tuning from './tuning.js?v=1ff606c1';
