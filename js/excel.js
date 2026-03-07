/* Golden Cala Sales Analytics - Excel import & parsing */
(function(){
  'use strict';
  const GC = window.GC || (window.GC = {});
  const toISODate = GC.toISODate;
  const toISODateTime = GC.toISODateTime;

  /** Default Excel header names per field (internal key -> default column name in file) */
  const DEFAULT_INVOICE_MAP = {
    Invoice: 'Invoice',
    'Business Date': 'Business Date',
    'Create Date': 'Create Date',
    Customer: 'Customer',
    Mobile: 'Mobile',
    Sales: 'Sales',
    Qty: 'Qty',
    Amount: 'Amount',
    Discount: 'Discount',
    Tax: 'Tax',
    Status: 'Status',
    'Paid Amount': 'Paid Amount',
    Refunded: 'Refunded',
    'Note Log': 'Note Log',
    'Create User': 'Create User',
    Type: 'Type',
    'Branch Name': 'Branch Name',
    'Branch ID': 'Branch ID'
  };
  const DEFAULT_REFUND_MAP = {
    Company: 'Company',
    Refund: 'Refund',
    Invoice: 'Invoice',
    Customer: 'Customer',
    Sales: 'Sales',
    Qty: 'Qty',
    Amount: 'Amount',
    Discount: 'Discount',
    Tax: 'Tax',
    'Paid Amount': 'Paid Amount',
    'Business Date': 'Business Date',
    'Create User': 'Create User',
    'Create Date': 'Create Date',
    'Branch Name': 'Branch Name',
    'Branch ID': 'Branch ID'
  };

  /** Combined file: one sheet with both Invoice and Refund rows; column "Invoice / refund" (or Type) indicates which. */
  const DEFAULT_COMBINED_MAP = {
    'Doc Type': 'Invoice / refund',
    Invoice: 'Invoice',
    Refund: 'Refund',
    'Business Date': 'Business Date',
    'Create Date': 'Create Date',
    Customer: 'Customer',
    Mobile: 'Mobile',
    Sales: 'Sales',
    Qty: 'Qty',
    Amount: 'Amount',
    Discount: 'Discount',
    Tax: 'Tax',
    Status: 'Status',
    'Paid Amount': 'Paid Amount',
    Refunded: 'Refunded',
    'Note Log': 'Note Log',
    'Create User': 'Create User',
    Type: 'Type',
    Company: 'Company',
    'Branch Name': 'Branch Name',
    'Branch ID': 'Branch ID'
  };

  /** Field definitions for mapping UI: invoice */
  function getInvoiceFields(){
    return [
      { key: 'Invoice', labelAr: 'رقم الفاتورة / Store', labelEn: 'Invoice', required: true },
      { key: 'Business Date', labelAr: 'تاريخ العمل', labelEn: 'Business Date', required: true },
      { key: 'Create Date', labelAr: 'تاريخ الإنشاء', labelEn: 'Create Date', required: false },
      { key: 'Customer', labelAr: 'العميل', labelEn: 'Customer', required: false },
      { key: 'Mobile', labelAr: 'الجوال', labelEn: 'Mobile', required: false },
      { key: 'Sales', labelAr: 'الموظف / المبيعات', labelEn: 'Sales', required: false },
      { key: 'Qty', labelAr: 'الكمية', labelEn: 'Qty', required: false },
      { key: 'Amount', labelAr: 'المبلغ', labelEn: 'Amount', required: false },
      { key: 'Discount', labelAr: 'الخصم', labelEn: 'Discount', required: false },
      { key: 'Tax', labelAr: 'الضريبة', labelEn: 'Tax', required: false },
      { key: 'Status', labelAr: 'الحالة', labelEn: 'Status', required: false },
      { key: 'Paid Amount', labelAr: 'المدفوع', labelEn: 'Paid Amount', required: false },
      { key: 'Refunded', labelAr: 'مرتجع', labelEn: 'Refunded', required: false },
      { key: 'Note Log', labelAr: 'ملاحظات', labelEn: 'Note Log', required: false },
      { key: 'Create User', labelAr: 'المستخدم', labelEn: 'Create User', required: false },
      { key: 'Type', labelAr: 'النوع', labelEn: 'Type', required: false },
      { key: 'Branch Name', labelAr: 'اسم الفرع (عمود)', labelEn: 'Branch Name', required: false },
      { key: 'Branch ID', labelAr: 'رقم الفرع (عمود)', labelEn: 'Branch ID', required: false }
    ];
  }
  /** Field definitions for mapping UI: refund */
  function getRefundFields(){
    return [
      { key: 'Company', labelAr: 'الشركة / Store', labelEn: 'Company', required: true },
      { key: 'Refund', labelAr: 'رقم المرتجع', labelEn: 'Refund', required: true },
      { key: 'Invoice', labelAr: 'رقم الفاتورة', labelEn: 'Invoice', required: false },
      { key: 'Business Date', labelAr: 'تاريخ العمل', labelEn: 'Business Date', required: true },
      { key: 'Create Date', labelAr: 'تاريخ الإنشاء', labelEn: 'Create Date', required: false },
      { key: 'Customer', labelAr: 'العميل', labelEn: 'Customer', required: false },
      { key: 'Sales', labelAr: 'الموظف', labelEn: 'Sales', required: false },
      { key: 'Qty', labelAr: 'الكمية', labelEn: 'Qty', required: false },
      { key: 'Amount', labelAr: 'المبلغ', labelEn: 'Amount', required: false },
      { key: 'Discount', labelAr: 'الخصم', labelEn: 'Discount', required: false },
      { key: 'Tax', labelAr: 'الضريبة', labelEn: 'Tax', required: false },
      { key: 'Paid Amount', labelAr: 'المدفوع', labelEn: 'Paid Amount', required: false },
      { key: 'Create User', labelAr: 'المستخدم', labelEn: 'Create User', required: false },
      { key: 'Branch Name', labelAr: 'اسم الفرع (عمود)', labelEn: 'Branch Name', required: false },
      { key: 'Branch ID', labelAr: 'رقم الفرع (عمود)', labelEn: 'Branch ID', required: false }
    ];
  }

  function getDefaultColumnMap(fileType){
    if(fileType === 'refund') return { ...DEFAULT_REFUND_MAP };
    if(fileType === 'combined') return { ...DEFAULT_COMBINED_MAP };
    return { ...DEFAULT_INVOICE_MAP };
  }

  /** Field definitions for mapping UI: combined (Invoice + Refund in one file) */
  function getCombinedFields(){
    return [
      { key: 'Doc Type', labelAr: 'نوع السجل (Invoice / Refund)', labelEn: 'Invoice / refund', required: true },
      { key: 'Invoice', labelAr: 'رقم الفاتورة / Store', labelEn: 'Invoice', required: true },
      { key: 'Refund', labelAr: 'رقم المرتجع', labelEn: 'Refund', required: false },
      { key: 'Business Date', labelAr: 'تاريخ العمل', labelEn: 'Business Date', required: true },
      { key: 'Create Date', labelAr: 'تاريخ الإنشاء', labelEn: 'Create Date', required: false },
      { key: 'Customer', labelAr: 'العميل', labelEn: 'Customer', required: false },
      { key: 'Mobile', labelAr: 'الجوال', labelEn: 'Mobile', required: false },
      { key: 'Sales', labelAr: 'الموظف', labelEn: 'Sales', required: false },
      { key: 'Qty', labelAr: 'الكمية', labelEn: 'Qty', required: false },
      { key: 'Amount', labelAr: 'المبلغ', labelEn: 'Amount', required: false },
      { key: 'Discount', labelAr: 'الخصم', labelEn: 'Discount', required: false },
      { key: 'Tax', labelAr: 'الضريبة', labelEn: 'Tax', required: false },
      { key: 'Status', labelAr: 'الحالة', labelEn: 'Status', required: false },
      { key: 'Paid Amount', labelAr: 'المدفوع', labelEn: 'Paid Amount', required: false },
      { key: 'Refunded', labelAr: 'مرتجع', labelEn: 'Refunded', required: false },
      { key: 'Note Log', labelAr: 'ملاحظات', labelEn: 'Note Log', required: false },
      { key: 'Create User', labelAr: 'المستخدم', labelEn: 'Create User', required: false },
      { key: 'Type', labelAr: 'النوع', labelEn: 'Type', required: false },
      { key: 'Company', labelAr: 'الشركة / Store', labelEn: 'Company', required: false },
      { key: 'Branch Name', labelAr: 'اسم الفرع (عمود)', labelEn: 'Branch Name', required: false },
      { key: 'Branch ID', labelAr: 'رقم الفرع (عمود)', labelEn: 'Branch ID', required: false }
    ];
  }

  /** Get list of column names from the first row of parsed JSON */
  function getFileColumnsFromJson(jsonRows){
    if(!jsonRows || !jsonRows.length) return [];
    const keys = Object.keys(jsonRows[0] || {});
    return keys.filter(k => k != null && String(k).trim() !== '');
  }

  /** Get value from row using column map: internal field -> file column name */
  function rowVal(row, internalKey, columnMap, defaultCol){
    const col = (columnMap && columnMap[internalKey] != null && columnMap[internalKey] !== '') ? columnMap[internalKey] : (defaultCol || internalKey);
    return row[col];
  }

  function libsStatus(){
    return {
      hasXLSX: typeof window.XLSX !== 'undefined',
      hasChart: typeof window.Chart !== 'undefined'
    };
  }

  /** Check if a string means "Refund" (مرتجع, Refund, Return, etc.) */
  function isRefundTypeVal(val){
    if(val == null || val === '') return false;
    return /refund|مرتجع|return|استرجاع/i.test(String(val).trim());
  }
  /** Check if a string means "Invoice" (فاتورة, Invoice, etc.) */
  function isInvoiceTypeVal(val){
    if(val == null || val === '') return false;
    return /invoice|فاتورة|فاتوره/i.test(String(val).trim());
  }

  /**
   * Detect file type: combined (both in one file) vs refund vs invoice.
   * Combined: has a column like "Invoice / refund" or "Type" with both Invoice and Refund values per row.
   */
  function detectFileType(jsonRows){
    const sample = jsonRows?.[0] || {};
    const keys = Object.keys(sample);
    const typeCol = keys.find(k => /invoice\s*\/\s*refund|^(type|document\s*type|doc\s*type|نوع)$/i.test(String(k).trim()));
    if(typeCol && jsonRows && jsonRows.length > 0){
      const values = jsonRows.map(r => r[typeCol]);
      const hasRefund = values.some(v => isRefundTypeVal(v));
      const hasInvoice = values.some(v => isInvoiceTypeVal(v));
      if(hasRefund && hasInvoice) return 'combined';
    }
    if(keys.includes('Refund')) return 'refund';
    if(keys.includes('Invoice') && keys.includes('Customer')) return 'invoice';
    for(const r of (jsonRows||[])){
      if(r && 'Refund' in r && (r['Refund'] != null && r['Refund'] !== '')) return 'refund';
      if(r && 'Invoice' in r && (r['Invoice'] != null && r['Invoice'] !== '')) return 'invoice';
    }
    return 'unknown';
  }

  /** Parse branch header: "Store : 1 - Name", "Company : 1 - Name", or "Branch : 1 - Name" (refund exports often use Company/Branch). */
  function parseStoreHeader(str){
    if(!str) return null;
    const m = String(str).match(/(?:Store|Company|Branch)\s*:\s*([0-9]+)\s*-\s*(.+)$/i);
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

  /**
   * Resolve branch for one row: if the file has Branch Name and/or Branch ID columns, use them; otherwise use currentBranch (from header row).
   * Branch Name column may contain "فرع الرياض" or "1 - فرع الرياض" (id - name).
   */
  function resolveBranchForRow(row, get, currentBranch){
    const branchNameVal = get(row, 'Branch Name');
    const branchIdVal = get(row, 'Branch ID');
    const hasBranchCol = (branchNameVal != null && String(branchNameVal).trim() !== '') || (branchIdVal != null && String(branchIdVal).trim() !== '');
    if(!hasBranchCol) return currentBranch;
    let branchId = null;
    let branchName = null;
    const nameStr = String(branchNameVal || '').trim();
    const idStr = String(branchIdVal || '').trim();
    if(idStr !== ''){
      const n = Number(idStr);
      branchId = isNaN(n) ? null : n;
    }
    if(nameStr !== ''){
      const m = nameStr.match(/^([0-9]+)\s*-\s*(.+)$/);
      if(m){
        if(branchId == null) branchId = Number(m[1]);
        branchName = String(m[2]).trim();
      } else {
        branchName = nameStr;
      }
    }
    return {
      branchId: branchId != null ? branchId : currentBranch.branchId,
      branchName: branchName || currentBranch.branchName || '(غير محدد)'
    };
  }

  /**
   * Build invoice records only. Treated differently from refunds:
   * - Branch header row is in "Invoice" column (value like "Store : 1 - Name"); data rows have numeric Invoice number.
   * - Refund files use "Company" for branch header and "Refund" for document number.
   * - defaultBranch: optional { branchId, branchName } for manual linking when row has no branch from file.
   */
  function buildInvoiceRecords(jsonRows, sourceFileName, columnMap, defaultBranch){
    const def = getDefaultColumnMap('invoice');
    const get = (row, k) => rowVal(row, k, columnMap, def[k]);
    let currentBranch = {branchId:null, branchName:null};
    const out = [];
    for(const row of jsonRows){
      const invVal = get(row, 'Invoice');
      if(typeof invVal === 'string' && (invVal.includes('Store') || invVal.includes('Company') || invVal.includes('Branch'))){
        const b = parseStoreHeader(invVal);
        if(b){ currentBranch = b; continue; }
      }

      if(invVal === null || invVal === undefined || invVal === '') continue;
      const invNo = String(invVal).replace(/\.0$/, '').trim();
      if(!/^\d+$/.test(invNo)) continue;

      const businessDate = toISODate(get(row, 'Business Date'));
      if (!businessDate) continue;
      const createDate = toISODateTime(get(row, 'Create Date'));

      let branch = resolveBranchForRow(row, get, currentBranch);
      if(defaultBranch && (branch.branchId == null && (!branch.branchName || branch.branchName === '(غير محدد)'))) branch = defaultBranch;
      const docType = 'invoice';
      const docNo = invNo;
      const key = `${docType}|${branch.branchId}|${docNo}`;

      out.push({
        key,
        docType,
        docNo,
        invoiceNo: docNo,
        refundNo: null,

        branchId: branch.branchId,
        branchName: branch.branchName,

        customer: normalizeText(get(row, 'Customer'), '(غير محدد)'),
        mobile: normalizeText(get(row, 'Mobile'), ''),
        sales: normalizeText(get(row, 'Sales'), '(غير محدد)'),

        qty: normalizeNumber(get(row, 'Qty')),
        amount: normalizeNumber(get(row, 'Amount')),
        discount: normalizeNumber(get(row, 'Discount')),
        tax: normalizeNumber(get(row, 'Tax')),
        paidAmount: normalizeNumber(get(row, 'Paid Amount')),

        status: normalizeText(get(row, 'Status'), ''),
        refunded: normalizeText(get(row, 'Refunded'), ''),
        type: normalizeText(get(row, 'Type'), ''),
        noteLog: normalizeText(get(row, 'Note Log'), ''),
        createUser: normalizeText(get(row, 'Create User'), ''),
        businessDate,
        createDate,

        sourceFileName: sourceFileName || '',
        importedAt: new Date().toISOString()
      });
    }
    return out;
  }

  /**
   * Build refund (return) records only. Treated differently from invoices:
   * - Branch header is in "Company" column (often "Company : 1 - Name" or "Store : 1 - Name"), not "Invoice".
   * - Document number comes from "Refund" column; "Invoice" column is the linked original invoice.
   * - defaultBranch: optional for manual branch linking when row has no branch from file.
   */
  function buildRefundRecords(jsonRows, sourceFileName, columnMap, defaultBranch){
    const def = getDefaultColumnMap('refund');
    const get = (row, k) => rowVal(row, k, columnMap, def[k]);
    let currentBranch = {branchId:null, branchName:null};
    const out = [];
    for(const row of jsonRows){
      const comp = get(row, 'Company');
      const isBranchHeader = typeof comp === 'string' && (comp.includes('Store') || comp.includes('Company') || comp.includes('Branch'));
      if(isBranchHeader){
        const b = parseStoreHeader(comp);
        if(b){ currentBranch = b; continue; }
      }

      const refVal = get(row, 'Refund');
      if(refVal === null || refVal === undefined || refVal === '') continue;
      const refNo = String(refVal).replace(/\.0$/, '').trim();
      if(!/^\d+$/.test(refNo)) continue;

      const invVal = get(row, 'Invoice');
      const invoiceNo = (invVal === null || invVal === undefined || invVal === '') ? null : String(invVal).replace(/\.0$/, '').trim();

      const businessDate = toISODate(get(row, 'Business Date'));
      if (!businessDate) continue;
      const createDate = toISODateTime(get(row, 'Create Date'));

      let branch = resolveBranchForRow(row, get, currentBranch);
      if(defaultBranch && (branch.branchId == null && (!branch.branchName || branch.branchName === '(غير محدد)'))) branch = defaultBranch;
      const docType = 'refund';
      const docNo = refNo;
      const key = `${docType}|${branch.branchId}|${docNo}`;

      out.push({
        key,
        docType,
        docNo,
        invoiceNo,
        refundNo: docNo,

        branchId: branch.branchId,
        branchName: branch.branchName,

        customer: normalizeText(get(row, 'Customer'), '(غير محدد)'),
        mobile: '',
        sales: normalizeText(get(row, 'Sales'), '(غير محدد)'),

        qty: normalizeNumber(get(row, 'Qty')),
        amount: normalizeNumber(get(row, 'Amount')),
        discount: normalizeNumber(get(row, 'Discount')),
        tax: normalizeNumber(get(row, 'Tax')),
        paidAmount: normalizeNumber(get(row, 'Paid Amount')),

        status: '',
        refunded: '',
        type: '',
        noteLog: '',
        createUser: normalizeText(get(row, 'Create User'), ''),
        businessDate,
        createDate,

        sourceFileName: sourceFileName || '',
        importedAt: new Date().toISOString()
      });
    }
    return out;
  }

  /**
   * Build records from a combined file: one sheet with both Invoice and Refund rows.
   * Column "Doc Type" (e.g. "Invoice / refund") indicates per row: Invoice or Refund.
   * Branch header can be in Invoice or Company column (Store : X - Name / Company : X - Name).
   * defaultBranch: optional for manual branch linking when row has no branch from file.
   */
  function buildCombinedRecords(jsonRows, sourceFileName, columnMap, defaultBranch){
    const def = getDefaultColumnMap('combined');
    const get = (row, k) => rowVal(row, k, columnMap, def[k]);
    let currentBranch = { branchId: null, branchName: null };
    const out = [];
    for(const row of jsonRows){
      const docTypeVal = get(row, 'Doc Type');
      const invVal = get(row, 'Invoice');
      const compVal = get(row, 'Company');

      const invStr = typeof invVal === 'string' && (invVal.includes('Store') || invVal.includes('Company') || invVal.includes('Branch'));
      const compStr = typeof compVal === 'string' && (compVal.includes('Store') || compVal.includes('Company') || compVal.includes('Branch'));
      const branchHeader = invStr ? parseStoreHeader(invVal) : (compStr ? parseStoreHeader(compVal) : null);
      if(branchHeader){
        currentBranch = branchHeader;
        continue;
      }

      const isRefund = isRefundTypeVal(docTypeVal);
      const businessDate = toISODate(get(row, 'Business Date'));
      if(!businessDate) continue;

      const createDate = toISODateTime(get(row, 'Create Date'));
      let branch = resolveBranchForRow(row, get, currentBranch);
      if(defaultBranch && (branch.branchId == null && (!branch.branchName || branch.branchName === '(غير محدد)'))) branch = defaultBranch;

      if(isRefund){
        const refVal = get(row, 'Refund');
        if(refVal === null || refVal === undefined || refVal === '') continue;
        const refNo = String(refVal).replace(/\.0$/, '').trim();
        if(!/^\d+$/.test(refNo)) continue;
        const invNoVal = get(row, 'Invoice');
        const invoiceNo = (invNoVal == null || invNoVal === '') ? null : String(invNoVal).replace(/\.0$/, '').trim();
        const key = `refund|${branch.branchId}|${refNo}`;
        out.push({
          key,
          docType: 'refund',
          docNo: refNo,
          invoiceNo,
          refundNo: refNo,
          branchId: branch.branchId,
          branchName: branch.branchName,
          customer: normalizeText(get(row, 'Customer'), '(غير محدد)'),
          mobile: '',
          sales: normalizeText(get(row, 'Sales'), '(غير محدد)'),
          qty: normalizeNumber(get(row, 'Qty')),
          amount: normalizeNumber(get(row, 'Amount')),
          discount: normalizeNumber(get(row, 'Discount')),
          tax: normalizeNumber(get(row, 'Tax')),
          paidAmount: normalizeNumber(get(row, 'Paid Amount')),
          status: '',
          refunded: '',
          type: '',
          noteLog: '',
          createUser: normalizeText(get(row, 'Create User'), ''),
          businessDate,
          createDate,
          sourceFileName: sourceFileName || '',
          importedAt: new Date().toISOString()
        });
      } else {
        if(invVal === null || invVal === undefined || invVal === '') continue;
        const invNo = String(invVal).replace(/\.0$/, '').trim();
        if(!/^\d+$/.test(invNo)) continue;
        const key = `invoice|${branch.branchId}|${invNo}`;
        out.push({
          key,
          docType: 'invoice',
          docNo: invNo,
          invoiceNo: invNo,
          refundNo: null,
          branchId: branch.branchId,
          branchName: branch.branchName,
          customer: normalizeText(get(row, 'Customer'), '(غير محدد)'),
          mobile: normalizeText(get(row, 'Mobile'), ''),
          sales: normalizeText(get(row, 'Sales'), '(غير محدد)'),
          qty: normalizeNumber(get(row, 'Qty')),
          amount: normalizeNumber(get(row, 'Amount')),
          discount: normalizeNumber(get(row, 'Discount')),
          tax: normalizeNumber(get(row, 'Tax')),
          paidAmount: normalizeNumber(get(row, 'Paid Amount')),
          status: normalizeText(get(row, 'Status'), ''),
          refunded: normalizeText(get(row, 'Refunded'), ''),
          type: normalizeText(get(row, 'Type'), ''),
          noteLog: normalizeText(get(row, 'Note Log'), ''),
          createUser: normalizeText(get(row, 'Create User'), ''),
          businessDate,
          createDate,
          sourceFileName: sourceFileName || '',
          importedAt: new Date().toISOString()
        });
      }
    }
    return out;
  }

  /** Read file and return raw json rows + metadata (no record building). For mapping UI. */
  async function readExcelPreview(file){
    if(!libsStatus().hasXLSX) throw new Error('XLSX library not loaded.');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: null });
    const fileColumns = getFileColumnsFromJson(jsonRows);
    const detectedType = detectFileType(jsonRows);
    return { file, jsonRows, fileColumns, detectedType };
  }

  async function parseExcelFile(file, options){
    if(!libsStatus().hasXLSX){
      throw new Error('XLSX library not loaded. Please open the app with internet access (CDN).');
    }

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: null });

    const type = (options && options.fileType) || detectFileType(jsonRows);
    const columnMap = (options && options.columnMap) || null;
    const defaultBranch = (options && options.defaultBranch) || null;
    let records = [];
    if(type === 'invoice') records = buildInvoiceRecords(jsonRows, file.name, columnMap, defaultBranch);
    else if(type === 'refund') records = buildRefundRecords(jsonRows, file.name, columnMap, defaultBranch);
    else if(type === 'combined') records = buildCombinedRecords(jsonRows, file.name, columnMap, defaultBranch);
    else throw new Error(`Unknown file format: ${file.name}. حدد نوع الملف (فواتير / مرتجعات / مختلط) أو تأكد من أسماء الأعمدة.`);

    const totalRows = jsonRows.length;
    const parsedRows = records.length;
    const validationSummary = totalRows > 0 ? { totalRows, parsedRows, skipped: totalRows - parsedRows } : null;
    return { type, jsonRows, records, validationSummary };
  }

  /** Build default mapping: for each field, use file column that matches default name if present */
  function buildDefaultMappingFromFileColumns(fileType, fileColumns){
    const def = getDefaultColumnMap(fileType);
    const map = {};
    for(const key of Object.keys(def)){
      const defaultCol = def[key];
      if(fileColumns.includes(defaultCol)) map[key] = defaultCol;
      else map[key] = '';
    }
    return map;
  }

  GC.excel = GC.excel || {};
  GC.excel.libsStatus = libsStatus;
  GC.excel.detectFileType = detectFileType;
  GC.excel.parseStoreHeader = parseStoreHeader;
  GC.excel.normalizeNumber = normalizeNumber;
  GC.excel.normalizeText = normalizeText;
  GC.excel.getInvoiceFields = getInvoiceFields;
  GC.excel.getRefundFields = getRefundFields;
  GC.excel.getCombinedFields = getCombinedFields;
  GC.excel.isRefundTypeVal = isRefundTypeVal;
  GC.excel.isInvoiceTypeVal = isInvoiceTypeVal;
  GC.excel.getDefaultColumnMap = getDefaultColumnMap;
  GC.excel.getFileColumnsFromJson = getFileColumnsFromJson;
  GC.excel.buildDefaultMappingFromFileColumns = buildDefaultMappingFromFileColumns;
  GC.excel.readExcelPreview = readExcelPreview;
  GC.excel.buildInvoiceRecords = buildInvoiceRecords;
  GC.excel.buildRefundRecords = buildRefundRecords;
  GC.excel.buildCombinedRecords = buildCombinedRecords;
  GC.excel.parseExcelFile = parseExcelFile;
})();
