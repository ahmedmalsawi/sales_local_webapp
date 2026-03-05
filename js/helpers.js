/* Golden Cala Sales Analytics - Helpers (shared) */
(function(){
  'use strict';
  const GC = window.GC || (window.GC = {});

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
    div.setAttribute('role', 'alert');
    div.setAttribute('aria-live', 'polite');
    div.innerHTML = `
      <div class="small">${msg}</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="إغلاق"></button>
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
        el.offsetHeight;
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
    if(iso.length >= 7) return iso.slice(0,7);
    return null;
  }

  GC.$ = $;
  GC.$$ = $$;
  GC.fmtNumber = fmtNumber;
  GC.fmtMoney = fmtMoney;
  GC.fmtPercent = fmtPercent;
  GC.toISODate = toISODate;
  GC.toISODateTime = toISODateTime;
  GC.showAlert = showAlert;
  GC.showLoadingState = showLoadingState;
  GC.withLoadingSpinner = withLoadingSpinner;
  GC.animatePageTransition = animatePageTransition;
  GC.downloadBlob = downloadBlob;
  GC.downloadText = downloadText;
  GC.loadScript = loadScript;
  GC.toCSV = toCSV;
  GC.groupBy = groupBy;
  GC.monthKeyFromISODate = monthKeyFromISODate;
})();
