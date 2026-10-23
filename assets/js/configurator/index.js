// Configurator core: one import for the page scripts.
//
//   import { loadCatalog, sharecode } from './configurator/index.js';
//   const catalog = await loadCatalog();
//   catalog.check(build); catalog.analyze(build); catalog.defaultTune(build);
//   const code = catalog.encode({ build, paint, tune, name }); const result = catalog.decode(code);

export { loadCatalog, createCatalog, localText, langKey, CATEGORIES, CATALOG_URL } from './data.js?v=82113fee';
export * as sharecode from './sharecode.js?v=594888f1';
export * as rules from './rules.js?v=c16cd6c9';
export * as analysis from './analysis.js?v=94cae39b';
export * as tune from './tune.js?v=f4084d0e';
export * as tuning from './tuning.js?v=87906fc9';
