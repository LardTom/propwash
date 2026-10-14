// Configurator core: one import for the page scripts.
//
//   import { loadCatalog, sharecode } from './configurator/index.js';
//   const catalog = await loadCatalog();
//   catalog.check(build); catalog.analyze(build); catalog.defaultTune(build);
//   const code = catalog.encode({ build, paint, tune, name }); const result = catalog.decode(code);

export { loadCatalog, createCatalog, localText, langKey, CATEGORIES, CATALOG_URL } from './data.js?v=29a0a695';
export * as sharecode from './sharecode.js?v=ff46f4e6';
export * as rules from './rules.js?v=147e54d1';
export * as analysis from './analysis.js?v=2f177e4b';
export * as tune from './tune.js?v=f4084d0e';
export * as tuning from './tuning.js?v=7cb226f7';
