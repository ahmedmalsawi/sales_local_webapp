/* Golden Cala Sales Analytics - Excel import & parsing */
(function(){
  'use strict';
  const GC = window.GC || (window.GC = {});
  const toISODate = GC.toISODate;
  const toISODateTime = GC.toISODateTime;

  function libsStatus(){
    return {
      hasXLSX: typeof window.XLSX !== 'undefined',
      hasChart: typeof window.Chart !== 'undefined'
    };
  }

  function detectFileType(jsonRows){
    const sample = jsonRows?.[0] || {};
    const keys = Object.keys(sample);
    if(keys.includes('Refund') || keys.includes('Company')) return 'refund';
    if(keys.includes('Invoice') && keys.includes('Customer')) return 'invoice';
    for(const r of (jsonRows||[])){
      if('Refund' in r) return 'refund';
      if('Invoice' in r) return 'invoice';
    }
    return 'unknown';
  }

  function parseStoreHeader(str){
    if(!str) return null;
    const m = String(str).match(/Store\s*:\s*([0-9]+)\s*-\s*(.+)$/i);
    if(!m) return null;
    return { branchId: Number(m[1]), branchName: String(m[2]).trim() };
  }

  function normalizeNumber(v){
    if(v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function normalizeText(v, fallback=''){
    if(v === null || v === undefined) return fallback;
    const s = String(v).trim();
    return s ? s : fallback;
  }

  function buildInvoiceRecords(jsonRows, sourceFileName){
    let currentBranch = {branchId:null, branchName:null};
    const out = [];
    for(const row of jsonRows){
      const invVal = row['Invoice'];

      if(typeof invVal === 'string' && invVal.includes('Store')){
        const b = parseStoreHeader(invVal);
        if(b) currentBranch = b;
        continue;
      }

      if(invVal === null || invVal === undefined || invVal === '') continue;
      const invNo = String(invVal).replace(/\.0$/, '').trim();
      if(!/^\d+$/.test(invNo)) continue;

      const businessDate = toISODate(row['Business Date']);
      const createDate = toISODateTime(row['Create Date']);

      const docType = 'invoice';
      const docNo = invNo;
      const key = `${docType}|${currentBranch.branchId}|${docNo}`;

      out.push({
        key,
        docType,
        docNo,
        invoiceNo: docNo,
        refundNo: null,

        branchId: currentBranch.branchId,
        branchName: currentBranch.branchName,

        customer: normalizeText(row['Customer'], '(غير محدد)'),
        mobile: normalizeText(row['Mobile'], ''),
        sales: normalizeText(row['Sales'], '(غير محدد)'),

        qty: normalizeNumber(row['Qty']),
        amount: normalizeNumber(row['Amount']),
        discount: normalizeNumber(row['Discount']),
        tax: normalizeNumber(row['Tax']),
        paidAmount: normalizeNumber(row['Paid Amount']),

        status: normalizeText(row['Status'], ''),
        refunded: normalizeText(row['Refunded'], ''),
        type: normalizeText(row['Type'], ''),
        noteLog: normalizeText(row['Note Log'], ''),
        createUser: normalizeText(row['Create User'], ''),
        businessDate,
        createDate,

        sourceFileName: sourceFileName || '',
        importedAt: new Date().toISOString()
      });
    }
    return out;
  }

  function buildRefundRecords(jsonRows, sourceFileName){
    let currentBranch = {branchId:null, branchName:null};
    const out = [];
    for(const row of jsonRows){
      const comp = row['Company'];
      if(typeof comp === 'string' && comp.includes('Store')){
        const b = parseStoreHeader(comp);
        if(b) currentBranch = b;
        continue;
      }

      const refVal = row['Refund'];
      if(refVal === null || refVal === undefined || refVal === '') continue;
      const refNo = String(refVal).replace(/\.0$/, '').trim();
      if(!/^\d+$/.test(refNo)) continue;

      const invVal = row['Invoice'];
      const invoiceNo = (invVal === null || invVal === undefined || invVal === '') ? null : String(invVal).replace(/\.0$/, '').trim();

      const businessDate = toISODate(row['Business Date']);
      const createDate = toISODateTime(row['Create Date']);

      const docType = 'refund';
      const docNo = refNo;
      const key = `${docType}|${currentBranch.branchId}|${docNo}`;

      out.push({
        key,
        docType,
        docNo,
        invoiceNo,
        refundNo: docNo,

        branchId: currentBranch.branchId,
        branchName: currentBranch.branchName,

        customer: normalizeText(row['Customer'], '(غير محدد)'),
        mobile: '',
        sales: normalizeText(row['Sales'], '(غير محدد)'),

        qty: normalizeNumber(row['Qty']),
        amount: normalizeNumber(row['Amount']),
        discount: normalizeNumber(row['Discount']),
        tax: normalizeNumber(row['Tax']),
        paidAmount: normalizeNumber(row['Paid Amount']),

        status: '',
        refunded: '',
        type: '',
        noteLog: '',
        createUser: normalizeText(row['Create User'], ''),
        businessDate,
        createDate,

        sourceFileName: sourceFileName || '',
        importedAt: new Date().toISOString()
      });
    }
    return out;
  }

  async function parseExcelFile(file){
    if(!libsStatus().hasXLSX){
      throw new Error('XLSX library not loaded. Please open the app with internet access (CDN).');
    }

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: null });

    const type = detectFileType(jsonRows);
    let records = [];
    if(type === 'invoice') records = buildInvoiceRecords(jsonRows, file.name);
    else if(type === 'refund') records = buildRefundRecords(jsonRows, file.name);
    else throw new Error(`Unknown file format: ${file.name}`);

    const totalRows = jsonRows.length;
    const parsedRows = records.length;
    const validationSummary = totalRows > 0 ? { totalRows, parsedRows, skipped: totalRows - parsedRows } : null;
    return { type, jsonRows, records, validationSummary };
  }

  GC.excel = GC.excel || {};
  GC.excel.libsStatus = libsStatus;
  GC.excel.detectFileType = detectFileType;
  GC.excel.parseStoreHeader = parseStoreHeader;
  GC.excel.normalizeNumber = normalizeNumber;
  GC.excel.normalizeText = normalizeText;
  GC.excel.buildInvoiceRecords = buildInvoiceRecords;
  GC.excel.buildRefundRecords = buildRefundRecords;
  GC.excel.parseExcelFile = parseExcelFile;
})();
