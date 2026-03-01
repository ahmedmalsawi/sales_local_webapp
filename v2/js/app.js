/* Sales Local Web App
   - Stores data locally using IndexedDB
   - Imports Excel files (XLSX via CDN)
   - Generates dashboard & reports (CSV + XLSX)
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
  function fmtPercent(r){
    if(r === null || r === undefined || isNaN(Number(r))) return '';
    return (Number(r) * 100).toFixed(1) + '%';
  }

  function toISODate(d){
    if(!d) return null;
    if(d instanceof Date && !isNaN(d)) return d.toISOString().slice(0,10);
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
    if(!host) return;
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

  /* Premium UX Helpers */
  function showLoadingState(element, show=true){
    if(!element) return;
    if(show){
      element.setAttribute('data-loading', '1');
      element.disabled = true;
    } else {
      element.removeAttribute('data-loading');
      element.disabled = false;
    }
  }

  function withLoadingSpinner(element, fn){
    return async function(...args){
      showLoadingState(element, true);
      try {
        return await fn(...args);
      } finally {
        showLoadingState(element, false);
      }
    };
  }

  function animatePageTransition(page){
    const pageEls = $$('.page');
    for(const el of pageEls){
      if(el.id === `page-${page}`){
        el.classList.remove('d-none');
        el.offsetHeight; // force reflow
        el.style.animation = 'fadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1)';
      } else {
        el.classList.add('d-none');
      }
    }
  }

  function downloadBlob(filename, blob){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadText(filename, content, mime='text/plain;charset=utf-8'){
    downloadBlob(filename, new Blob([content], {type:mime}));
  }

  function loadScript(src){
    return new Promise((resolve, reject)=>{
      if(document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
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

  function monthKeyFromISODate(iso){
    if(!iso || typeof iso !== 'string') return null;
    // YYYY-MM-DD
    if(iso.length >= 7) return iso.slice(0,7);
    return null;
  }

  // ---------------------------
  // Local Auth (Optional)
  // ---------------------------
  const AUTH = {
    enabled(){ return localStorage.getItem('auth_enabled') === '1'; },
    setEnabled(v){ localStorage.setItem('auth_enabled', v ? '1' : '0'); },
    hasUser(){ return !!localStorage.getItem('auth_user') && !!localStorage.getItem('auth_hash'); },
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
    logout(){ sessionStorage.removeItem('auth_ok'); },
    setLoggedIn(){ sessionStorage.setItem('auth_ok','1'); },
    isLoggedIn(){ return sessionStorage.getItem('auth_ok') === '1'; },
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
      req.onupgradeneeded = () => {
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

  async function dbInit(){ db = await openDB(); }

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
      for(const b of branches.values()) os.put(b);
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
            skipped++; ev.preventDefault(); step();
          }else{
            errors++; ev.preventDefault(); step();
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

    return { type, jsonRows, records };
  }

  // ---------------------------
  // Reporting / Aggregation
  // ---------------------------
  function txISODate(t){
    return t.businessDate || (t.createDate ? t.createDate.slice(0,10) : null);
  }

  function filterTransactions(all, fromISO, toISO, branchId, docType, salesSet, invoiceStatus){
    return all.filter(t => {
      const d = txISODate(t);
      if(fromISO && d && d < fromISO) return false;
      if(toISO && d && d > toISO) return false;
      if(branchId && branchId !== 'all' && String(t.branchId) !== String(branchId)) return false;
      if(docType && docType !== 'all' && t.docType !== docType) return false;
      if(salesSet && salesSet.size > 0){
        const s = t.sales || '(غير محدد)';
        if(!salesSet.has(s)) return false;
      }
      if(invoiceStatus && invoiceStatus !== 'all'){
        const status = (t.status || '').toLowerCase();
        if(status !== invoiceStatus.toLowerCase()) return false;
      }
      return true;
    });
  }

  function netValue(t){
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

  function aggRefundRateByBranch(list){
    const by = aggByBranch(list);
    const out = by.map(x => {
      const rate = x.invoicesPaid > 0 ? (x.refundsPaid / x.invoicesPaid) : null;
      return { ...x, refundRate: rate };
    });
    // show highest rates first (null last)
    out.sort((a,b)=>{
      const ar = (a.refundRate==null)?-1:a.refundRate;
      const br = (b.refundRate==null)?-1:b.refundRate;
      return br - ar;
    });
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
      const d = txISODate(t);
      if(!d) continue;
      map.set(d, (map.get(d)||0) + netValue(t));
    }
    const out = Array.from(map.entries()).map(([date, net]) => ({date, net}));
    out.sort((a,b)=>a.date.localeCompare(b.date));
    return out;
  }

  function aggDailyDetails(list){
    const m = new Map();
    for(const t of list){
      const d = txISODate(t);
      if(!d) continue;
      if(!m.has(d)) m.set(d, {date:d, invPaid:0, refPaid:0, net:0});
      const o = m.get(d);
      const v = Number(t.paidAmount||0);
      if(t.docType === 'invoice') o.invPaid += v;
      else o.refPaid += v;
      o.net += netValue(t);
    }
    const out = Array.from(m.values()).map(x => ({
      ...x,
      refundRate: x.invPaid > 0 ? (x.refPaid / x.invPaid) : null
    }));
    out.sort((a,b)=>a.date.localeCompare(b.date));
    return out;
  }

  function aggMonthly(list){
    const m = new Map();
    for(const t of list){
      const d = txISODate(t);
      if(!d) continue;
      const mk = monthKeyFromISODate(d);
      if(!mk) continue;
      if(!m.has(mk)) m.set(mk, {month: mk, invPaid:0, refPaid:0, net:0});
      const o = m.get(mk);
      const v = Number(t.paidAmount||0);
      if(t.docType === 'invoice') o.invPaid += v;
      else o.refPaid += v;
      o.net += netValue(t);
    }
    const out = Array.from(m.values());
    out.sort((a,b)=>a.month.localeCompare(b.month));
    return out;
  }

  function aggTopCustomers(list){
    const g = groupBy(list, t => t.customer || '(غير محدد)');
    const out = [];
    for(const [customer, items] of g){
      const inv = items.filter(x=>x.docType==='invoice');
      const ref = items.filter(x=>x.docType==='refund');
      const invPaid = inv.reduce((s,x)=>s+Number(x.paidAmount||0),0);
      const refPaid = ref.reduce((s,x)=>s+Number(x.paidAmount||0),0);
      out.push({
        customer,
        net: invPaid - refPaid,
        invoicesPaid: invPaid,
        refundsPaid: refPaid,
        txCount: items.length
      });
    }
    out.sort((a,b)=>b.net-a.net);
    return out;
  }

  function aggBestSalesByBranch(list){
    const byBranch = groupBy(list, t => `${t.branchId||''}|${t.branchName||''}`);
    const out = [];
    for(const [k, items] of byBranch){
      const [branchId, branchName] = k.split('|');
      const bySales = groupBy(items, t => t.sales || '(غير محدد)');
      let best = null;
      for(const [sales, sitems] of bySales){
        const inv = sitems.filter(x=>x.docType==='invoice');
        const ref = sitems.filter(x=>x.docType==='refund');
        const invPaid = inv.reduce((s,x)=>s+Number(x.paidAmount||0),0);
        const refPaid = ref.reduce((s,x)=>s+Number(x.paidAmount||0),0);
        const rec = { branchId: branchId||'', branchName: branchName||'(غير محدد)', sales, net: invPaid-refPaid, invoicesPaid: invPaid, refundsPaid: refPaid };
        if(!best || rec.net > best.net) best = rec;
      }
      if(best) out.push(best);
    }
    out.sort((a,b)=>b.net-a.net);
    return out;
  }

  function buildAlerts(list){
    const daily = aggDailyDetails(list);
    const highRefund = daily
      .filter(x => x.invPaid > 0 && x.refundRate !== null && x.refundRate >= 0.20 && x.refPaid >= 200)
      .map(x => ({...x, type:'مرتجعات عالية', note:`Refund% ${fmtPercent(x.refundRate)} (مرتجعات ${fmtMoney(x.refPaid)})`}));

    const lowSales = [...daily]
      .sort((a,b)=>a.net-b.net)
      .slice(0, 10)
      .map(x => ({...x, type:'مبيعات منخفضة', note:`أقل الأيام (صافي ${fmtMoney(x.net)})`}));

    // merge unique by (date,type)
    const seen = new Set();
    const merged = [];
    for(const x of [...highRefund, ...lowSales]){
      const key = `${x.date}|${x.type}`;
      if(seen.has(key)) continue;
      seen.add(key);
      merged.push(x);
    }

    // show newest first
    merged.sort((a,b)=>b.date.localeCompare(a.date));
    return merged;
  }

  // ---------------------------
  // UI Rendering
  // ---------------------------
  function setActiveNav(page){
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.getAttribute('data-nav') === page));
    animatePageTransition(page);
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

  function numSpan(html){
    return `<span class="num">${html}</span>`;
  }

  function renderDashCards(k){
    const host = $('#dashCards');
    if(!host) return;
    host.innerHTML = '';
    const cards = [
      {title:'صافي المبيعات', value: numSpan(fmtMoney(k.net)), icon:'💰'},
      {title:'إجمالي فواتير', value: numSpan(fmtMoney(k.invPaid)), icon:'📄'},
      {title:'إجمالي مرتجعات', value: numSpan(fmtMoney(k.refPaid)), icon:'↩️'},
      {title:'عدد الفواتير', value: numSpan(fmtNumber(k.invCount)), icon:'📊'},
      {title:'عدد المرتجعات', value: numSpan(fmtNumber(k.refCount)), icon:'📉'},
      {title:'متوسط الفاتورة', value: numSpan(fmtMoney(k.avgTicket)), icon:'💵'},
      {title:'إجمالي الخصم', value: numSpan(fmtMoney(k.invDisc)), icon:'🏷️'},
      {title:'إجمالي الكمية', value: numSpan(fmtNumber(k.qtyInv)), icon:'📦'},
    ];
    for(const c of cards){
      const col = document.createElement('div');
      col.className = 'col-12 col-sm-6 col-lg-3';
      col.innerHTML = `
        <div class="card kpi-card p-3 fade-in-up">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--spacing-md);">
            <div class="kpi-title">${c.title}</div>
            <span style="font-size:1.5rem; opacity:0.6;">${c.icon}</span>
          </div>
          <div class="kpi-value">${c.value}</div>
        </div>
      `;
      host.appendChild(col);
    }
  }

  let chartDaily = null;
  let chartBranches = null;
  let chartBranchesCircle = null;
  let chartMonthly = null;
  let chartRefundRate = null;

  let chartRepMonthly = null;
  let chartRepRefundRate = null;

  /* Premium Chart Configuration */
  function getPremiumChartOptions(type='bar'){
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: true,
      animation: {
        duration: 400,
        easing: 'easeInOutQuart'
      },
      plugins: {
        filler: true,
        legend: {
          labels: {
            font: { size: 12, weight: '500' },
            padding: 16,
            color: '#4b5563',
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          titleFont: { size: 13, weight: '600' },
          bodyFont: { size: 12 },
          borderColor: 'rgba(255,255,255,0.2)',
          borderWidth: 1,
          displayColors: true,
          cornerRadius: 8,
          caretPadding: 10
        }
      }
    };

    if(type === 'line'){
      baseOptions.scales = {
        x: {
          grid: { display: false },
          ticks: { color: '#6b7280', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)', drawTicks: false },
          ticks: { color: '#6b7280', font: { size: 11 }, callback: (v)=>fmtMoney(v) }
        }
      };
    } else if(type === 'bar'){
      baseOptions.scales = {
        x: {
          grid: { display: false },
          ticks: { color: '#6b7280', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)', drawTicks: false },
          ticks: { color: '#6b7280', font: { size: 11 }, callback: (v)=>fmtMoney(v) }
        }
      };
    }

    return baseOptions;
  }

  function renderDailyChart(daily){
    const can = $('#chartDaily');
    const fb = $('#chartDailyFallback');
    if(!can || !fb) return;
    if(!libsStatus().hasChart){ fb.style.display = ''; return; }
    fb.style.display = 'none';

    const labels = daily.map(x=>x.date);
    const dataSales = daily.map(x=>x.invPaid);
    const dataReturns = daily.map(x=>x.refPaid);

    if(chartDaily) chartDaily.destroy();
    chartDaily = new Chart(can, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات',
          data: dataSales,
          borderColor: '#0f7aff',
          backgroundColor: 'rgba(15, 122, 255, 0.05)',
          fill: true,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#0f7aff',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4
        }, {
          label: 'المرتجعات',
          data: dataReturns,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          fill: true,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#ef4444',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4
        }]
      },
      options: getPremiumChartOptions('line')
    });
  }

  function renderBranchChart(byBranch){
    const can = $('#chartBranches');
    const fb = $('#chartBranchesFallback');
    if(!can || !fb) return;
    if(!libsStatus().hasChart){ fb.style.display = ''; return; }
    fb.style.display = 'none';

    const top = byBranch.slice(0,6);
    const labels = top.map(x=>`${x.branchId}-${x.branchName}`);
    const dataSales = top.map(x=>x.invoicesPaid);
    const dataReturns = top.map(x=>x.refundsPaid);

    if(chartBranches) chartBranches.destroy();
    chartBranches = new Chart(can, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات',
          data: dataSales,
          backgroundColor: 'rgba(15, 122, 255, 0.8)',
          borderRadius: 6,
          borderSkipped: false
        }, {
          label: 'المرتجعات',
          data: dataReturns,
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: getPremiumChartOptions('bar')
    });
  }

  function renderMonthlyChart(monthly){
    const can = $('#chartMonthly');
    const fb = $('#chartMonthlyFallback');
    if(!can || !fb) return;
    if(!libsStatus().hasChart){ fb.style.display = ''; return; }
    fb.style.display = 'none';

    const labels = monthly.map(x=>x.month);
    const dataSales = monthly.map(x=>x.invPaid);
    const dataReturns = monthly.map(x=>x.refPaid);

    if(chartMonthly) chartMonthly.destroy();
    chartMonthly = new Chart(can, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات',
          data: dataSales,
          backgroundColor: 'rgba(15, 122, 255, 0.8)',
          borderRadius: 6,
          borderSkipped: false
        }, {
          label: 'المرتجعات',
          data: dataReturns,
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: getPremiumChartOptions('bar')
    });
  }

  function renderRefundRateChart(refRate){
    const can = $('#chartRefundRate');
    const fb = $('#chartRefundRateFallback');
    if(!can || !fb) return;
    if(!libsStatus().hasChart){ fb.style.display = ''; return; }
    fb.style.display = 'none';

    const top = refRate
      .filter(x => x.refundRate !== null)
      .slice(0, 8);

    const labels = top.map(x=>`${x.branchId}-${x.branchName}`);
    const data = top.map(x=>Number((x.refundRate||0) * 100));

    if(chartRefundRate) chartRefundRate.destroy();
    chartRefundRate = new Chart(can, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'معدل المرتجعات %',
          data,
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        ...getPremiumChartOptions('bar'),
        scales: {
          ...getPremiumChartOptions('bar').scales,
          y: {
            ...getPremiumChartOptions('bar').scales.y,
            ticks: { ...getPremiumChartOptions('bar').scales.y.ticks, callback: (v)=>v+'%' }
          }
        }
      }
    });
  }

  function renderBranchesCircleChart(byBranch){
    const can = $('#chartBranchesCircle');
    const fb = $('#chartBranchesCircleFallback');
    if(!can || !fb) return;
    if(!libsStatus().hasChart){ fb.style.display = ''; return; }
    fb.style.display = 'none';

    const top = byBranch.slice(0, 8);
    const labels = top.map(x=>`${x.branchId}-${x.branchName}`);
    const data = top.map(x=>x.net);

    const colors = [
      'rgba(15, 122, 255, 0.8)',
      'rgba(99, 102, 241, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(239, 68, 68, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(8, 145, 178, 0.8)',
      'rgba(139, 92, 246, 0.8)',
      'rgba(236, 72, 153, 0.8)'
    ];

    if(chartBranchesCircle) chartBranchesCircle.destroy();
    chartBranchesCircle = new Chart(can, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 400, easing: 'easeInOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 12, weight: '500' }, padding: 15 }
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            borderRadius: 8,
            padding: 12,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            callbacks: {
              label: (context) => `${fmtNumber(context.parsed)} ريال`
            }
          },
          datalabels: {
            color: '#fff',
            font: { weight: 'bold', size: 11 },
            formatter: (val, ctx) => {
              const total = ctx.dataset.data.reduce((a,b)=>a+b, 0);
              const pct = ((val / total) * 100).toFixed(0);
              const label = labels[ctx.dataIndex].split('-')[1];
              return `${label}\n${fmtNumber(val)} (${pct}%)`;
            }
          }
        }
      },
      plugins: [{
        id: 'textCenter',
        beforeDatasetsDraw(chart){
          // This plugin draws labels on the chart segments
          const ctx = chart.ctx;
          const chartArea = chart.chartArea;
          const cx = (chartArea.left + chartArea.right) / 2;
          const cy = (chartArea.top + chartArea.bottom) / 2;
          const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;
          
          const meta = chart.getDatasetMeta(0);
          const total = meta.data[0]?._chart?.data?.datasets?.[0]?.data?.reduce((a,b)=>a+b, 0) || 0;
          
          meta.data.forEach((element, index) => {
            const value = element.$context.parsed;
            const pct = total > 0 ? ((value / total) * 100).toFixed(0) : 0;
            const label = labels[index].split('-')[1];
            
            const angle = (element.startAngle + element.endAngle) / 2;
            const x = cx + Math.cos(angle - Math.PI / 2) * (radius * 0.65);
            const y = cy + Math.sin(angle - Math.PI / 2) * (radius * 0.65);
            
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(label, x, y - 8);
            ctx.font = '10px sans-serif';
            ctx.fillText(`${fmtNumber(value)}`, x, y + 2);
            ctx.fillText(`(${pct}%)`, x, y + 12);
            ctx.restore();
          });
        }
      }]
    });
  }

  function renderTopBranchesTable(byBranch){
    const tbody = $('#tblTopBranches tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    for(const x of byBranch.slice(0,10)){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.branchId} - ${x.branchName}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.net))}</td>
        <td class="text-nowrap">${numSpan(fmtNumber(x.invoicesCount))}</td>
        <td class="text-nowrap">${numSpan(fmtNumber(x.refundsCount))}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderRefundRateTable(hostSel, refRate, limit=10){
    const tbody = document.querySelector(hostSel + ' tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    const rows = refRate
      .filter(x => x.refundRate !== null)
      .slice(0, limit);

    for(const x of rows){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.branchId} - ${x.branchName}</td>
        <td class="text-nowrap">${numSpan(fmtPercent(x.refundRate))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.invoicesPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.refundsPaid))}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderTopCustomersTable(hostSel, topCustomers, limit=10){
    const tbody = document.querySelector(hostSel + ' tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    for(const x of topCustomers.slice(0, limit)){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.customer}</td>
        <td class="text-nowrap fw-bold">${numSpan(fmtMoney(x.net))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.invoicesPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.refundsPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtNumber(x.txCount))}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderBestSalesByBranchTable(hostSel, bestRows, limit=15){
    const tbody = document.querySelector(hostSel + ' tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    for(const x of bestRows.slice(0, limit)){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.branchId} - ${x.branchName}</td>
        <td>${x.sales}</td>
        <td class="text-nowrap fw-bold">${numSpan(fmtMoney(x.net))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.invoicesPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.refundsPaid))}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderAlertsTable(hostSel, alerts){
    const tbody = document.querySelector(hostSel + ' tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if(!alerts.length){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" class="text-secondary small">لا توجد تنبيهات داخل هذا الفلتر.</td>`;
      tbody.appendChild(tr);
      return;
    }
    for(const a of alerts){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${a.date}</td>
        <td>${a.type}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(a.net))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(a.invPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(a.refPaid))}</td>
        <td class="text-nowrap">${numSpan(a.refundRate==null?'':fmtPercent(a.refundRate))}</td>
        <td class="small">${a.note || ''}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderTableByBranch(byBranch){
    const tbody = $('#tblByBranch tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    for(const x of byBranch){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.branchId} - ${x.branchName}</td>
        <td class="text-nowrap fw-bold">${numSpan(fmtMoney(x.net))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.invoicesPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.refundsPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtNumber(x.invoicesCount))}</td>
        <td class="text-nowrap">${numSpan(fmtNumber(x.refundsCount))}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderTableBySalesperson(bySales){
    const tbody = $('#tblBySalesperson tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    for(const x of bySales){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.sales}</td>
        <td class="text-nowrap fw-bold">${numSpan(fmtMoney(x.net))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.invoicesPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.refundsPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtNumber(x.txCount))}</td>
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
    if(!thead || !tbody) return;
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if(list.length === 0){
      tbody.innerHTML = '<tr><td colspan="12" class="text-center py-5"><div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-title">لا توجد عمليات</div><div class="empty-state-text">حاول تعديل الفلتر للعثور على بيانات</div></div></td></tr>';
      return;
    }

    const trh = document.createElement('tr');
    for(const c of TX_COLUMNS){
      const th = document.createElement('th');
      th.textContent = c.label;
      trh.appendChild(th);
    }
    thead.appendChild(trh);

    for(const t of list){
      const tr = document.createElement('tr');
      tr.classList.add('interactive-row');
      for(const c of TX_COLUMNS){
        let v = t[c.key];
        let html = '';
        if(['qty','amount','discount','paidAmount'].includes(c.key)){
          html = numSpan(fmtNumber(v));
        }else if(c.key === 'docType'){
          const icon = t.docType === 'invoice' ? '📄' : '↩️';
          const label = t.docType === 'invoice' ? 'فاتورة' : 'مرتجع';
          html = `${icon} ${label}`;
        }else{
          html = (v ?? '');
        }
        const td = document.createElement('td');
        td.innerHTML = html;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function renderPreview(records){
    const tbl = $('#tblPreview');
    if(!tbl) return;
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
        if(['qty','amount','discount','paidAmount'].includes(c)){
          tr.innerHTML += `<td>${numSpan(fmtNumber(v))}</td>`;
        }else{
          tr.innerHTML += `<td>${v ?? ''}</td>`;
        }
      }
      tbody.appendChild(tr);
    }
  }

  function renderMonthlyReportTable(hostSel, monthly){
    const tbody = document.querySelector(hostSel + ' tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    for(const x of monthly){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.month}</td>
        <td class="text-nowrap fw-bold">${numSpan(fmtMoney(x.net))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.invPaid))}</td>
        <td class="text-nowrap">${numSpan(fmtMoney(x.refPaid))}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderMonthlyReportChart(canSel, fbSel, monthly){
    const can = $(canSel);
    const fb = $(fbSel);
    if(!can || !fb) return;
    if(!libsStatus().hasChart){ fb.style.display = ''; return; }
    fb.style.display = 'none';

    const labels = monthly.map(x=>x.month);
    const data = monthly.map(x=>x.net);

    if(chartRepMonthly) chartRepMonthly.destroy();
    chartRepMonthly = new Chart(can, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'صافي المبيعات',
          data,
          backgroundColor: 'rgba(15, 122, 255, 0.8)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: getPremiumChartOptions('bar')
    });
  }

  function renderRefundRateReportChart(canSel, fbSel, refRate){
    const can = $(canSel);
    const fb = $(fbSel);
    if(!can || !fb) return;
    if(!libsStatus().hasChart){ fb.style.display = ''; return; }
    fb.style.display = 'none';

    const top = refRate.filter(x=>x.refundRate!==null).slice(0, 8);
    const labels = top.map(x=>`${x.branchId}-${x.branchName}`);
    const data = top.map(x=>Number((x.refundRate||0)*100));

    if(chartRepRefundRate) chartRepRefundRate.destroy();
    chartRepRefundRate = new Chart(can, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'معدل المرتجعات %',
          data,
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        ...getPremiumChartOptions('bar'),
        scales: {
          ...getPremiumChartOptions('bar').scales,
          y: {
            ...getPremiumChartOptions('bar').scales.y,
            ticks: { ...getPremiumChartOptions('bar').scales.y.ticks, callback: (v)=>v+'%' }
          }
        }
      }
    });
  }

  // ---------------------------
  // Multi-select (Sales filter)
  // ---------------------------
  function createSalesMultiSelect(){
    const root = $('#repSalesMsel');
    if(!root) return null;

    const btn = $('#repSalesBtn');
    const menuList = $('#repSalesList');
    const search = $('#repSalesSearch');
    const btnAll = $('#repSalesAll');
    const btnClear = $('#repSalesClear');

    let options = [];
    let selected = new Set(); // empty => all

    function setOpen(v){
      root.classList.toggle('open', v);
      // if opening, pin the dropdown to viewport so scrolling doesn't hide it
      const menu = root.querySelector('.msel-menu');
      if(menu){
        if(v){
          const rect = root.getBoundingClientRect();
          menu.style.position = 'fixed';
          menu.style.top = (rect.bottom + 2) + 'px';
          menu.style.left = rect.left + 'px';
          menu.style.width = rect.width + 'px';
          menu.style.maxHeight = '60vh';
          menu.style.zIndex = 2000;
        } else {
          menu.style.position = '';
          menu.style.top = '';
          menu.style.left = '';
          menu.style.width = '';
          menu.style.maxHeight = '';
          menu.style.zIndex = '';
        }
      }
    }

    function updateBtnLabel(){
      if(selected.size === 0){
        btn.textContent = 'كل الموظفين';
        return;
      }
      if(selected.size === options.length){
        selected = new Set();
        btn.textContent = 'كل الموظفين';
        renderList();
        return;
      }
      btn.textContent = `تم اختيار (${selected.size})`;
    }

    function renderList(){
      const q = (search.value || '').trim().toLowerCase();
      menuList.innerHTML = '';
      const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options;

      for(const opt of filtered){
        const id = 's_'+Math.random().toString(16).slice(2);
        const checked = (selected.size === 0) ? true : selected.has(opt);

        const div = document.createElement('div');
        div.className = 'msel-item';
        div.innerHTML = `
          <input class="form-check-input" type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
          <label class="form-check-label small" for="${id}">${opt}</label>
        `;
        const cb = div.querySelector('input');
        cb.addEventListener('change', ()=>{
          // when selected is empty => it means all
          if(selected.size === 0){
            // convert "all" into explicit selections
            selected = new Set(options);
          }
          if(cb.checked) selected.add(opt);
          else selected.delete(opt);

          // if user ended up selecting all => collapse to empty
          if(selected.size === options.length) selected = new Set();
          updateBtnLabel();
          // keep open
        });
        menuList.appendChild(div);
      }

      updateBtnLabel();
    }

    function setOptions(newOptions){
      options = Array.from(new Set(newOptions)).sort((a,b)=>a.localeCompare(b));
      // keep only valid selections
      if(selected.size > 0){
        selected = new Set(Array.from(selected).filter(x => options.includes(x)));
        if(selected.size === options.length) selected = new Set();
      }
      renderList();
    }

    function getSelectedSet(){
      return new Set(selected); // copy
    }

    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      setOpen(!root.classList.contains('open'));
      if(root.classList.contains('open')){
        search.focus();
      }
    });

    search.addEventListener('input', renderList);

    btnAll.addEventListener('click', (e)=>{
      e.preventDefault();
      selected = new Set(); // all
      renderList();
    });

    btnClear.addEventListener('click', (e)=>{
      e.preventDefault();
      // clear means select none? Here we'll interpret as "all" is off and none selected => show nothing.
      // But user usually expects "مسح" = remove selection -> back to all.
      selected = new Set();
      renderList();
    });

    document.addEventListener('click', (e)=>{
      if(!root.contains(e.target)) setOpen(false);
    });

    // init
    setOptions(['(غير محدد)']);

    return { setOptions, getSelectedSet, close: ()=>setOpen(false) };
  }

  // ---------------------------
  // Page Actions
  // ---------------------------
  function downloadCanvasAsPNG(canvas, filename){
    try {
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch(e) {
      console.error('Download failed', e);
      showAlert('danger', 'فشل تحميل الصورة. قد يكون المتصفح يمنع ذلك.');
    }
  }

  function injectChartDownloadButtons(){
    // Find all canvases that don't have a download button yet
    $$('canvas').forEach(can => {
      const parent = can.parentElement;
      if(!parent) return;
      // Check if button already exists
      if(parent.querySelector('.btn-chart-dl')) return;

      // Make parent relative so we can position absolute
      if(getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-light btn-chart-dl';
      btn.innerHTML = '📷';
      btn.title = 'حفظ كصورة (PNG)';
      btn.style.position = 'absolute';
      btn.style.top = '10px';
      btn.style.left = '10px'; // RTL friendly (top-left)
      btn.style.zIndex = '10';
      btn.style.opacity = '0.5';
      btn.style.transition = 'opacity 0.2s';
      btn.style.border = '1px solid #ccc';
      
      btn.addEventListener('mouseenter', ()=>btn.style.opacity='1');
      btn.addEventListener('mouseleave', ()=>btn.style.opacity='0.5');
      
      btn.onclick = (e) => {
        e.stopPropagation();
        const name = can.id || 'chart';
        downloadCanvasAsPNG(can, name + '.png');
      };
      
      parent.appendChild(btn);
    });
  }

  async function refreshBranchesUI(){
    const branches = await idbGetAll('branches');
    fillBranchSelect($('#dashBranch'), branches);
    fillBranchSelect($('#repBranch'), branches);
    // also update analytics selector in case user has already visited analytics
    const anal = $('#analBranch');
    if(anal){ fillBranchSelect(anal, branches); }
  }

  function setDefaultDateRange(allTx){
    const dates = allTx.map(t => txISODate(t)).filter(Boolean).sort();
    if(!dates.length) return;
    const min = dates[0];
    const max = dates[dates.length-1];

    for(const id of ['dashFrom','repFrom']) if($('#'+id) && !$('#'+id).value) $('#'+id).value = min;
    for(const id of ['dashTo','repTo']) if($('#'+id) && !$('#'+id).value) $('#'+id).value = max;
  }

  async function refreshDashboard(){
    const all = await idbGetAll('transactions');
    setDefaultDateRange(all);

    const fromISO = $('#dashFrom')?.value || null;
    const toISO = $('#dashTo')?.value || null;
    const branchId = $('#dashBranch')?.value || 'all';
    const invoiceStatus = $('#dashStatus')?.value || 'all';

    const list = filterTransactions(all, fromISO, toISO, branchId, 'all', null, invoiceStatus);

    const k = computeKPIs(list);
    renderDashCards(k);

    const byBranch = aggByBranch(list);
    renderBranchChart(byBranch);
    renderBranchesCircleChart(byBranch);
    renderTopBranchesTable(byBranch);

    const daily = aggDailyDetails(list);
    renderDailyChart(daily);

    // Move chartBranches under chartDaily if possible (Vertical Stacking)
    const cDaily = $('#chartDaily');
    const cBranch = $('#chartBranches');
    if(cDaily && cBranch){
      const pDaily = cDaily.closest('.col-12, .col-lg-6, .col-md-6, .col-sm-12');
      const pBranch = cBranch.closest('.col-12, .col-lg-6, .col-md-6, .col-sm-12');
      if(pDaily && pBranch && pDaily !== pBranch && pDaily.parentNode === pBranch.parentNode){
         pDaily.parentNode.insertBefore(pBranch, pDaily.nextSibling);
         // Force full width to ensure they stack vertically
         pDaily.className = pDaily.className.replace(/col-(lg|md|sm)-6/g, 'col-$1-12').replace('col-lg-6', 'col-lg-12').replace('col-md-6', 'col-md-12');
         pBranch.className = pBranch.className.replace(/col-(lg|md|sm)-6/g, 'col-$1-12').replace('col-lg-6', 'col-lg-12').replace('col-md-6', 'col-md-12');
      }
    }

    const monthly = aggMonthly(list);
    renderMonthlyChart(monthly);

    const refRate = aggRefundRateByBranch(list);
    renderRefundRateChart(refRate);
    renderRefundRateTable('#tblRefundRate', refRate, 10);

    const topCustomers = aggTopCustomers(list);
    renderTopCustomersTable('#tblTopCustomers', topCustomers, 10);

    const bestSales = aggBestSalesByBranch(list);
    renderBestSalesByBranchTable('#tblBestSalesByBranch', bestSales, 15);

    const alerts = buildAlerts(list);
    renderAlertsTable('#tblAlerts', alerts);

    // cache for dashboard exports
    window.__latestDashboard = { list, k, byBranch, daily, monthly, refRate, topCustomers, bestSales, alerts, filters: {fromISO, toISO, branchId, invoiceStatus} };
    
    // Add download buttons to charts (wait for animation)
    setTimeout(injectChartDownloadButtons, 600);
  }

  function updateProgress(done, total){
    const p = total ? Math.round((done/total)*100) : 0;
    const bar = $('#importProgress');
    if(!bar) return;
    bar.style.width = `${p}%`;
    bar.textContent = `${p}%`;
    bar.parentElement?.setAttribute('aria-valuenow', String(p));
  }

  async function doImport(){
    const input = $('#fileInput');
    const files = Array.from(input?.files || []);
    if(!files.length){
      showAlert('warning','من فضلك اختَر ملف واحد على الأقل.');
      return;
    }
    updateProgress(0, 1);
    $('#importSummary').innerHTML = '';

    let totalInserted=0, totalSkipped=0, totalErrors=0;
    let previewRecords = [];

    for(const f of files){
      try{
        updateProgress(0, 1);
        const parsed = await parseExcelFile(f);
        if(!previewRecords.length) previewRecords = parsed.records;

        await upsertBranchesFromRecords(parsed.records);

        const res = await addManyTransactions(parsed.records, (done, tot)=>{
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
  // Downloads (CSV + XLSX)
  // ---------------------------
  function canExportXLSX(){
    return libsStatus().hasXLSX;
  }

  /**
   * If opts.images is provided, we try to use ExcelJS to embed them properly.
   * Otherwise we fall back to SheetJS for data only.
   */
  async function downloadXLSX_ExcelJS(filename, sheets, images){
    if(typeof ExcelJS === 'undefined'){
      try {
        showAlert('info', 'جاري تحميل مكتبة ExcelJS لتصدير الصور...', 2000);
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js');
      } catch(e){
        throw new Error('Failed to load ExcelJS');
      }
    }
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sales Local App';
    workbook.created = new Date();

    // 1. Data Sheets
    for(const sh of sheets){
      const safeName = (sh.name || 'Sheet').replace(/[\\/?*[\]]/g, '').slice(0, 31);
      const ws = workbook.addWorksheet(safeName, { views: [{ rightToLeft: true }] });
      
      // Support multiple tables in one sheet or single list of rows
      const tables = sh.tables || (sh.rows ? [{title: null, rows: sh.rows}] : []);

      for(const tbl of tables){
        if(!tbl.rows || !tbl.rows.length) continue;

        // Add Section Title
        if(tbl.title){
          const titleRow = ws.addRow([tbl.title]);
          titleRow.font = { bold: true, size: 14, color: { argb: 'FF1A3A52' } }; // Navy Blue
          titleRow.height = 28;
        }

        // Get all unique keys
        const keys = new Set();
        tbl.rows.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
        const header = Array.from(keys);
        
        // Add Header Row
        const headerRow = ws.addRow(header);
        headerRow.height = 24;
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F7AFF' } }; // Primary Blue
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = { bottom: { style: 'medium', color: { argb: 'FF0056B3' } } };
        });

        // Add data rows
        tbl.rows.forEach((r, idx) => {
          const rowValues = header.map(k => {
            const v = r[k];
            return (v === null || v === undefined) ? '' : v;
          });
          const row = ws.addRow(rowValues);
          
          // Zebra striping (alternating colors)
          const isEven = idx % 2 === 0;
          
          // Style data cells
          row.eachCell((cell, colNumber) => {
             cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
             cell.border = {
               bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
               right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
               left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
               top: { style: 'thin', color: { argb: 'FFE0E0E0' } }
             };
             
             if(isEven){
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }; // Light Gray
             }
             
             // Numeric formatting
             const val = cell.value;
             if(typeof val === 'number'){
                // If it looks like a monetary value or has decimals
                if(val % 1 !== 0 || Math.abs(val) > 1000) {
                    cell.numFmt = '#,##0.00';
                }
             }
          });
        });

        // Add spacing between tables
        ws.addRow([]);
        ws.addRow([]);
      }

      // Auto-width calculation
      const maxCol = ws.columnCount;
      for(let i=1; i<=maxCol; i++){
          let maxLen = 10;
          const col = ws.getColumn(i);
          col.eachCell({ includeEmpty: false }, function(cell, rowNumber) {
              if(rowNumber > 50) return; // Limit sampling for performance
              const len = String(cell.value).length;
              if(len > maxLen) maxLen = len;
          });
          col.width = Math.min(maxLen + 5, 50);
      }
    }

    // 2. Images Sheet
    if(images && images.length){
      const ws = workbook.addWorksheet('الرسوم البيانية', { views: [{ rightToLeft: true, showGridLines: false }] });
      let currentRow = 2;

      // Title for the sheet
      const mainTitle = ws.getRow(1);
      mainTitle.getCell(1).value = 'الرسوم البيانية والتحليلات';
      mainTitle.getCell(1).font = { bold: true, size: 18, color: { argb: 'FF0F7AFF' } };
      currentRow += 2;

      for(const imgObj of images){
        const canvas = imgObj.canvas;
        if(!canvas) continue;

        // Chart Title
        const titleRow = ws.getRow(currentRow);
        titleRow.getCell(1).value = imgObj.name || 'Chart';
        titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF333333' } };
        currentRow += 1;

        // Image
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1]; // Strip data:image/png;base64, prefix
        
        const imageId = workbook.addImage({
          base64: base64,
          extension: 'png',
        });

        // Scale
        const targetWidth = 600;
        const ratio = canvas.height / canvas.width;
        const targetHeight = targetWidth * ratio;

        ws.addImage(imageId, {
          tl: { col: 0, row: currentRow - 1 },
          ext: { width: targetWidth, height: targetHeight }
        });

        const rowsCovered = Math.ceil(targetHeight / 20);
        currentRow += rowsCovered + 3;
      }
      
      ws.getColumn(1).width = 80;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(filename, new Blob([buffer], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  }

  /**
   * downloadXLSX
   * @param {string} filename
   * @param {Array<{name?:string,rows:Array}>} sheets
   * @param {Object} [opts]
   * @param {Array<{name:string,canvas?:HTMLCanvasElement,dataURL?:string}>} [opts.images]
   */
  async function downloadXLSX(filename, sheets, opts={}){
    // Try ExcelJS if images are present OR if we have complex tables structure
    const hasTables = sheets.some(s => s.tables);

    if((opts.images && opts.images.length) || hasTables){
      try {
        await downloadXLSX_ExcelJS(filename, sheets, opts.images);
        return;
      } catch(e) {
        console.error('ExcelJS export failed', e);
        showAlert('warning', 'فشل تصدير الصور (ExcelJS). سيتم تصدير البيانات فقط.');
      }
    }

    if(!canExportXLSX()){
      showAlert('warning', 'تصدير Excel يحتاج مكتبة XLSX (تأكد من الإنترنت).');
      return;
    }
    const wb = XLSX.utils.book_new();
    for(const sh of sheets){
      if(sh.tables){
        // Fallback: create separate sheets for tables if ExcelJS fails
        for(const t of sh.tables){
           const ws = XLSX.utils.json_to_sheet(t.rows);
           XLSX.utils.book_append_sheet(wb, ws, (t.title || 'Table').slice(0, 31));
        }
      } else {
        const rows = sh.rows || [];
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, (sh.name || 'Sheet1').slice(0, 31));
      }
    }
    XLSX.writeFile(wb, filename);
  }

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
    const fromISO = $('#dashFrom')?.value || null;
    const toISO = $('#dashTo')?.value || null;
    const branchId = $('#dashBranch')?.value || 'all';
    const list = filterTransactions(all, fromISO, toISO, branchId, 'all', null);
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

  function showExportDialog(){
    // Check if modal already exists
    let modal = document.getElementById('exportModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'exportModal';
      modal.className = 'modal fade';
      modal.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">تخصيص تصدير Excel</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="form-check"><input class="form-check-input" type="checkbox" value="summary" checked id="exp_summary"><label class="form-check-label" for="exp_summary">ملخص الأداء (Summary)</label></div>
              <div class="form-check"><input class="form-check-input" type="checkbox" value="topBranches" checked id="exp_topBranches"><label class="form-check-label" for="exp_topBranches">أفضل الفروع (Top Branches)</label></div>
              <div class="form-check"><input class="form-check-input" type="checkbox" value="monthly" checked id="exp_monthly"><label class="form-check-label" for="exp_monthly">الأداء الشهري (Monthly)</label></div>
              <div class="form-check"><input class="form-check-input" type="checkbox" value="bestSales" checked id="exp_bestSales"><label class="form-check-label" for="exp_bestSales">أفضل المبيعات (Best Sales)</label></div>
              <div class="form-check"><input class="form-check-input" type="checkbox" value="refundRate" checked id="exp_refundRate"><label class="form-check-label" for="exp_refundRate">معدل المرتجعات (Refund Rate)</label></div>
              <div class="form-check"><input class="form-check-input" type="checkbox" value="topCustomers" checked id="exp_topCustomers"><label class="form-check-label" for="exp_topCustomers">أفضل العملاء (Top Customers)</label></div>
              <div class="form-check"><input class="form-check-input" type="checkbox" value="alerts" checked id="exp_alerts"><label class="form-check-label" for="exp_alerts">التنبيهات (Alerts)</label></div>
              <hr>
              <div class="form-check"><input class="form-check-input" type="checkbox" value="charts" checked id="exp_charts"><label class="form-check-label" for="exp_charts">تضمين الرسوم البيانية (Charts)</label></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
              <button type="button" class="btn btn-primary" id="btnDoExport">تصدير</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector('#btnDoExport').onclick = () => {
        const options = {
          summary: $('#exp_summary').checked,
          topBranches: $('#exp_topBranches').checked,
          monthly: $('#exp_monthly').checked,
          bestSales: $('#exp_bestSales').checked,
          refundRate: $('#exp_refundRate').checked,
          topCustomers: $('#exp_topCustomers').checked,
          alerts: $('#exp_alerts').checked,
          charts: $('#exp_charts').checked
        };
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal.hide();
        downloadDashXLSX(options);
      };
    }
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  async function downloadDashXLSX(options){
    const snap = window.__latestDashboard;
    if(!snap){
      await refreshDashboard();
    }
    const d = window.__latestDashboard;
    if(!d){
      showAlert('warning', 'لا يوجد بيانات لتصديرها.');
      return;
    }

    // Default options if not provided
    if(!options) options = { summary:true, topBranches:true, monthly:true, bestSales:true, refundRate:true, topCustomers:true, alerts:true, charts:true };

    const summary = [{
      from: d.filters?.fromISO || '',
      to: d.filters?.toISO || '',
      branch: d.filters?.branchId || 'all',
      net_sales: d.k.net,
      invoices_paid: d.k.invPaid,
      refunds_paid: d.k.refPaid,
      invoices_count: d.k.invCount,
      refunds_count: d.k.refCount,
      avg_ticket: d.k.avgTicket
    }];

    const topBranches = d.byBranch.slice(0, 20).map(x => ({
      branchId: x.branchId,
      branchName: x.branchName,
      net: x.net,
      invoicesPaid: x.invoicesPaid,
      refundsPaid: x.refundsPaid,
      invoicesCount: x.invoicesCount,
      refundsCount: x.refundsCount
    }));

    const monthly = d.monthly.map(x => ({month:x.month, net:x.net, invoicesPaid:x.invPaid, refundsPaid:x.refPaid}));

    const refundRate = d.refRate.map(x => ({
      branchId: x.branchId,
      branchName: x.branchName,
      refundRate: x.refundRate,
      invoicesPaid: x.invoicesPaid,
      refundsPaid: x.refundsPaid
    }));

    const topCustomers = d.topCustomers.slice(0, 50).map(x => ({
      customer: x.customer,
      net: x.net,
      invoicesPaid: x.invoicesPaid,
      refundsPaid: x.refundsPaid,
      txCount: x.txCount
    }));

    const bestSales = d.bestSales.slice(0, 100).map(x => ({
      branchId: x.branchId,
      branchName: x.branchName,
      sales: x.sales,
      net: x.net,
      invoicesPaid: x.invoicesPaid,
      refundsPaid: x.refundsPaid
    }));

    const alerts = d.alerts.map(a => ({
      date: a.date,
      type: a.type,
      net: a.net,
      invoicesPaid: a.invPaid,
      refundsPaid: a.refPaid,
      refundRate: a.refundRate,
      note: a.note
    }));

    // collect any visible chart canvases on dashboard so they can be included
    const chartIds = ['chartDaily','chartBranches','chartMonthly','chartBranchesCircle','chartRefundRate'];
    const chartImages = options.charts ? chartIds.map(id=>({id, el: document.getElementById(id)})).filter(x=>x.el).map(x=>({name:x.id,canvas:x.el})) : [];
    
    // Merge main data into one sheet
    const dashboardTables = [];
    if(options.summary) dashboardTables.push({ title: '📊 ملخص الأداء (Summary)', rows: summary });
    if(options.topBranches) dashboardTables.push({ title: '🏆 أفضل الفروع (Top Branches)', rows: topBranches });
    if(options.monthly) dashboardTables.push({ title: '📅 الأداء الشهري (Monthly)', rows: monthly });
    if(options.bestSales) dashboardTables.push({ title: '🌟 أفضل المبيعات (Best Sales)', rows: bestSales });

    const sheets = [];
    if(dashboardTables.length) sheets.push({name:'Dashboard', tables: dashboardTables});
    if(options.refundRate) sheets.push({name:'RefundRate', rows: refundRate});
    if(options.topCustomers) sheets.push({name:'TopCustomers', rows: topCustomers});
    if(options.alerts) sheets.push({name:'Alerts', rows: alerts});

    await downloadXLSX('dashboard.xlsx', sheets, {images: chartImages});
  }

  function printPage(pageType){
    // converting canvas charts to images before copying is necessary because
    // serializing a canvas element via innerHTML will not preserve its drawn
    // content. this helper clones the page section, replaces each canvas with
    // a data-url image, and then writes the resulting markup to the popup.

    const printWindow = window.open('', '_blank');
    if(!printWindow){
      showAlert('danger', 'تم حظر فتح نافذة جديدة. يرجى السماح بالنوافذ المنبثقة.');
      return;
    }

    const pageElOrig = pageType === 'dashboard' ? $('#page-dashboard') : $('#page-reports');
    if(!pageElOrig){
      showAlert('danger', 'الصفحة غير موجودة.');
      return;
    }

    // clone so we don't disturb the live DOM
    const clone = pageElOrig.cloneNode(true);
    // we need the drawn content from the original canvases, not the empty clones
    const origCanvases = pageElOrig.querySelectorAll('canvas');
    const cloneCanvases = clone.querySelectorAll('canvas');
    cloneCanvases.forEach((copy, idx) => {
      const original = origCanvases[idx];
      if(!original) return;
      try {
        const img = document.createElement('img');
        img.src = original.toDataURL('image/png');
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        copy.parentNode.replaceChild(img, copy);
      } catch (e) {
        // if toDataURL fails (e.g. canvas tainted) just leave the canvas copy
      }
    });

    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${pageType === 'dashboard' ? 'الداشبورد' : 'التقارير'} - لوحة مبيعات</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css">
        <link rel="stylesheet" href="css/styles.css">
        <style>
          body { background: white !important; margin: 0 !important; padding: 15mm !important; font-size: 11pt !important; font-family: Arial, sans-serif !important; }
          .navbar { display: none !important; }
          .d-flex.flex-wrap.justify-content-between { display: none !important; }
          [id*="Fallback"] { display: none !important; }
          .container-fluid { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .card { page-break-inside: avoid !important; border: 1px solid #999 !important; margin: 0 0 20mm 0 !important; padding: 10mm !important; box-shadow: none !important; }
          .card:last-child { page-break-after: auto !important; }
          .card-header { background: #e8e4dc !important; padding: 8mm 10mm !important; font-weight: bold !important; font-size: 13pt !important; border-bottom: 2px solid #333 !important; margin: 0 !important; }
          .card-body { padding: 10mm !important; margin: 0 !important; }
          table { font-size: 9pt !important; margin: 10mm 0 !important; width: 100% !important; }
          thead { background: #d4c5b3 !important; color: #000 !important; }
          thead th { background: #d4c5b3 !important; color: #000 !important; padding: 6mm !important; font-weight: bold !important; }
          tbody tr { border-bottom: 1px solid #ddd !important; }
          tbody tr:nth-child(even) { background: #f9f7f4 !important; }
          tbody td { padding: 4mm 6mm !important; }
          canvas, img { max-width: 100% !important; height: auto !important; margin: 10mm 0 !important; }
          h2 { margin: 20mm 0 10mm 0 !important; font-size: 16pt !important; color: #1a3a52 !important; page-break-after: avoid !important; font-weight: bold !important; }
          h3 { margin: 15mm 0 8mm 0 !important; font-size: 14pt !important; color: #1a3a52 !important; page-break-after: avoid !important; font-weight: bold !important; }
          .row { margin: 0 !important; page-break-inside: avoid !important; }
          .col-12, .col-lg-7, .col-lg-5, .col-lg-6 { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          hr { display: none !important; }
          .text-secondary, .text-muted { display: none !important; }
          .kpi-card { page-break-inside: avoid !important; margin: 8mm 0 !important; padding: 8mm !important; border: 1px solid #ccc !important; }
          .table-responsive { page-break-inside: avoid !important; }
        </style>
      </head>
      <body>
        <div class="container-fluid py-3">
          <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0f7aff; padding-bottom: 15px;">
            <h1 style="margin: 0; color: #0f7aff; font-size: 28pt;">📊 لوحة مبيعات محلية</h1>
            <p style="margin: 5px 0; color: #6c757d; font-size: 12pt;">${pageType === 'dashboard' ? 'الداشبورد' : 'التقارير'}</p>
            <p style="margin: 5px 0; color: #999; font-size: 10pt;">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')} ${new Date().toLocaleTimeString('ar-SA')}</p>
          </div>
          ${clone.innerHTML}
        </div>
        <script>
          window.addEventListener('load', ()=>{ setTimeout(()=>window.print(), 800); });
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }

  function downloadReport(kind){
    const r = window.__latestReports;
    if(!r){ showAlert('warning','اعمل "عرض" في التقارير الأول.'); return; }

    const exportMap = {
      branch: () => r.byBranch.map(x=>({
        branchId:x.branchId,
        branchName:x.branchName,
        net:x.net,
        invoicesPaid:x.invoicesPaid,
        refundsPaid:x.refundsPaid,
        invoicesCount:x.invoicesCount,
        refundsCount:x.refundsCount
      })),
      salesperson: () => r.bySales.map(x=>({
        sales:x.sales,
        net:x.net,
        invoicesPaid:x.invoicesPaid,
        refundsPaid:x.refundsPaid,
        txCount:x.txCount
      })),
      transactions: () => (r.filtered || r.list).map(t=>({
        docType:t.docType,
        docNo:t.docNo,
        branchId:t.branchId,
        branchName:t.branchName,
        businessDate:txISODate(t),
        customer:t.customer,
        sales:t.sales,
        qty:t.qty,
        amount:t.amount,
        discount:t.discount,
        paidAmount:t.paidAmount,
        sourceFileName:t.sourceFileName
      })),
      topcustomers: () => r.topCustomers.map(x=>({
        customer:x.customer,
        net:x.net,
        invoicesPaid:x.invoicesPaid,
        refundsPaid:x.refundsPaid,
        txCount:x.txCount
      })),
      refundirate: () => r.refRate.map(x=>({
        branchId:x.branchId,
        branchName:x.branchName,
        refundRate:x.refundRate,
        invoicesPaid:x.invoicesPaid,
        refundsPaid:x.refundsPaid
      })),
      monthly: () => r.monthly.map(x=>({
        month:x.month,
        net:x.net,
        invoicesPaid:x.invPaid,
        refundsPaid:x.refPaid
      })),
      bestsales: () => r.bestSales.map(x=>({
        branchId:x.branchId,
        branchName:x.branchName,
        sales:x.sales,
        net:x.net,
        invoicesPaid:x.invoicesPaid,
        refundsPaid:x.refundsPaid
      })),
      alerts: () => r.alerts.map(a=>({
        date:a.date,
        type:a.type,
        net:a.net,
        invoicesPaid:a.invPaid,
        refundsPaid:a.refPaid,
        refundRate:a.refundRate,
        note:a.note
      })),
    };

    if(!exportMap[kind]){ showAlert('warning','نوع تقرير غير معروف.'); return; }

    const rows = exportMap[kind]();
    const headers = Object.keys(rows[0] || {a:1});
    const csv = toCSV(rows, headers);
    downloadText(`report_${kind}.csv`, csv, 'text/csv;charset=utf-8');
  }

  async function downloadReportXlsx(kind){
    const r = window.__latestReports;
    if(!r){ showAlert('warning','اعمل "عرض" في التقارير الأول.'); return; }

    // reuse csv builder sources
    const temp = { __latestReports: r };
    // build rows similar to CSV export
    const rows = (()=>{
      switch(kind){
        case 'branch': return r.byBranch.map(x=>({
          branchId:x.branchId,
          branchName:x.branchName,
          net:x.net,
          invoicesPaid:x.invoicesPaid,
          refundsPaid:x.refundsPaid,
          invoicesCount:x.invoicesCount,
          refundsCount:x.refundsCount
        }));
        case 'salesperson': return r.bySales.map(x=>({
          sales:x.sales,
          net:x.net,
          invoicesPaid:x.invoicesPaid,
          refundsPaid:x.refundsPaid,
          txCount:x.txCount
        }));
        case 'transactions': return (r.filtered || r.list).map(t=>({
          docType:t.docType,
          docNo:t.docNo,
          branchId:t.branchId,
          branchName:t.branchName,
          businessDate:txISODate(t),
          customer:t.customer,
          sales:t.sales,
          qty:t.qty,
          amount:t.amount,
          discount:t.discount,
          paidAmount:t.paidAmount,
          sourceFileName:t.sourceFileName
        }));
        case 'topcustomers': return r.topCustomers.map(x=>({
          customer:x.customer,
          net:x.net,
          invoicesPaid:x.invoicesPaid,
          refundsPaid:x.refundsPaid,
          txCount:x.txCount
        }));
        case 'refundirate': return r.refRate.map(x=>({
          branchId:x.branchId,
          branchName:x.branchName,
          refundRate:x.refundRate,
          invoicesPaid:x.invoicesPaid,
          refundsPaid:x.refundsPaid
        }));
        case 'monthly': return r.monthly.map(x=>({
          month:x.month,
          net:x.net,
          invoicesPaid:x.invPaid,
          refundsPaid:x.refPaid
        }));
        case 'bestsales': return r.bestSales.map(x=>({
          branchId:x.branchId,
          branchName:x.branchName,
          sales:x.sales,
          net:x.net,
          invoicesPaid:x.invoicesPaid,
          refundsPaid:x.refundsPaid
        }));
        case 'alerts': return r.alerts.map(a=>({
          date:a.date,
          type:a.type,
          net:a.net,
          invoicesPaid:a.invPaid,
          refundsPaid:a.refPaid,
          refundRate:a.refundRate,
          note:a.note
        }));
        default: return [];
      }
    })();

    // attempt to include the current reports page charts if they exist
    const rptCharts = ['chartByBranch','chartBySalesperson','chartTransactions'] // example ids
      .map(id=>document.getElementById(id))
      .filter(c=>c)
      .map(c=>({name:id,canvas:c}));
    await downloadXLSX(`report_${kind}.xlsx`, [{name: kind, rows}], {images: rptCharts});
  }

  // ---------------------------
  // Backup
  // ---------------------------
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

    await new Promise((resolve, reject) => {
      const tx = db.transaction('branches', 'readwrite');
      const os = tx.objectStore('branches');
      for(const b of branches){
        if(b && b.branchId != null) os.put(b);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const res = await addManyTransactions(txs, null);
    showAlert('success', `تمت الاستعادة. جديد: ${res.inserted}, مكرر: ${res.skipped}, أخطاء: ${res.errors}`, 8000);
    await refreshBranchesUI();
    await refreshDashboard();
  }

  // ---------------------------
  // Reports
  // ---------------------------
  let repSalesMS = null;

  function getReportsBaseFilters(){
    const fromISO = $('#repFrom')?.value || null;
    const toISO = $('#repTo')?.value || null;
    const branchId = $('#repBranch')?.value || 'all';
    const docType = $('#repType')?.value || 'all';
    const invoiceStatus = $('#repStatus')?.value || 'all';
    return { fromISO, toISO, branchId, docType, invoiceStatus };
  }

  async function refreshSalesOptionsForReports(){
    if(!repSalesMS) return;
    const all = await idbGetAll('transactions');
    const {fromISO, toISO, branchId, docType, invoiceStatus} = getReportsBaseFilters();
    const base = filterTransactions(all, fromISO, toISO, branchId, docType, null, invoiceStatus);
    const uniqueSales = Array.from(new Set(base.map(t => t.sales || '(غير محدد)')));
    uniqueSales.sort((a,b)=>a.localeCompare(b));
    repSalesMS.setOptions(uniqueSales);
  }

  async function runReports(){
    const all = await idbGetAll('transactions');

    const {fromISO, toISO, branchId, docType, invoiceStatus} = getReportsBaseFilters();

    // base (without employee filter) -> to populate options
    const base = filterTransactions(all, fromISO, toISO, branchId, docType, null, invoiceStatus);
    if(repSalesMS){
      const uniqueSales = Array.from(new Set(base.map(t => t.sales || '(غير محدد)')));
      uniqueSales.sort((a,b)=>a.localeCompare(b));
      repSalesMS.setOptions(uniqueSales);
      repSalesMS.close();
    }

    // apply employee filter
    const salesSet = repSalesMS ? repSalesMS.getSelectedSet() : null;
    const list = filterTransactions(all, fromISO, toISO, branchId, docType, (salesSet && salesSet.size>0) ? salesSet : null, invoiceStatus);

    const byBranch = aggByBranch(list);
    const bySales = aggBySalesperson(list);

    renderTableByBranch(byBranch);
    renderTableBySalesperson(bySales);

    // transactions table with search
    const q = ($('#txtSearchTx')?.value || '').trim().toLowerCase();
    const filtered = q ? list.filter(t => {
      return [t.docNo, t.customer, t.branchName, t.sales, t.sourceFileName]
        .filter(Boolean).some(x => String(x).toLowerCase().includes(q));
    }) : list;

    const show = filtered.slice(0, 500);
    renderTransactionsTable(show);

    // extra analytics
    const topCustomers = aggTopCustomers(list);
    renderTopCustomersTable('#tblRepTopCustomers', topCustomers, 15);

    const refRate = aggRefundRateByBranch(list);
    renderRefundRateReportChart('#chartRepRefundRate', '#chartRepRefundRateFallback', refRate);
    renderRefundRateTable('#tblRepRefundRate', refRate, 15);

    const monthly = aggMonthly(list);
    renderMonthlyReportChart('#chartRepMonthly', '#chartRepMonthlyFallback', monthly);
    renderMonthlyReportTable('#tblRepMonthly', monthly);

    const bestSales = aggBestSalesByBranch(list);
    renderBestSalesByBranchTable('#tblRepBestSalesByBranch', bestSales, 50);

    const alerts = buildAlerts(list);
    renderAlertsTable('#tblRepAlerts', alerts);

    // store latest datasets for download buttons
    window.__latestReports = { list, byBranch, bySales, filtered, topCustomers, refRate, monthly, bestSales, alerts, filters: {fromISO, toISO, branchId, docType, sales: salesSet ? Array.from(salesSet) : []} };
    
    // Add download buttons to charts
    setTimeout(injectChartDownloadButtons, 600);
  }

  // ---------------------------
  // Auth
  // ---------------------------
  function updateAuthButtons(){
    const loginBtn = $('#btnLogin');
    const logoutBtn = $('#btnLogout');
    if(!loginBtn || !logoutBtn) return;

    if(!AUTH.enabled()){
      loginBtn.textContent = 'تسجيل الدخول (معطل)';
      logoutBtn.classList.add('d-none');
      loginBtn.classList.remove('d-none');
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
    setActiveNav('dashboard');
    showAlert('warning','من فضلك سجّل دخول الأول (أو عطّل تسجيل الدخول من الإعدادات).', 7000);
    return false;
  }

  // ---------------------------
  // Analytics Module
  // ---------------------------
  function getAnalyticsFilters(){
    const fromISO = $('#analFrom')?.value || null;
    const toISO = $('#analTo')?.value || null;
    const branchId = $('#analBranch')?.value || 'all';
    return { fromISO, toISO, branchId };
  }

  async function refreshAnalytics(){
    const all = await idbGetAll('transactions');
    setDefaultDateRange(all);
    const {fromISO, toISO, branchId} = getAnalyticsFilters();
    const list = filterTransactions(all, fromISO, toISO, branchId, 'all', null, 'all');
    
    const enabledReports = Array.from($$('.analytics-toggle:checked')).map(el => el.value);
    let html = '';

    // Sales Performance Reports
    if(enabledReports.includes('sales-perf')){
      const byBranch = aggByBranch(list);
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">📈 Trend يومي/أسبوعي/شهري</div><div class="card-body"><div class="alert alert-info small">يعرض اتجاه المبيعات الصافية عبر الفترة المحددة</div><div class="row g-3"><div class="col-12 col-lg-6"><canvas id="chartTrendDaily" height="200"></canvas></div><div class="col-12 col-lg-6"><canvas id="chartTrendMonthly" height="200"></canvas></div></div></div></div>`;
    }

    // Top/Bottom Branches
    if(enabledReports.includes('top-bottom')){
      const byBranch = aggByBranch(list);
      const top5 = byBranch.slice(0, 5);
      const bottom5 = byBranch.slice(-5).reverse();
      let tableHtml = '<table class="table table-sm"><thead><tr><th>الفرع</th><th>صافي</th><th>فواتير</th><th>نسبة مرتجعات</th></tr></thead><tbody>';
      top5.forEach(b => {
        const refRate = b.invoicesCount > 0 ? ((b.refundCount / b.invoicesCount) * 100).toFixed(1) : 0;
        tableHtml += `<tr><td><strong>${b.branchName}</strong></td><td>${fmtNumber(b.net)}</td><td>${b.invoicesCount}</td><td>${refRate}%</td></tr>`;
      });
      tableHtml += '</tbody></table>';
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">🏆 أفضل 5 فروع</div><div class="card-body">${tableHtml}</div></div>`;
    }

    // Sales Mix
    if(enabledReports.includes('sales-mix')){
      const byBranch = aggByBranch(list);
      const total = byBranch.reduce((s,b) => s + b.net, 0);
      let tableHtml = '<table class="table table-sm"><thead><tr><th>الفرع</th><th>المبيعات</th><th>النسبة %</th></tr></thead><tbody>';
      byBranch.forEach(b => {
        const pct = total > 0 ? ((b.net / total) * 100).toFixed(1) : 0;
        tableHtml += `<tr><td>${b.branchName}</td><td>${fmtNumber(b.net)}</td><td><div class="progress"><div class="progress-bar" style="width:${pct}%">${pct}%</div></div></td></tr>`;
      });
      tableHtml += '</tbody></table>';
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">📊 توزيع المبيعات</div><div class="card-body">${tableHtml}</div></div>`;
    }

    // Refund Analytics
    if(enabledReports.includes('refund-trend')){
      const refRate = aggRefundRateByBranch(list);
      const avgRate = refRate.length > 0 ? refRate.reduce((s,r) => s + (r.refundRate || 0), 0) / refRate.length : 0;
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">🔄 نسبة المرتجعات</div><div class="card-body"><div class="alert alert-info">متوسط نسبة المرتجعات: <strong>${(avgRate * 100).toFixed(2)}%</strong></div><canvas id="chartRefundAnalytics" height="150"></canvas></div></div>`;
    }

    // Customer RFM
    if(enabledReports.includes('customer-rfm')){
      const customers = {};
      list.forEach(t => {
        if(!customers[t.customer]) {
          customers[t.customer] = { recency: null, frequency: 0, monetary: 0, lastDate: null };
        }
        customers[t.customer].frequency++;
        customers[t.customer].monetary += Number(t.paidAmount || 0);
        const tDate = txISODate(t);
        if(!customers[t.customer].lastDate || tDate > customers[t.customer].lastDate) {
          customers[t.customer].lastDate = tDate;
        }
      });
      const now = new Date();
      const rfmList = Object.entries(customers).map(([name, data]) => ({
        name,
        recency: data.lastDate ? Math.floor((now - new Date(data.lastDate)) / (1000*60*60*24)) : 999,
        frequency: data.frequency,
        monetary: data.monetary
      })).sort((a,b) => b.monetary - a.monetary).slice(0, 15);
      
      let tableHtml = '<table class="table table-sm"><thead><tr><th>العميل</th><th>آخر شراء (يوم)</th><th>عدد عمليات</th><th>إجمالي المدفوع</th></tr></thead><tbody>';
      rfmList.forEach(r => {
        tableHtml += `<tr><td>${r.name}</td><td>${r.recency} يوم</td><td>${r.frequency}</td><td>${fmtNumber(r.monetary)}</td></tr>`;
      });
      tableHtml += '</tbody></table>';
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">👥 تحليل العملاء (RFM)</div><div class="card-body">${tableHtml}</div></div>`;
    }

    // New vs Returning Customers
    if(enabledReports.includes('new-returning')){
      const customerFirstDate = {};
      list.forEach(t => {
        if(!customerFirstDate[t.customer]) {
          customerFirstDate[t.customer] = txISODate(t);
        } else {
          const tDate = txISODate(t);
          if(tDate < customerFirstDate[t.customer]) {
            customerFirstDate[t.customer] = tDate;
          }
        }
      });
      const periodStart = fromISO || Object.values(customerFirstDate).sort()[0];
      const newCount = Object.values(customerFirstDate).filter(d => d >= periodStart).length;
      const returningCount = Object.values(customerFirstDate).filter(d => d < periodStart).length;
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">🆕 عملاء جدد مقابل متكررين</div><div class="card-body"><div class="row g-3 text-center"><div class="col-6"><h4 class="text-success">${newCount}</h4><p class="small text-muted">عملاء جدد</p></div><div class="col-6"><h4 class="text-info">${returningCount}</h4><p class="small text-muted">عملاء متكررين</p></div></div></div></div>`;
    }

    // Pareto 80/20
    if(enabledReports.includes('pareto')){
      const customerSales = {};
      list.forEach(t => {
        if(!customerSales[t.customer]) customerSales[t.customer] = 0;
        customerSales[t.customer] += Number(t.paidAmount || 0);
      });
      const sorted = Object.entries(customerSales).map(([name, sales]) => ({name, sales})).sort((a,b) => b.sales - a.sales);
      const total = sorted.reduce((s,c) => s + c.sales, 0);
      let cumulative = 0;
      const top20 = [];
      for(let c of sorted){
        cumulative += c.sales;
        top20.push(c);
        if(cumulative >= total * 0.8) break;
      }
      const pct = ((top20.reduce((s,c) => s + c.sales, 0) / total) * 100).toFixed(1);
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">📈 Pareto 80/20</div><div class="card-body"><div class="alert alert-warning">أعلى ${top20.length} عميل يمثلون <strong>${pct}%</strong> من إجمالي المبيعات</div></div></div>`;
    }

    // Data Quality
    if(enabledReports.includes('data-quality')){
      const duplicates = new Set();
      const seen = new Set();
      let missingData = 0;
      list.forEach(t => {
        const key = `${t.docNo}-${t.branchId}`;
        if(seen.has(key)) duplicates.add(key);
        seen.add(key);
        if(!t.customer || !t.branchId || !t.paidAmount) missingData++;
      });
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">⚙️ جودة البيانات</div><div class="card-body"><div class="row g-3"><div class="col-6"><h5>${duplicates.size}</h5><p class="small text-muted">عمليات مكررة محتملة</p></div><div class="col-6"><h5>${missingData}</h5><p class="small text-muted">صفوف ناقصة بيانات</p></div></div></div></div>`;
    }

    // Discount Impact
    if(enabledReports.includes('discount-impact')){
      const totalDiscount = list.reduce((s,t) => s + (Number(t.discount || 0)), 0);
      const totalGross = list.reduce((s,t) => s + (Number(t.amount || 0)), 0);
      const discountRate = totalGross > 0 ? ((totalDiscount / totalGross) * 100).toFixed(2) : 0;
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">💰 تأثير الخصومات</div><div class="card-body"><div class="row g-3"><div class="col-6"><h5>${fmtNumber(totalDiscount)}</h5><p class="small text-muted">إجمالي الخصومات</p></div><div class="col-6"><h5>${discountRate}%</h5><p class="small text-muted">نسبة من الإجمالي</p></div></div></div></div>`;
    }

    // Average Ticket Size
    if(enabledReports.includes('avg-ticket')){
      const invoices = list.filter(t => t.docType === 'invoice');
      const avgTicket = invoices.length > 0 ? invoices.reduce((s,t) => s + Number(t.paidAmount || 0), 0) / invoices.length : 0;
      html += `<div class="card mb-4"><div class="card-header bg-white fw-bold">🎫 متوسط حجم الفاتورة</div><div class="card-body"><div class="alert alert-info"><strong>${fmtNumber(avgTicket)}</strong> ريال (متوسط الفاتورة الواحدة)</div></div></div>`;
    }

    $('#analyticsContent').innerHTML = html;
  }

  // ---------------------------
  // Boot
  // ---------------------------
  async function boot(){
    await dbInit();

    // libs status badge
    const st = libsStatus();
    if(!st.hasXLSX || !st.hasChart) $('#badgeOfflineLib')?.classList.remove('d-none');

    // nav
    $$('[data-nav]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        const page = a.getAttribute('data-nav');
        if(page !== 'settings' && page !== 'dashboard' && !enforceAuth()) return;
        setActiveNav(page);
        if(page === 'dashboard') refreshDashboard();
        if(page === 'reports'){
          refreshSalesOptionsForReports();
        }
        if(page === 'analytics'){
          // Branches may not be in a global variable; fetch from IndexedDB each time
          idbGetAll('branches').then(bs => fillBranchSelect($('#analBranch'), bs));
          idbGetAll('transactions').then(all => setDefaultDateRange(all));
        }
        if(page === 'settings'){
          // when settings is shown we also want to update the data-summary
          updateDataSection();
        }
      });
    });

    // analytics actions
    $('#btnRefreshAnalytics')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      refreshAnalytics();
    });

    ['analFrom','analTo','analBranch'].forEach(id=>{
      $('#'+id)?.addEventListener('change', ()=>{
        if($('#analyticsContent').innerHTML.includes('تحميل التحليلات')) return;
        refreshAnalytics();
      });
    });

    // auth settings init
    if($('#chkAuthEnabled')){
      $('#chkAuthEnabled').checked = AUTH.enabled();
      $('#chkAuthEnabled').addEventListener('change', ()=>{
        AUTH.setEnabled($('#chkAuthEnabled').checked);
        if(!AUTH.enabled()) AUTH.logout();
        updateAuthButtons();
        showAlert('info', AUTH.enabled() ? 'تم تفعيل تسجيل الدخول.' : 'تم تعطيل تسجيل الدخول.');
      });
    }

    $('#btnResetAuth')?.addEventListener('click', ()=>{
      AUTH.reset();
      showAlert('info','تمت إعادة ضبط بيانات الدخول. افتح نافذة تسجيل الدخول لإنشاء بيانات جديدة.');
      updateAuthButtons();
    });

    // login modal
    const modalEl = $('#loginModal');
    const modal = modalEl ? new bootstrap.Modal(modalEl) : null;

    $('#btnLogin')?.addEventListener('click', ()=>{
      if(!AUTH.enabled()){
        showAlert('info','تسجيل الدخول معطل. يمكنك تفعيله من الإعدادات.');
        setActiveNav('settings');
        return;
      }
      $('#loginMsg').textContent = '';
      $('#loginUser').value = localStorage.getItem('auth_user') || '';
      $('#loginPass').value = '';
      modal?.show();
    });

    $('#btnDoLogin')?.addEventListener('click', async ()=>{
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
          setTimeout(()=>modal?.hide(), 600);
          return;
        }

        const ok = await AUTH.check(user, pass);
        if(ok){
          AUTH.setLoggedIn();
          msg.classList.add('text-success');
          msg.textContent = 'تم تسجيل الدخول.';
          updateAuthButtons();
          setTimeout(()=>modal?.hide(), 400);
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

    $('#btnLogout')?.addEventListener('click', ()=>{
      AUTH.logout();
      updateAuthButtons();
      showAlert('info','تم تسجيل الخروج.');
    });

    // upload
    $('#btnImport')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      doImport();
    });
    $('#btnClearFiles')?.addEventListener('click', ()=>{
      $('#fileInput').value = '';
      $('#importSummary').innerHTML = '';
      updateProgress(0,1);
    });
    $('#btnDownloadTemplateInfo')?.addEventListener('click', downloadTemplateInfo);

    // dashboard actions
    $('#btnRefreshDash')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      refreshDashboard();
    });
    $('#btnPrintDash')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      printPage('dashboard');
    });
    $('#btnDownloadDash')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      downloadDashCSV();
    });
    $('#btnDownloadDashXlsx')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      showExportDialog();
    });

    // reports actions
    $('#btnRunReports')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      runReports();
    });

    $('#btnPrintReports')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      printPage('reports');
    });

    $('#txtSearchTx')?.addEventListener('input', ()=>{
      if(!enforceAuth()) return;
      runReports();
    });

    // extra: refresh employee options when filters change
    ['repFrom','repTo','repBranch','repType','repStatus'].forEach(id=>{
      $('#'+id)?.addEventListener('change', ()=>{
        refreshSalesOptionsForReports();
      });
    });

    // CSV buttons
    $$('[data-dl]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(!enforceAuth()) return;
        downloadReport(btn.getAttribute('data-dl'));
      });
    });

    // XLSX buttons
    $$('[data-dl-xlsx]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(!enforceAuth()) return;
        downloadReportXlsx(btn.getAttribute('data-dl-xlsx'));
      });
    });

    // backup
    $('#btnExportBackup')?.addEventListener('click', ()=>{
      if(!enforceAuth()) return;
      exportBackup();
    });
    $('#btnImportBackup')?.addEventListener('click', async ()=>{
      if(!enforceAuth()) return;
      const file = $('#backupInput')?.files?.[0];
      if(!file){ showAlert('warning','اختَر ملف Backup .json'); return; }
      try{ await importBackupFile(file); }
      catch(err){ console.error(err); showAlert('danger','فشل استعادة الـ Backup: ' + (err.message||err)); }
    });

    // wipe all
    // compatibility: old button id used to be btnWipeAll, new id is btnClearAllData
    const clearBtn = $('#btnClearAllData') || $('#btnWipeAll');
    clearBtn?.addEventListener('click', async ()=>{
      if(!enforceAuth()) return;
      if(!confirm('تأكيد: حذف كل البيانات المحلية؟')) return;
      await wipeAll();
      showAlert('success','تم حذف البيانات.');
      await refreshBranchesUI();
      await refreshDashboard();
      await updateDataSection();
    });

    // init
    await refreshBranchesUI();

    // init multi-select
    repSalesMS = createSalesMultiSelect();

    updateAuthButtons();

    const all = await idbGetAll('transactions');
    setDefaultDateRange(all);
    await refreshDashboard();

    setActiveNav('dashboard');

    // default auth enabled ON (first run)
    if(localStorage.getItem('auth_enabled') === null){
      AUTH.setEnabled(true);
      if($('#chkAuthEnabled')) $('#chkAuthEnabled').checked = true;
    }
    updateAuthButtons();
  }

  window.addEventListener('load', ()=>{
    boot().catch(err=>{
      console.error(err);
      showAlert('danger','تعذر تشغيل التطبيق: ' + (err.message||err), 10000);
    });
  });

// ---------------------------
// Data section helpers (inside IIFE to access idbGetAll)
// ---------------------------
// populate statistics and branch list inside settings (merged data page)
async function updateDataSection(){
  const all = await idbGetAll('transactions');
  
  // Storage Size
  if(navigator.storage && navigator.storage.estimate){
    try {
      const est = await navigator.storage.estimate();
      const mb = (est.usage / (1024*1024)).toFixed(2);
      const el = $('#statStorage');
      if(el) el.textContent = mb + ' MB';
    } catch(e){ console.error(e); }
  }

  // simple counts
  $('#statTransactions').textContent = all.length;
  $('#statBranches').textContent = new Set(all.map(t=>t.branchId)).size;
  $('#statSales').textContent = new Set(all.map(t=>t.sales||'(غير محدد)')).size;
  $('#statCustomers').textContent = new Set(all.map(t=>t.customer||'(غير محدد)')).size;
  const elTx = $('#statTransactions'); if(elTx) elTx.textContent = all.length;
  const elBr = $('#statBranches'); if(elBr) elBr.textContent = new Set(all.map(t=>t.branchId)).size;
  const elSa = $('#statSales'); if(elSa) elSa.textContent = new Set(all.map(t=>t.sales||'(غير محدد)')).size;
  const elCu = $('#statCustomers'); if(elCu) elCu.textContent = new Set(all.map(t=>t.customer||'(غير محدد)')).size;

  // branch summary table
  const tbody = $('#tblAllBranches tbody');
  if(tbody){
    tbody.innerHTML = '';
    const agg = {};
    all.forEach(t=>{
      const id = t.branchId || '(غير محدد)';
      const name = t.branchName || id;
      if(!agg[id]) agg[id] = {name, count:0, net:0};
      agg[id].count++;
      agg[id].net += Number(t.net) || 0;
      agg[id].net += netValue(t);
    });
    Object.values(agg).forEach(b=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${b.name}</td><td>${b.count}</td><td>${fmtNumber(b.net)}</td>`;
      tbody.appendChild(tr);
    });
  }

  // Inject Developer Info if not present
  const settingsPage = $('#page-settings');
  if(settingsPage && !document.getElementById('devInfoCard')){
    const div = document.createElement('div');
    div.id = 'devInfoCard';
    div.className = 'card mt-4 mb-4 fade-in-up';
    div.innerHTML = `
      <div class="card-header bg-white fw-bold">ℹ️ عن النظام والمطور</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <h6 class="text-primary mb-3">معلومات المطور</h6>
            <p class="mb-2"><strong>تطوير:</strong> Ahmed Elsawi</p>
            <p class="mb-2"><strong>الدعم الفني:</strong> ahmedmalsawi@gmail.com</p>
          </div>
          <div class="col-md-6">
            <h6 class="text-primary mb-3">معلومات النسخة</h6>
            <p class="mb-2"><strong>الإصدار:</strong> v2.5.0 (Premium)</p>
            <p class="mb-2"><strong>تاريخ التحديث:</strong> March 2026</p>
            <p class="mb-0"><strong>الترخيص:</strong> Golden Cala</p>
          </div>
        </div>
        <hr class="my-3">
        <div class="text-center text-muted small">
          &copy; 2026 Ahmed Elsawi. جميع الحقوق محفوظة.
        </div>
      </div>
    `;
    settingsPage.appendChild(div);
  }
}

})();
