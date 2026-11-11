// Configurator core: one import for the page scripts.
//
//   import { loadCatalog, sharecode } from './configurator/index.js';
//   const catalog = await loadCatalog();
//   catalog.check(build); catalog.analyze(build); catalog.defaultTune(build);
//   const code = catalog.encode({ build, paint, tune, name }); const result = catalog.decode(code);

export { loadCatalog, createCatalog, localText, langKey, CATEGORIES, CATALOG_URL } from './data.js?v=e9c7448c';
export * as sharecode from './sharecode.js?v=024bd980';
export * as rules from './rules.js?v=26a8eb49';
export * as analysis from './analysis.js?v=293f859b';
export * as tune from './tune.js?v=f4084d0e';
export * as tuning from './tuning.js?v=f228e891';
