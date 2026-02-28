/* Sales Local Web App
   - Stores data locally using IndexedDB
   - Imports Excel files (XLSX via CDN)
   - Generates dashboard & reports
*/

(function(){
  'use strict';

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function fmtNumber(x){
    const n = Number(x || 0);
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function fmtMoney(x){ return fmtNumber(x); }

  function toISODate(d){
    if(!d) return null;
    if(d instanceof Date && !isNaN(d)) return d.toISOString().slice(0,10);
    // try parse string
    const dd = new Date(d);
    if(!isNaN(dd)) return dd.toISOString().slice(0,10);
    return null;
  }
  function toISODateTime(d){
    if(!d) return null;
    if(d instanceof Date && !isNaN(d)) return d.toISOString();
    const dd = new Date(d);
    if(!isNaN(dd)) return dd.toISOString();
    return null;
  }

  function showAlert(type, msg, timeoutMs=5000){
    const host = $('#globalAlertHost');
    const id = 'a'+Math.random().toString(16).slice(2);
    const div = document.createElement('div');
    div.className = `alert alert-${type} alert-dismissible fade show`;
    div.id = id;
    div.innerHTML = `
      <div class="small">${msg}</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    host.appendChild(div);
    if(timeoutMs){
      setTimeout(()=>{ 
        const el = document.getElementById(id);
        if(el) el.classList.remove('show');
        setTimeout(()=>el?.remove(), 300);
      }, timeoutMs);
    }
  }

  function downloadText(filename, content, mime='text/plain;charset=utf-8'){
    const blob = new Blob([content], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function toCSV(rows, headers){
    const esc = (v) => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      if(/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
      return s;
    };
    const lines = [];
    lines.push(headers.map(esc).join(','));
    for(const r of rows){
      lines.push(headers.map(h => esc(r[h])).join(','));
    }
    return lines.join('\n');
  }

  function groupBy(arr, keyFn){
    const m = new Map();
    for(const x of arr){
      const k = keyFn(x);
      if(!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  }

  // ---------------------------
  // Local Auth (Optional)
  // ---------------------------
  const AUTH = {
    enabled(){
      return localStorage.getItem('auth_enabled') === '1';
    },
    setEnabled(v){
      localStorage.setItem('auth_enabled', v ? '1' : '0');
    },
    hasUser(){
      return !!localStorage.getItem('auth_user') && !!localStorage.getItem('auth_hash');
    },
    async hash(pass){
      const enc = new TextEncoder().encode(pass);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    },
    async setUser(user, pass){
      localStorage.setItem('auth_user', user);
      localStorage.setItem('auth_hash', await AUTH.hash(pass));
    },
    async check(user, pass){
      const u = localStorage.getItem('auth_user');
      const h = localStorage.getItem('auth_hash');
      if(!u || !h) return false;
      if(u !== user) return false;
      const hh = await AUTH.hash(pass);
      return hh === h;
    },
    logout(){
      sessionStorage.removeItem('auth_ok');
    },
    setLoggedIn(){
      sessionStorage.setItem('auth_ok','1');
    },
    isLoggedIn(){
      return sessionStorage.getItem('auth_ok') === '1';
    },
    reset(){
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_hash');
      sessionStorage.removeItem('auth_ok');
    }
  };

  // ---------------------------
  // IndexedDB
  // ---------------------------
  const DB_NAME = 'sales_local_db';
  const DB_VERSION = 1;
  let db = null;

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = req.result;
        if(!d.objectStoreNames.contains('transactions')){
          const os = d.createObjectStore('transactions', { keyPath: 'key' });
          os.createIndex('branchId', 'branchId', { unique:false });
          os.createIndex('docType', 'docType', { unique:false });
          os.createIndex('businessDate', 'businessDate', { unique:false });
          os.createIndex('docNo', 'docNo', { unique:false });
          os.createIndex('sales', 'sales', { unique:false });
        }
        if(!d.objectStoreNames.contains('branches')){
          d.createObjectStore('branches', { keyPath: 'branchId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbInit(){
    db = await openDB();
  }

  function idbTx(storeName, mode='readonly'){
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function idbGetAll(storeName){
    return new Promise((resolve, reject) => {
      const req = idbTx(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function idbClearStore(storeName){
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const os = tx.objectStore(storeName);
      const req = os.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function wipeAll(){
    await Promise.all([
      idbClearStore('transactions'),
      idbClearStore('branches')
    ]);
  }

  async function upsertBranchesFromRecords(records){
    const branches = new Map();
    for(const r of records){
      if(r.branchId != null){
        branches.set(r.branchId, { branchId: r.branchId, branchName: r.branchName || `Branch ${r.branchId}` });
      }
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('branches', 'readwrite');
      const os = tx.objectStore('branches');
      for(const b of branches.values()){
        os.put(b);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function addManyTransactions(records, onProgress){
    if(!records.length) return {inserted:0, skipped:0, errors:0};
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      const os = tx.objectStore('transactions');

      let inserted = 0, skipped = 0, errors = 0, done = 0;

      function step(){
        done += 1;
        if(onProgress) onProgress(done, records.length);
      }

      for(const rec of records){
        const req = os.add(rec);
        req.onsuccess = () => { inserted++; step(); };
        req.onerror = (ev) => {
          if(req.error && req.error.name === 'ConstraintError'){
            skipped++; 
            ev.preventDefault(); // keep transaction going
            step();
          }else{
            errors++;
            ev.preventDefault();
            step();
          }
        };
      }

      tx.oncomplete = () => resolve({inserted, skipped, errors});
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------------------------
  // Excel Importer (SheetJS)
  // ---------------------------
  function libsStatus(){
    return {
      hasXLSX: typeof window.XLSX !== 'undefined',
      hasChart: typeof window.Chart !== 'undefined'
    };
  }

  function detectFileType(jsonRows){
    // invoices have "Invoice" column; refunds have "Refund" and "Company"
    const sample = jsonRows?.[0] || {};
    const keys = Object.keys(sample);
    if(keys.includes('Refund') || keys.includes('Company')) return 'refund';
    if(keys.includes('Invoice') && keys.includes('Customer')) return 'invoice';
    // fallback: if any row has Refund
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

      // meta/header row: "Company : ..., Store : X-Name"
      if(typeof invVal === 'string' && invVal.includes('Store')){
        const b = parseStoreHeader(invVal);
        if(b) currentBranch = b;
        continue;
      }

      // invoice row must have invoice number
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

      // meta/header row: "Store : X-Name"
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
        mobile: '', // refund file doesn't have Mobile column
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
    // returns {type, rows, records}
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

    return { type, jsonRows, records };
  }

  // ---------------------------
  // Reporting / Aggregation
  // ---------------------------
  function filterTransactions(all, fromISO, toISO, branchId, docType){
    return all.filter(t => {
      const d = t.businessDate || (t.createDate ? t.createDate.slice(0,10) : null);
      if(fromISO && d && d < fromISO) return false;
      if(toISO && d && d > toISO) return false;
      if(branchId && branchId !== 'all' && String(t.branchId) !== String(branchId)) return false;
      if(docType && docType !== 'all' && t.docType !== docType) return false;
      return true;
    });
  }

  function netValue(t){
    // invoices = +paidAmount, refunds = -paidAmount
    const v = Number(t.paidAmount || 0);
    return t.docType === 'refund' ? -v : v;
  }

  function computeKPIs(list){
    const invoices = list.filter(x => x.docType === 'invoice');
    const refunds  = list.filter(x => x.docType === 'refund');

    const invPaid = invoices.reduce((s,x)=>s+Number(x.paidAmount||0),0);
    const refPaid = refunds.reduce((s,x)=>s+Number(x.paidAmount||0),0);

    const invGross = invoices.reduce((s,x)=>s+Number(x.amount||0),0);
    const refGross = refunds.reduce((s,x)=>s+Number(x.amount||0),0);

    const invDisc = invoices.reduce((s,x)=>s+Number(x.discount||0),0);
    const refDisc = refunds.reduce((s,x)=>s+Number(x.discount||0),0);

    const qtyInv = invoices.reduce((s,x)=>s+Number(x.qty||0),0);
    const qtyRef = refunds.reduce((s,x)=>s+Number(x.qty||0),0);

    const net = invPaid - refPaid;
    const txCount = list.length;
    const invCount = invoices.length;
    const refCount = refunds.length;
    const avgTicket = invCount ? (invPaid / invCount) : 0;

    return {
      invPaid, refPaid, net,
      invGross, refGross,
      invDisc, refDisc,
      qtyInv, qtyRef,
      txCount, invCount, refCount,
      avgTicket
    };
  }

  function aggByBranch(list){
    const g = groupBy(list, t => `${t.branchId||''}|${t.branchName||''}`);
    const out = [];
    for(const [k, items] of g){
      const [branchId, branchName] = k.split('|');
      const inv = items.filter(x=>x.docType==='invoice');
      const ref = items.filter(x=>x.docType==='refund');
      const invPaid = inv.reduce((s,x)=>s+Number(x.paidAmount||0),0);
      const refPaid = ref.reduce((s,x)=>s+Number(x.paidAmount||0),0);
      out.push({
        branchId: branchId || '',
        branchName: branchName || '(غير محدد)',
        net: invPaid - refPaid,
        invoicesPaid: invPaid,
        refundsPaid: refPaid,
        invoicesCount: inv.length,
        refundsCount: ref.length
      });
    }
    out.sort((a,b)=>b.net-a.net);
    return out;
  }

  function aggBySalesperson(list){
    const g = groupBy(list, t => t.sales || '(غير محدد)');
    const out = [];
    for(const [sales, items] of g){
      const inv = items.filter(x=>x.docType==='invoice');
      const ref = items.filter(x=>x.docType==='refund');
      const invPaid = inv.reduce((s,x)=>s+Number(x.paidAmount||0),0);
      const refPaid = ref.reduce((s,x)=>s+Number(x.paidAmount||0),0);
      out.push({
        sales,
        net: invPaid - refPaid,
        invoicesPaid: invPaid,
        refundsPaid: refPaid,
        txCount: items.length
      });
    }
    out.sort((a,b)=>b.net-a.net);
    return out;
  }

  function aggDailyNet(list){
    const map = new Map();
    for(const t of list){
      const d = t.businessDate || (t.createDate ? t.createDate.slice(0,10) : null);
      if(!d) continue;
      map.set(d, (map.get(d)||0) + netValue(t));
    }
    const out = Array.from(map.entries()).map(([date, net]) => ({date, net}));
    out.sort((a,b)=>a.date.localeCompare(b.date));
    return out;
  }

  // ---------------------------
  // UI Rendering
  // ---------------------------
  function setActiveNav(page){
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.getAttribute('data-nav') === page));
    $$('.page').forEach(s => s.classList.toggle('d-none', s.id !== `page-${page}`));
  }

  function fillBranchSelect(selectEl, branches){
    selectEl.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'كل الفروع';
    selectEl.appendChild(optAll);

    for(const b of branches.sort((a,b)=>Number(a.branchId)-Number(b.branchId))){
      const o = document.createElement('option');
      o.value = String(b.branchId);
      o.textContent = `${b.branchId} - ${b.branchName}`;
      selectEl.appendChild(o);
    }
  }

  function renderDashCards(k){
    const host = $('#dashCards');
    host.innerHTML = '';
    const cards = [
      {title:'صافي المبيعات', value: fmtMoney(k.net)},
      {title:'إجمالي فواتير (Paid)', value: fmtMoney(k.invPaid)},
      {title:'إجمالي مرتجعات (Paid)', value: fmtMoney(k.refPaid)},
      {title:'عدد الفواتير', value: fmtNumber(k.invCount)},
      {title:'عدد المرتجعات', value: fmtNumber(k.refCount)},
      {title:'متوسط الفاتورة', value: fmtMoney(k.avgTicket)},
      {title:'إجمالي الخصم (فواتير)', value: fmtMoney(k.invDisc)},
      {title:'إجمالي الكمية (فواتير)', value: fmtNumber(k.qtyInv)},
    ];
    for(const c of cards){
      const col = document.createElement('div');
      col.className = 'col-12 col-sm-6 col-lg-3';
      col.innerHTML = `
        <div class="card kpi-card p-3">
          <div class="kpi-title">${c.title}</div>
          <div class="kpi-value">${c.value}</div>
        </div>
      `;
      host.appendChild(col);
    }
  }

  let chartDaily = null;
  let chartBranches = null;

  function renderDailyChart(daily){
    const can = $('#chartDaily');
    const fb = $('#chartDailyFallback');
    if(!libsStatus().hasChart){
      fb.style.display = '';
      return;
    }
    fb.style.display = 'none';

    const labels = daily.map(x=>x.date);
    const data = daily.map(x=>x.net);

    if(chartDaily) chartDaily.destroy();
    chartDaily = new Chart(can, {
      type: 'line',
      data: { labels, datasets: [{ label: 'صافي', data }] },
      options: {
        responsive: true,
        plugins: { legend: { display: true } },
        scales: { y: { ticks: { callback: (v)=>fmtMoney(v) } } }
      }
    });
  }

  function renderBranchChart(byBranch){
    const can = $('#chartBranches');
    const fb = $('#chartBranchesFallback');
    if(!libsStatus().hasChart){
      fb.style.display = '';
      return;
    }
    fb.style.display = 'none';

    const top = byBranch.slice(0,6);
    const labels = top.map(x=>`${x.branchId}-${x.branchName}`);
    const data = top.map(x=>x.net);

    if(chartBranches) chartBranches.destroy();
    chartBranches = new Chart(can, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'صافي', data }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: (v)=>fmtMoney(v) } } }
      }
    });
  }

  function renderTopBranchesTable(byBranch){
    const tbody = $('#tblTopBranches tbody');
    tbody.innerHTML = '';
    for(const x of byBranch.slice(0,10)){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.branchId} - ${x.branchName}</td>
        <td class="text-nowrap">${fmtMoney(x.net)}</td>
        <td class="text-nowrap">${fmtNumber(x.invoicesCount)}</td>
        <td class="text-nowrap">${fmtNumber(x.refundsCount)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderTableByBranch(byBranch){
    const tbody = $('#tblByBranch tbody');
    tbody.innerHTML = '';
    for(const x of byBranch){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.branchId} - ${x.branchName}</td>
        <td class="text-nowrap fw-bold">${fmtMoney(x.net)}</td>
        <td class="text-nowrap">${fmtMoney(x.invoicesPaid)}</td>
        <td class="text-nowrap">${fmtMoney(x.refundsPaid)}</td>
        <td class="text-nowrap">${fmtNumber(x.invoicesCount)}</td>
        <td class="text-nowrap">${fmtNumber(x.refundsCount)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderTableBySalesperson(bySales){
    const tbody = $('#tblBySalesperson tbody');
    tbody.innerHTML = '';
    for(const x of bySales){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.sales}</td>
        <td class="text-nowrap fw-bold">${fmtMoney(x.net)}</td>
        <td class="text-nowrap">${fmtMoney(x.invoicesPaid)}</td>
        <td class="text-nowrap">${fmtMoney(x.refundsPaid)}</td>
        <td class="text-nowrap">${fmtNumber(x.txCount)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  const TX_COLUMNS = [
    {key:'docType', label:'نوع'},
    {key:'docNo', label:'رقم'},
    {key:'branchId', label:'فرع#'},
    {key:'branchName', label:'الفرع'},
    {key:'businessDate', label:'تاريخ العمل'},
    {key:'customer', label:'العميل'},
    {key:'sales', label:'Sales'},
    {key:'qty', label:'Qty'},
    {key:'amount', label:'Amount'},
    {key:'discount', label:'Discount'},
    {key:'paidAmount', label:'Paid'},
    {key:'sourceFileName', label:'المصدر'},
  ];

  function renderTransactionsTable(list){
    const thead = $('#tblTransactions thead');
    const tbody = $('#tblTransactions tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const trh = document.createElement('tr');
    for(const c of TX_COLUMNS){
      const th = document.createElement('th');
      th.textContent = c.label;
      trh.appendChild(th);
    }
    thead.appendChild(trh);

    for(const t of list){
      const tr = document.createElement('tr');
      for(const c of TX_COLUMNS){
        let v = t[c.key];
        if(['qty','amount','discount','paidAmount'].includes(c.key)) v = fmtNumber(v);
        if(c.key === 'docType') v = t.docType === 'invoice' ? 'فاتورة' : 'مرتجع';
        tr.appendChild(Object.assign(document.createElement('td'), {textContent: v ?? ''}));
      }
      tbody.appendChild(tr);
    }
  }

  function renderPreview(records){
    const tbl = $('#tblPreview');
    const thead = tbl.querySelector('thead');
    const tbody = tbl.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const cols = ['docType','docNo','branchId','branchName','businessDate','customer','sales','qty','amount','discount','paidAmount'];
    const trh = document.createElement('tr');
    for(const c of cols){
      const th = document.createElement('th');
      th.textContent = c;
      trh.appendChild(th);
    }
    thead.appendChild(trh);

    for(const r of records.slice(0,15)){
      const tr = document.createElement('tr');
      for(const c of cols){
        let v = r[c];
        if(['qty','amount','discount','paidAmount'].includes(c)) v = fmtNumber(v);
        tr.appendChild(Object.assign(document.createElement('td'), {textContent: v ?? ''}));
      }
      tbody.appendChild(tr);
    }
  }

  // ---------------------------
  // Page Actions
  // ---------------------------
  async function refreshBranchesUI(){
    const branches = await idbGetAll('branches');
    fillBranchSelect($('#dashBranch'), branches);
    fillBranchSelect($('#repBranch'), branches);
  }

  function setDefaultDateRange(allTx){
    const dates = allTx.map(t => t.businessDate).filter(Boolean).sort();
    if(!dates.length) return;
    const min = dates[0];
    const max = dates[dates.length-1];

    for(const id of ['dashFrom','repFrom']) if(!$('#'+id).value) $('#'+id).value = min;
    for(const id of ['dashTo','repTo']) if(!$('#'+id).value) $('#'+id).value = max;
  }

  async function refreshDashboard(){
    const all = await idbGetAll('transactions');
    setDefaultDateRange(all);
    const fromISO = $('#dashFrom').value || null;
    const toISO = $('#dashTo').value || null;
    const branchId = $('#dashBranch').value || 'all';

    const list = filterTransactions(all, fromISO, toISO, branchId, 'all');
    const k = computeKPIs(list);
    renderDashCards(k);

    const byBranch = aggByBranch(list);
    renderBranchChart(byBranch);
    renderTopBranchesTable(byBranch);

    const daily = aggDailyNet(list);
    renderDailyChart(daily);
  }

  async function runReports(){
    const all = await idbGetAll('transactions');

    const fromISO = $('#repFrom').value || null;
    const toISO = $('#repTo').value || null;
    const branchId = $('#repBranch').value || 'all';
    const docType = $('#repType').value || 'all';

    const list = filterTransactions(all, fromISO, toISO, branchId, docType);
    const byBranch = aggByBranch(list);
    const bySales = aggBySalesperson(list);

    renderTableByBranch(byBranch);
    renderTableBySalesperson(bySales);

    // transactions table with search
    const q = ($('#txtSearchTx').value || '').trim().toLowerCase();
    const filtered = q ? list.filter(t => {
      return [t.docNo, t.customer, t.branchName, t.sales, t.sourceFileName]
        .filter(Boolean).some(x => String(x).toLowerCase().includes(q));
    }) : list;

    // show last 500 to keep it fast
    const show = filtered.slice(0, 500);
    renderTransactionsTable(show);

    // store latest datasets for download buttons
    window.__latestReports = { list, byBranch, bySales, filtered };
  }

  function updateProgress(done, total){
    const p = total ? Math.round((done/total)*100) : 0;
    const bar = $('#importProgress');
    bar.style.width = `${p}%`;
    bar.textContent = `${p}%`;
    bar.parentElement.setAttribute('aria-valuenow', String(p));
  }

  async function doImport(){
    const input = $('#fileInput');
    const files = Array.from(input.files || []);
    if(!files.length){
      showAlert('warning','من فضلك اختَر ملف واحد على الأقل.');
      return;
    }
    updateProgress(0, 1);
    $('#importSummary').innerHTML = '';

    let totalInserted=0, totalSkipped=0, totalErrors=0;
    let previewRecords = [];

    for(let i=0;i<files.length;i++){
      const f = files[i];
      try{
        updateProgress(0, 1);
        const parsed = await parseExcelFile(f);
        if(!previewRecords.length) previewRecords = parsed.records;

        await upsertBranchesFromRecords(parsed.records);

        const res = await addManyTransactions(parsed.records, (done, tot)=>{
          // combine file-level progress into overall feel
          updateProgress(done, tot);
        });

        totalInserted += res.inserted;
        totalSkipped += res.skipped;
        totalErrors  += res.errors;

        showAlert('success', `تم استيراد "${f.name}" — جديد: ${res.inserted}, مكرر: ${res.skipped}, أخطاء: ${res.errors}`, 7000);
      }catch(err){
        console.error(err);
        showAlert('danger', `فشل استيراد "${f.name}": ${err.message || err}`);
      }
    }

    renderPreview(previewRecords);
    await refreshBranchesUI();
    await refreshDashboard();

    $('#importSummary').innerHTML = `
      <div class="alert alert-secondary">
        <div class="fw-bold">النتيجة النهائية</div>
        <div class="small">تمت إضافة <span class="fw-bold">${totalInserted}</span> سجل. تم تجاهل <span class="fw-bold">${totalSkipped}</span> سجل مكرر. أخطاء: <span class="fw-bold">${totalErrors}</span>.</div>
      </div>
    `;
    updateProgress(1,1);
  }

  // ---------------------------
  // Downloads
  // ---------------------------
  function downloadTemplateInfo(){
    const rows = [
      {fileType:'invoice', columns:'Invoice, Customer, Mobile, Sales, Qty, Amount, Discount, Tax, Status, Paid Amount, Business Date, Refunded, Note Log, Create User, Create Date, Type', notes:'Rows with "Company : ..., Store : X-Name" are treated as branch headers.'},
      {fileType:'refund', columns:'Company, Refund, Invoice, Customer, Sales, Qty, Amount, Discount, Tax, Paid Amount, Business Date, Create User, Create Date', notes:'Rows with "Store : X-Name" are treated as branch headers.'},
    ];
    const csv = toCSV(rows, ['fileType','columns','notes']);
    downloadText('excel_columns_guide.csv', csv, 'text/csv;charset=utf-8');
  }

  async function downloadDashCSV(){
    const all = await idbGetAll('transactions');
    const fromISO = $('#dashFrom').value || null;
    const toISO = $('#dashTo').value || null;
    const branchId = $('#dashBranch').value || 'all';
    const list = filterTransactions(all, fromISO, toISO, branchId, 'all');
    const k = computeKPIs(list);

    const rows = [{
      from: fromISO || '',
      to: toISO || '',
      branch: branchId,
      net_sales: k.net,
      invoices_paid: k.invPaid,
      refunds_paid: k.refPaid,
      invoices_count: k.invCount,
      refunds_count: k.refCount,
      avg_ticket: k.avgTicket,
      invoices_discount: k.invDisc,
      invoices_qty: k.qtyInv
    }];
    const csv = toCSV(rows, Object.keys(rows[0]));
    downloadText('dashboard_summary.csv', csv, 'text/csv;charset=utf-8');
  }

  function downloadReport(kind){
    const r = window.__latestReports;
    if(!r){
      showAlert('warning','اعمل "عرض" في التقارير الأول.');
      return;
    }
    if(kind === 'branch'){
      const rows = r.byBranch.map(x=>({
        branchId:x.branchId,
        branchName:x.branchName,
        net:x.net,
        invoicesPaid:x.invoicesPaid,
        refundsPaid:x.refundsPaid,
        invoicesCount:x.invoicesCount,
        refundsCount:x.refundsCount
      }));
      const csv = toCSV(rows, Object.keys(rows[0]||{a:1}));
      downloadText('report_by_branch.csv', csv, 'text/csv;charset=utf-8');
    }
    if(kind === 'salesperson'){
      const rows = r.bySales.map(x=>({
        sales:x.sales,
        net:x.net,
        invoicesPaid:x.invoicesPaid,
        refundsPaid:x.refundsPaid,
        txCount:x.txCount
      }));
      const csv = toCSV(rows, Object.keys(rows[0]||{a:1}));
      downloadText('report_by_salesperson.csv', csv, 'text/csv;charset=utf-8');
    }
    if(kind === 'transactions'){
      const rows = (r.filtered || r.list).map(t=>({
        docType:t.docType,
        docNo:t.docNo,
        branchId:t.branchId,
        branchName:t.branchName,
        businessDate:t.businessDate,
        customer:t.customer,
        sales:t.sales,
        qty:t.qty,
        amount:t.amount,
        discount:t.discount,
        paidAmount:t.paidAmount,
        sourceFileName:t.sourceFileName
      }));
      const csv = toCSV(rows, Object.keys(rows[0]||{a:1}));
      downloadText('transactions.csv', csv, 'text/csv;charset=utf-8');
    }
  }

  async function exportBackup(){
    const [txs, branches] = await Promise.all([idbGetAll('transactions'), idbGetAll('branches')]);
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      branches,
      transactions: txs
    };
    downloadText(`backup_sales_local_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
  }

  async function importBackupFile(file){
    const txt = await file.text();
    const payload = JSON.parse(txt);
    const txs = payload.transactions || [];
    const branches = payload.branches || [];

    // merge branches
    await new Promise((resolve, reject) => {
      const tx = db.transaction('branches', 'readwrite');
      const os = tx.objectStore('branches');
      for(const b of branches){
        if(b && b.branchId != null) os.put(b);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // merge transactions with duplicate check
    const res = await addManyTransactions(txs, null);
    showAlert('success', `تمت الاستعادة. جديد: ${res.inserted}, مكرر: ${res.skipped}, أخطاء: ${res.errors}`, 8000);
    await refreshBranchesUI();
    await refreshDashboard();
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function updateAuthButtons(){
    const loginBtn = $('#btnLogin');
    const logoutBtn = $('#btnLogout');

    if(!AUTH.enabled()){
      loginBtn.textContent = 'تسجيل الدخول (معطل)';
      logoutBtn.classList.add('d-none');
      return;
    }

    if(AUTH.isLoggedIn()){
      loginBtn.classList.add('d-none');
      logoutBtn.classList.remove('d-none');
    }else{
      loginBtn.classList.remove('d-none');
      loginBtn.textContent = 'تسجيل الدخول';
      logoutBtn.classList.add('d-none');
    }
  }

  function enforceAuth(){
    if(!AUTH.enabled()) return true;
    if(AUTH.isLoggedIn()) return true;
    // block navigation to pages other than settings until login
    setActiveNav('dashboard');
    showAlert('warning','من فضلك سجّل دخول الأول (أو عطّل تسجيل الدخول من الإعدادات).', 7000);
    return false;
  }

  async function boot(){
    await dbInit();

    // libs status badge
    const st = libsStatus();
    if(!st.hasXLSX || !st.hasChart) $('#badgeOfflineLib').classList.remove('d-none');

    // nav
    $$('[data-nav]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        const page = a.getAttribute('data-nav');
        if(page !== 'settings' && page !== 'dashboard' && !enforceAuth()) return;
        setActiveNav(page);
        if(page === 'dashboard') refreshDashboard();
      });
    });

    // auth settings init
    $('#chkAuthEnabled').checked = AUTH.enabled();
    $('#chkAuthEnabled').addEventListener('change', ()=>{
      AUTH.setEnabled($('#chkAuthEnabled').checked);
      if(!AUTH.enabled()){
        AUTH.logout();
      }
      updateAuthButtons();
      showAlert('info', AUTH.enabled() ? 'تم تفعيل تسجيل الدخول.' : 'تم تعطيل تسجيل الدخول.');
    });

    $('#btnResetAuth').addEventListener('click', ()=>{
      AUTH.reset();
      showAlert('info','تمت إعادة ضبط بيانات الدخول. افتح نافذة تسجيل الدخول لإنشاء بيانات جديدة.');
      updateAuthButtons();
    });

    // login modal
    const modal = new bootstrap.Modal($('#loginModal'));
    $('#btnLogin').addEventListener('click', ()=>{
      if(!AUTH.enabled()){
        showAlert('info','تسجيل الدخول معطل. يمكنك تفعيله من الإعدادات.');
        setActiveNav('settings');
        return;
      }
      $('#loginMsg').textContent = '';
      $('#loginUser').value = localStorage.getItem('auth_user') || '';
      $('#loginPass').value = '';
      modal.show();
    });

    $('#btnDoLogin').addEventListener('click', async ()=>{
      const user = ($('#loginUser').value || '').trim();
      const pass = $('#loginPass').value || '';
      const msg = $('#loginMsg');
      msg.className = 'small';
      msg.textContent = '';

      if(!user || !pass){
        msg.classList.add('text-danger');
        msg.textContent = 'اكتب اسم المستخدم وكلمة المرور.';
        return;
      }

      try{
        if(!AUTH.hasUser()){
          await AUTH.setUser(user, pass);
          AUTH.setLoggedIn();
          msg.classList.add('text-success');
          msg.textContent = 'تم إنشاء المستخدم محلياً وتم تسجيل الدخول.';
          updateAuthButtons();
          setTimeout(()=>modal.hide(), 600);
          return;
        }

        const ok = await AUTH.check(user, pass);
        if(ok){
          AUTH.setLoggedIn();
          msg.classList.add('text-success');
          msg.textContent = 'تم تسجيل الدخول.';
          updateAuthButtons();
          setTimeout(()=>modal.hide(), 400);
        }else{
          msg.classList.add('text-danger');
          msg.textContent = 'بيانات غير صحيحة.';
        }
      }catch(err){
        console.error(err);
        msg.classList.add('text-danger');
        msg.textContent = 'خطأ أثناء تسجيل الدخول.';
      }
    });

    $('#btnLogout').addEventListener('click', ()=>{
      AUTH.logout();
      updateAuthButtons();
      showAlert('info','تم تسجيل الخروج.');
    });

    // upload actions
    $('#btnImport').addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      doImport();
    });
    $('#btnClearFiles').addEventListener('click', ()=>{
      $('#fileInput').value = '';
      $('#importSummary').innerHTML = '';
      updateProgress(0,1);
    });
    $('#btnDownloadTemplateInfo').addEventListener('click', downloadTemplateInfo);

    // dashboard actions
    $('#btnRefreshDash').addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      refreshDashboard();
    });
    $('#btnDownloadDash').addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      downloadDashCSV();
    });

    // reports actions
    $('#btnRunReports').addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      runReports();
    });
    $('#txtSearchTx').addEventListener('input', ()=>{
      if(!enforceAuth()) return;
      // rerun with existing filters
      runReports();
    });

    $$('[data-dl]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(!enforceAuth()) return;
        downloadReport(btn.getAttribute('data-dl'));
      });
    });

    // data page: backup
    $('#btnExportBackup').addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      exportBackup();
    });
    $('#btnImportBackup').addEventListener('click', async ()=>{
      if(!enforceAuth()) return;
      const file = $('#backupInput').files?.[0];
      if(!file){
        showAlert('warning','اختَر ملف Backup .json');
        return;
      }
      try{
        await importBackupFile(file);
      }catch(err){
        console.error(err);
        showAlert('danger', 'فشل استعادة الـ Backup: ' + (err.message||err));
      }
    });

    // wipe all
    $('#btnWipeAll').addEventListener('click', async ()=>{
      if(!enforceAuth()) return;
      if(!confirm('تأكيد: حذف كل البيانات المحلية؟')) return;
      await wipeAll();
      showAlert('success','تم حذف البيانات.');
      await refreshBranchesUI();
      await refreshDashboard();
    });

    // init
    await refreshBranchesUI();
    updateAuthButtons();

    const all = await idbGetAll('transactions');
    setDefaultDateRange(all);
    await refreshDashboard();

    // default page
    setActiveNav('dashboard');

    // default auth enabled ON (first run)
    if(localStorage.getItem('auth_enabled') === null){
      AUTH.setEnabled(true);
      $('#chkAuthEnabled').checked = true;
    }
    updateAuthButtons();
  }

  window.addEventListener('load', ()=>{
    boot().catch(err=>{
      console.error(err);
      showAlert('danger','تعذر تشغيل التطبيق: ' + (err.message||err), 10000);
    });
  });

})();
