// Configurator core: one import for the page scripts.
//
//   import { loadCatalog, sharecode } from './configurator/index.js';
//   const catalog = await loadCatalog();
//   catalog.check(build); catalog.analyze(build); catalog.defaultTune(build);
//   const code = catalog.encode({ build, paint, tune, name }); const result = catalog.decode(code);

export { loadCatalog, createCatalog, localText, langKey, CATEGORIES, CATALOG_URL } from './data.js?v=90ab1168';
export * as sharecode from './sharecode.js?v=024bd980';
export * as rules from './rules.js?v=6634f777';
export * as analysis from './analysis.js?v=373b0553';
export * as tune from './tune.js?v=f4084d0e';
export * as tuning from './tuning.js?v=22940b30';
