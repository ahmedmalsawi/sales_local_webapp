/* Golden Cala Sales Analytics - Filtering & aggregation */
(function(){
  'use strict';
  const GC = window.GC || (window.GC = {});
  const groupBy = GC.groupBy;
  const fmtNumber = GC.fmtNumber;
  const fmtPercent = GC.fmtPercent;
  const monthKeyFromISODate = GC.monthKeyFromISODate;

  /** تاريخ المعاملة للتقرير: من عمود تاريخ العمل في الملف فقط (لا يُستخدم Create Date) */
  function txISODate(t){
    return t.businessDate || null;
  }

  function filterTransactions(all, fromISO, toISO, branchId, docType, salesSet, invoiceStatus){
    return all.filter(t => {
      const d = txISODate(t);
      if(fromISO || toISO){ if(!d) return false; }
      if(fromISO && d < fromISO) return false;
      if(toISO && d > toISO) return false;
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

    /** صافي المبيعات = اجمالي الفواتير - اجمالي الخصومات - اجمالي المرتجعات */
    const net = invGross - invDisc - refGross;
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
      .map(x => ({...x, type:'مرتجعات عالية', note:`Refund% ${fmtPercent(x.refundRate)} (مرتجعات ${fmtNumber(x.refPaid)})`}));

    const lowSales = [...daily]
      .sort((a,b)=>a.net-b.net)
      .slice(0, 10)
      .map(x => ({...x, type:'مبيعات منخفضة', note:`أقل الأيام (صافي ${fmtNumber(x.net)})`}));

    const seen = new Set();
    const merged = [];
    for(const x of [...highRefund, ...lowSales]){
      const key = `${x.date}|${x.type}`;
      if(seen.has(key)) continue;
      seen.add(key);
      merged.push(x);
    }
    merged.sort((a,b)=>b.date.localeCompare(a.date));
    return merged;
  }

  GC.core = GC.core || {};
  GC.core.txISODate = txISODate;
  GC.core.filterTransactions = filterTransactions;
  GC.core.netValue = netValue;
  GC.core.computeKPIs = computeKPIs;
  GC.core.aggByBranch = aggByBranch;
  GC.core.aggRefundRateByBranch = aggRefundRateByBranch;
  GC.core.aggBySalesperson = aggBySalesperson;
  GC.core.aggDailyNet = aggDailyNet;
  GC.core.aggDailyDetails = aggDailyDetails;
  GC.core.aggMonthly = aggMonthly;
  GC.core.aggTopCustomers = aggTopCustomers;
  GC.core.aggBestSalesByBranch = aggBestSalesByBranch;
  GC.core.buildAlerts = buildAlerts;
})();
