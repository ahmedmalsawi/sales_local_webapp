/* Golden Cala - App shared refs (load first) */
(function(){
  'use strict';
  var GC = window.GC || {};
  window.GC = GC;

  var $ = GC.$ || (function(sel){ return document.querySelector(sel); });
  var $$ = GC.$$ || (function(sel){ return Array.from(document.querySelectorAll(sel)); });
  var fmtNumber = GC.fmtNumber || (function(x){ return Number(x||0).toLocaleString('en-US',{maximumFractionDigits:2}); });
  var fmtMoney = GC.fmtMoney || fmtNumber;
  var fmtPercent = GC.fmtPercent || (function(r){ return r==null||r===undefined||isNaN(Number(r)) ? '' : (Number(r)*100).toFixed(1)+'%'; });
  var toISODate = GC.toISODate || (function(d){ if(!d) return null; var dd=new Date(d); return isNaN(dd) ? null : dd.toISOString().slice(0,10); });
  var toISODateTime = GC.toISODateTime || (function(d){ if(!d) return null; var dd=new Date(d); return isNaN(dd) ? null : dd.toISOString(); });
  var showAlert = GC.showAlert || (function(){});
  var showLoadingState = GC.showLoadingState || (function(){});
  var withLoadingSpinner = GC.withLoadingSpinner || (function(_,fn){ return fn ? fn() : Promise.resolve(); });
  var animatePageTransition = GC.animatePageTransition || (function(_,fn){ return fn ? fn() : Promise.resolve(); });
  var downloadBlob = GC.downloadBlob || (function(){});
  var downloadText = GC.downloadText || (function(){});
  var loadScript = GC.loadScript || (function(){ return Promise.resolve(); });
  var toCSV = GC.toCSV || (function(){ return ''; });
  var groupBy = GC.groupBy || (function(){ return {}; });
  var monthKeyFromISODate = GC.monthKeyFromISODate || (function(){ return ''; });

  var AUTH = (GC.auth && GC.auth.AUTH) ? GC.auth.AUTH : null;
  var idbGetAll = (GC.db && GC.db.idbGetAll) ? GC.db.idbGetAll : (function(){ return Promise.resolve([]); });
  var idbClearStore = (GC.db && GC.db.idbClearStore) ? GC.db.idbClearStore : (function(){ return Promise.resolve(); });
  var wipeAll = (GC.db && GC.db.wipeAll) ? GC.db.wipeAll : (function(){ return Promise.resolve(); });
  var upsertBranchesFromRecords = (GC.db && GC.db.upsertBranchesFromRecords) ? GC.db.upsertBranchesFromRecords : (function(){ return Promise.resolve(); });
  var addManyTransactions = (GC.db && GC.db.addManyTransactions) ? GC.db.addManyTransactions : (function(){ return Promise.resolve({inserted:0,skipped:0,errors:0}); });
  var getDb = (GC.db && GC.db.getDb) ? GC.db.getDb : (function(){ return null; });

  var _excel = GC.excel || {};
  var _core = GC.core || {};
  var libsStatus = _excel.libsStatus || (function(){ return { hasXLSX: false, hasChart: false }; });
  var parseExcelFile = _excel.parseExcelFile || (function(){ return Promise.resolve({ records: [], fileType: 'invoice' }); });
  var readExcelPreview = _excel.readExcelPreview || (function(){ return Promise.resolve([]); });
  var getInvoiceFields = _excel.getInvoiceFields || (function(){ return []; });
  var getRefundFields = _excel.getRefundFields || (function(){ return []; });
  var getCombinedFields = _excel.getCombinedFields || (function(){ return []; });
  var buildDefaultMappingFromFileColumns = _excel.buildDefaultMappingFromFileColumns || (function(){ return {}; });

  var txISODate = _core.txISODate || (function(){ return null; });
  var filterTransactions = _core.filterTransactions || (function(){ return []; });
  var netValue = _core.netValue || (function(){ return 0; });
  var computeKPIs = _core.computeKPIs || (function(){ return {}; });
  var aggByBranch = _core.aggByBranch || (function(){ return []; });
  var aggRefundRateByBranch = _core.aggRefundRateByBranch || (function(){ return []; });
  var aggBySalesperson = _core.aggBySalesperson || (function(){ return []; });
  var aggDailyDetails = _core.aggDailyDetails || (function(){ return []; });
  var aggMonthly = _core.aggMonthly || (function(){ return []; });
  var aggTopCustomers = _core.aggTopCustomers || (function(){ return []; });
  var aggBestSalesByBranch = _core.aggBestSalesByBranch || (function(){ return []; });
  var buildAlerts = _core.buildAlerts || (function(){ return []; });

  window.APP = window.APP || {};
  Object.assign(window.APP, {
    GC: GC,
    $: $,
    $$: $$,
    fmtNumber: fmtNumber,
    fmtMoney: fmtMoney,
    fmtPercent: fmtPercent,
    toISODate: toISODate,
    toISODateTime: toISODateTime,
    showAlert: showAlert,
    showLoadingState: showLoadingState,
    withLoadingSpinner: withLoadingSpinner,
    animatePageTransition: animatePageTransition,
    downloadBlob: downloadBlob,
    downloadText: downloadText,
    loadScript: loadScript,
    toCSV: toCSV,
    groupBy: groupBy,
    monthKeyFromISODate: monthKeyFromISODate,
    AUTH: AUTH,
    idbGetAll: idbGetAll,
    idbClearStore: idbClearStore,
    wipeAll: wipeAll,
    upsertBranchesFromRecords: upsertBranchesFromRecords,
    addManyTransactions: addManyTransactions,
    getDb: getDb,
    libsStatus: libsStatus,
    parseExcelFile: parseExcelFile,
    readExcelPreview: readExcelPreview,
    getInvoiceFields: getInvoiceFields,
    getRefundFields: getRefundFields,
    getCombinedFields: getCombinedFields,
    buildDefaultMappingFromFileColumns: buildDefaultMappingFromFileColumns,
    txISODate: txISODate,
    filterTransactions: filterTransactions,
    netValue: netValue,
    computeKPIs: computeKPIs,
    aggByBranch: aggByBranch,
    aggRefundRateByBranch: aggRefundRateByBranch,
    aggBySalesperson: aggBySalesperson,
    aggDailyDetails: aggDailyDetails,
    aggMonthly: aggMonthly,
    aggTopCustomers: aggTopCustomers,
    aggBestSalesByBranch: aggBestSalesByBranch,
    buildAlerts: buildAlerts
  });
})();
