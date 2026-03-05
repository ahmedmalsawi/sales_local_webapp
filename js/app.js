/* Sales Local Web App
   - Uses GC modules: helpers, db, auth, excel, core
   - Dashboard, reports, analytics, boot
*/

(function(){
  'use strict';

  const $ = GC.$;
  const $$ = GC.$$;
  const fmtNumber = GC.fmtNumber;
  const fmtMoney = GC.fmtMoney;
  const fmtPercent = GC.fmtPercent;
  const toISODate = GC.toISODate;
  const toISODateTime = GC.toISODateTime;
  const showAlert = GC.showAlert;
  const showLoadingState = GC.showLoadingState;
  const withLoadingSpinner = GC.withLoadingSpinner;
  const animatePageTransition = GC.animatePageTransition;
  const downloadBlob = GC.downloadBlob;
  const downloadText = GC.downloadText;
  const loadScript = GC.loadScript;
  const toCSV = GC.toCSV;
  const groupBy = GC.groupBy;
  const monthKeyFromISODate = GC.monthKeyFromISODate;

  const AUTH = GC.auth.AUTH;
  const idbGetAll = GC.db.idbGetAll;
  const idbClearStore = GC.db.idbClearStore;
  const wipeAll = GC.db.wipeAll;
  const upsertBranchesFromRecords = GC.db.upsertBranchesFromRecords;
  const addManyTransactions = GC.db.addManyTransactions;
  const getDb = GC.db.getDb;

  const libsStatus = GC.excel.libsStatus;
  const parseExcelFile = GC.excel.parseExcelFile;

  const txISODate = GC.core.txISODate;
  const filterTransactions = GC.core.filterTransactions;
  const netValue = GC.core.netValue;
  const computeKPIs = GC.core.computeKPIs;
  const aggByBranch = GC.core.aggByBranch;
  const aggRefundRateByBranch = GC.core.aggRefundRateByBranch;
  const aggBySalesperson = GC.core.aggBySalesperson;
  const aggDailyDetails = GC.core.aggDailyDetails;
  const aggMonthly = GC.core.aggMonthly;
  const aggTopCustomers = GC.core.aggTopCustomers;
  const aggBestSalesByBranch = GC.core.aggBestSalesByBranch;
  const buildAlerts = GC.core.buildAlerts;

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
    const totalDiscount = (k.invDisc || 0) + (k.refDisc || 0);
    const totalPaid = (k.invPaid || 0) + (k.refPaid || 0);
    // ترتيب من اليمين لليسار: الصف الأول ثم الصف الثاني
    const row1 = [
      {title:'اجمالي الفواتير', value: numSpan(fmtMoney(k.invGross)), icon:'📄'},
      {title:'اجمالي الخصومات', value: numSpan(fmtMoney(totalDiscount)), icon:'🏷️'},
      {title:'اجمالي المرتجعات', value: numSpan(fmtMoney(k.refGross)), icon:'↩️'},
      {title:'صافي المبيعات', value: numSpan(fmtMoney(k.net)), icon:'💰'},
    ];
    const row2 = [
      {title:'اجمالي المدفوعات', value: numSpan(fmtMoney(totalPaid)), icon:'💵'},
      {title:'عدد الفواتير', value: numSpan(fmtNumber(k.invCount)), icon:'📊'},
      {title:'عدد المرتجعات', value: numSpan(fmtNumber(k.refCount)), icon:'📉'},
      {title:'متوسط الفاتورة', value: numSpan(fmtMoney(k.avgTicket)), icon:'📈'},
    ];
    function makeCard(c){
      return `
        <div class="card kpi-card p-3 fade-in-up">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--spacing-md);">
            <div class="kpi-title">${c.title}</div>
            <span style="font-size:1.5rem; opacity:0.6;">${c.icon}</span>
          </div>
          <div class="kpi-value">${c.value}</div>
        </div>
      `;
    }
    host.innerHTML = `
      <div class="col-12"><div class="row g-4 mb-0 mb-lg-4">
        ${row1.map(c=>`<div class="col-12 col-sm-6 col-lg-3">${makeCard(c)}</div>`).join('')}
      </div></div>
      <div class="col-12"><div class="row g-4">
        ${row2.map(c=>`<div class="col-12 col-sm-6 col-lg-3">${makeCard(c)}</div>`).join('')}
      </div></div>
    `;
  }

  let chartDaily = null;
  let chartBranches = null;
  let chartBranchesCircle = null;
  let chartMonthly = null;
  let chartRefundRate = null;

  let chartRepMonthly = null;
  let chartRepRefundRate = null;

  /* Golden Cala chart palette */
  const CHART = {
    navy: 'rgba(26, 58, 82, 0.9)',
    navyFill: 'rgba(26, 58, 82, 0.12)',
    gold: 'rgba(212, 175, 55, 0.9)',
    goldFill: 'rgba(212, 175, 55, 0.12)',
    emerald: 'rgba(45, 106, 79, 0.9)',
    emeraldFill: 'rgba(45, 106, 79, 0.12)',
    rose: 'rgba(214, 79, 110, 0.9)',
    roseFill: 'rgba(214, 79, 110, 0.12)',
    palette: ['rgba(26, 58, 82, 0.9)', 'rgba(212, 175, 55, 0.9)', 'rgba(45, 106, 79, 0.9)', 'rgba(214, 79, 110, 0.9)', 'rgba(45, 90, 120, 0.9)', 'rgba(180, 140, 50, 0.9)', 'rgba(139, 92, 246, 0.8)', 'rgba(236, 72, 153, 0.8)']
  };

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
    can.setAttribute('role', 'img');
    can.setAttribute('aria-label', 'رسم بياني: صافي المبيعات والمرتجعات اليومية');
    chartDaily = new Chart(can, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات',
          data: dataSales,
          borderColor: CHART.emerald,
          backgroundColor: CHART.emeraldFill,
          fill: true,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: CHART.emerald,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4
        }, {
          label: 'المرتجعات',
          data: dataReturns,
          borderColor: CHART.rose,
          backgroundColor: CHART.roseFill,
          fill: true,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: CHART.rose,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4
        }]
      },
      options: getPremiumChartOptions('line')
    });
  }

  /** Plugin: draw value labels on top of bar chart segments (grouped or single). */
  function barValueLabelsPlugin(fmt){
    const formatter = typeof fmt === 'function' ? fmt : (v) => String(v);
    return {
      id: 'barValueLabels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const top = chart.chartArea.top;
        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (!meta || meta.type !== 'bar') return;
          const data = dataset.data || [];
          meta.data.forEach((bar, index) => {
            const value = data[index];
            if (value == null || value === '') return;
            const label = formatter(Number(value));
            const x = bar.x;
            const barTop = Math.min(bar.y, bar.base);
            const labelY = barTop - 6;
            if (labelY < top) return;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = 'rgba(255,255,255,0.9)';
            ctx.shadowBlur = 2;
            ctx.font = '600 10px Tajawal, sans-serif';
            ctx.fillStyle = '#1f2937';
            ctx.fillText(label, x, labelY);
            ctx.restore();
          });
        });
      }
    };
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
    can.setAttribute('role', 'img');
    can.setAttribute('aria-label', 'رسم بياني: أفضل الفروع بالمبيعات والمرتجعات');
    const barOptions = getPremiumChartOptions('bar');
    chartBranches = new Chart(can, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات',
          data: dataSales,
          backgroundColor: CHART.navy,
          borderRadius: 6,
          borderSkipped: false
        }, {
          label: 'المرتجعات',
          data: dataReturns,
          backgroundColor: CHART.rose,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        ...barOptions,
        layout: { padding: { top: 28, bottom: 8, left: 8, right: 8 } }
      },
      plugins: [barValueLabelsPlugin(fmtMoney)]
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
    can.setAttribute('role', 'img');
    can.setAttribute('aria-label', 'رسم بياني: المقارنة الشهرية للمبيعات والمرتجعات');
    chartMonthly = new Chart(can, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات',
          data: dataSales,
          backgroundColor: CHART.gold,
          borderRadius: 6,
          borderSkipped: false
        }, {
          label: 'المرتجعات',
          data: dataReturns,
          backgroundColor: CHART.rose,
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
    can.setAttribute('role', 'img');
    can.setAttribute('aria-label', 'رسم بياني: نسبة المرتجعات حسب الفرع');
    chartRefundRate = new Chart(can, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'معدل المرتجعات %',
          data,
          backgroundColor: CHART.rose,
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

    const colors = CHART.palette;

    if(chartBranchesCircle) chartBranchesCircle.destroy();
    can.setAttribute('role', 'img');
    can.setAttribute('aria-label', 'رسم دائري: توزيع المبيعات حسب الفرع');
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
        layout: { padding: { top: 8, bottom: 8, left: 8, right: 8 } },
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
          }
        }
      },
      plugins: [{
        id: 'doughnutSegmentLabels',
        afterDraw(chart) {
          const dataset = chart.data.datasets[0];
          if (!dataset || !dataset.data || !chart.chartArea) return;
          const values = dataset.data;
          const total = values.reduce((a, b) => a + Number(b), 0);
          if (total <= 0) return;
          const meta = chart.getDatasetMeta(0);
          if (!meta || !meta.data.length) return;
          const ctx = chart.ctx;
          const cx = (chart.chartArea.left + chart.chartArea.right) / 2;
          const cy = (chart.chartArea.top + chart.chartArea.bottom) / 2;
          const radius = Math.min(chart.chartArea.right - chart.chartArea.left, chart.chartArea.bottom - chart.chartArea.top) / 2;
          const labelRadius = radius * 0.7;
          meta.data.forEach((arc, index) => {
            const value = Number(values[index]) || 0;
            const pct = ((value / total) * 100).toFixed(1);
            const shortLabel = (chart.data.labels[index] || '').toString().split('-').slice(1).join('-').trim() || chart.data.labels[index];
            const midAngle = (arc.startAngle + arc.endAngle) / 2 - Math.PI / 2;
            const x = cx + Math.cos(midAngle) * labelRadius;
            const y = cy + Math.sin(midAngle) * labelRadius;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Tajawal, sans-serif';
            ctx.fillText(shortLabel, x, y - 10);
            ctx.font = '11px Tajawal, sans-serif';
            ctx.fillText(fmtNumber(value), x, y + 2);
            ctx.fillText('(' + pct + '%)', x, y + 14);
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

  function renderReportTotalsSummary(list){
    const el = $('#reportTotalsSummary');
    if (!el) return;
    if (!list || list.length === 0) {
      el.innerHTML = '';
      el.classList.add('d-none');
      return;
    }
    const k = computeKPIs(list);
    const amountTotal = (k.invGross || 0) + (k.refGross || 0);
    const discountTotal = (k.invDisc || 0) + (k.refDisc || 0);
    el.classList.remove('d-none');
    el.innerHTML = `
      <span><strong>Amount total:</strong> ${numSpan(fmtMoney(amountTotal))}</span>
      <span><strong>Discount total:</strong> ${numSpan(fmtMoney(discountTotal))}</span>
      <span><strong>Refund Total:</strong> ${numSpan(fmtMoney(k.refPaid))}</span>
      <span><strong>Net:</strong> ${numSpan(fmtMoney(k.net))}</span>
      <span><strong>Total Paid:</strong> ${numSpan(fmtMoney((k.invPaid || 0) + (k.refPaid || 0)))}</span>
    `;
  }

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
          backgroundColor: CHART.navy,
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
          backgroundColor: CHART.rose,
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
    const wrap = $('#dashContentWrap');
    const loadingEl = $('#dashLoading');
    const emptyEl = $('#dashEmptyState');
    if (loadingEl) loadingEl.classList.remove('d-none');
    if (emptyEl) emptyEl.classList.add('d-none');

    const all = await idbGetAll('transactions');
    setDefaultDateRange(all);

    const fromISO = $('#dashFrom')?.value || null;
    const toISO = $('#dashTo')?.value || null;
    const branchId = $('#dashBranch')?.value || 'all';
    const invoiceStatus = $('#dashStatus')?.value || 'all';

    const list = filterTransactions(all, fromISO, toISO, branchId, 'all', null, invoiceStatus);

    if (!list.length) {
      showAlert('info', 'لا توجد بيانات للفترة أو الفرع المحدد. غيّر الفلتر أو استورد ملف Excel من صفحة استيراد البيانات.', 8000);
      if (emptyEl) emptyEl.classList.remove('d-none');
    } else if (emptyEl) {
      emptyEl.classList.add('d-none');
    }

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

    if (loadingEl) loadingEl.classList.add('d-none');
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
    const importSummaryEl = $('#importSummary');
    if (importSummaryEl) importSummaryEl.innerHTML = '';

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

        let msg = `تم استيراد "${f.name}" — جديد: ${res.inserted}, مكرر: ${res.skipped}, أخطاء: ${res.errors}`;
        if (parsed.validationSummary && parsed.validationSummary.skipped > 0) {
          msg += ` (تم تجاهل ${parsed.validationSummary.skipped} صف غير صالح أو رأس)`;
        }
        if (parsed.records.length === 0) {
          showAlert('warning', `الملف "${f.name}" لم يُستخرج منه أي صفوف صالحة. تحقق من الأعمدة (Invoice/Refund, Business Date, Store).`, 8000);
        } else {
          showAlert('success', msg, 7000);
        }
      }catch(err){
        console.error(err);
        showAlert('danger', `فشل استيراد "${f.name}": ${err.message || err}`);
      }
    }

    renderPreview(previewRecords);
    await refreshBranchesUI();
    await refreshDashboard();

    if (importSummaryEl) importSummaryEl.innerHTML = `
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

    const db = getDb();
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
    renderReportTotalsSummary(list);
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
  // Auth & gate
  // ---------------------------
  function showGate(){
    const gate = $('#appGate');
    const main = $('#appMain');
    if (gate) gate.classList.remove('d-none');
    if (main) main.classList.add('d-none');
  }

  function showApp(){
    const gate = $('#appGate');
    const main = $('#appMain');
    if (gate) gate.classList.add('d-none');
    if (main) main.classList.remove('d-none');
  }

  function applyNavByRole(){
    const settingsNav = document.querySelector('.nav-item-settings');
    const editNav = document.querySelector('.nav-item-edit');
    if (settingsNav) settingsNav.style.display = AUTH.canAccessSettings() ? '' : 'none';
    if (editNav) editNav.style.display = AUTH.canEdit() ? '' : 'none';
  }

  function updateAuthButtons(){
    const badge = $('#navUserBadge');
    const logoutBtn = $('#btnLogout');
    if (badge && AUTH.isLoggedIn()) {
      const { username, role } = AUTH.getCurrentUser();
      const roleLabel = { viewer: 'عرض فقط', editor: 'تعديل', admin: 'مدير', superadmin: 'مدير أعلى' }[role] || role;
      badge.textContent = `${username} | ${roleLabel}`;
      badge.classList.remove('d-none');
    } else if (badge) badge.classList.add('d-none');
    if (logoutBtn) logoutBtn.classList.toggle('d-none', !AUTH.isLoggedIn());
  }

  function enforceAuth(){
    if (AUTH.isLoggedIn()) return true;
    showGate();
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
        const refRate = b.invoicesCount > 0 ? ((b.refundsCount / b.invoicesCount) * 100).toFixed(1) : 0;
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

    // Draw analytics charts after DOM is updated (dynamic canvases)
    if (typeof Chart !== 'undefined') {
      if (enabledReports.includes('sales-perf')) {
        const daily = aggDailyDetails(list);
        const monthly = aggMonthly(list);
        const canDaily = document.getElementById('chartTrendDaily');
        const canMonthly = document.getElementById('chartTrendMonthly');
        if (canDaily && daily.length) {
          new Chart(canDaily, {
            type: 'line',
            data: {
              labels: daily.map(x => x.date),
              datasets: [{ label: 'صافي المبيعات', data: daily.map(x => x.net), borderColor: CHART.navy, backgroundColor: CHART.navyFill, fill: true, tension: 0.4 }]
            },
            options: { responsive: true, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => fmtNumber(v) } } }, plugins: { legend: { display: true }, tooltip: { callbacks: { label: ctx => fmtNumber(ctx.parsed.y) } } } }
          });
        }
        if (canMonthly && monthly.length) {
          new Chart(canMonthly, {
            type: 'bar',
            data: {
              labels: monthly.map(x => x.month),
              datasets: [{ label: 'صافي شهري', data: monthly.map(x => x.net), backgroundColor: CHART.gold, borderRadius: 6 }]
            },
            options: { responsive: true, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => fmtNumber(v) } } }, plugins: { legend: { display: true } } }
          });
        }
      }
      if (enabledReports.includes('refund-trend')) {
        const refRate = aggRefundRateByBranch(list);
        const canRefund = document.getElementById('chartRefundAnalytics');
        if (canRefund && refRate.length) {
          const top = refRate.filter(x => x.refundRate !== null).slice(0, 8);
          new Chart(canRefund, {
            type: 'bar',
            data: {
              labels: top.map(x => `${x.branchId}-${x.branchName}`),
              datasets: [{ label: 'معدل المرتجعات %', data: top.map(x => Number((x.refundRate || 0) * 100)), backgroundColor: CHART.rose, borderRadius: 6 }]
            },
            options: { responsive: true, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v + '%' } } }, plugins: { legend: { display: true } } }
          });
        }
      }
    }
  }

  // ---------------------------
  // Boot
  // ---------------------------
  async function boot(){
    await GC.db.dbInit();
    await AUTH.seedDefaultAdmin();

    if (!AUTH.isLoggedIn()) {
      showGate();
      const form = $('#gateLoginForm');
      const gateMsg = $('#gateMsg');
      const gateBtn = $('#gateBtnLogin');
      if (form) {
        form.addEventListener('submit', async (e)=>{
          e.preventDefault();
          const user = ($('#gateUser').value || '').trim();
          const pass = $('#gatePass').value || '';
          if (gateMsg) gateMsg.textContent = '';
          if (!user || !pass) {
            if (gateMsg) { gateMsg.textContent = 'أدخل اسم المستخدم وكلمة المرور'; gateMsg.classList.add('text-danger'); }
            return;
          }
          if (gateBtn) gateBtn.disabled = true;
          try {
            const result = await AUTH.login(user, pass);
            if (result.ok) {
              showApp();
              applyNavByRole();
              updateAuthButtons();
              setActiveNav('dashboard');
              await refreshBranchesUI();
              const all = await idbGetAll('transactions');
              setDefaultDateRange(all);
              await refreshDashboard();
            } else {
              if (gateMsg) { gateMsg.textContent = result.message || 'بيانات الدخول غير صحيحة'; gateMsg.classList.add('text-danger'); }
            }
          } catch (err) {
            if (gateMsg) { gateMsg.textContent = err.message || 'خطأ في تسجيل الدخول'; gateMsg.classList.add('text-danger'); }
          }
          if (gateBtn) gateBtn.disabled = false;
        });
      }
      return;
    }

    showApp();
    const st = libsStatus();
    if(!st.hasXLSX || !st.hasChart) $('#badgeOfflineLib')?.classList.remove('d-none');

    applyNavByRole();

    // nav
    $$('[data-nav]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        const page = a.getAttribute('data-nav');
        if (page === 'settings' && !AUTH.canAccessSettings()) { setActiveNav('dashboard'); refreshDashboard(); return; }
        if (page === 'upload' && !AUTH.canEdit()) { setActiveNav('dashboard'); refreshDashboard(); return; }
        setActiveNav(page);
        if(page === 'dashboard') refreshDashboard();
        if(page === 'reports') refreshSalesOptionsForReports();
        if(page === 'analytics'){
          idbGetAll('branches').then(bs => fillBranchSelect($('#analBranch'), bs));
          idbGetAll('transactions').then(all => setDefaultDateRange(all));
        }
        if(page === 'settings'){
          updateDataSection();
          const restricted = $('#settingsUserMgmtRestricted');
          const content = $('#settingsUserMgmtContent');
          if (AUTH.isSuperAdmin()) {
            if (restricted) restricted.classList.add('d-none');
            if (content) content.classList.remove('d-none');
            renderUsersTable();
          } else {
            if (restricted) restricted.classList.remove('d-none');
            if (content) content.classList.add('d-none');
          }
        }
      });
    });

    $('#btnRefreshAnalytics')?.addEventListener('click', ()=>{ refreshAnalytics(); });
    ['analFrom','analTo','analBranch'].forEach(id=>{
      $('#'+id)?.addEventListener('change', ()=>{
        if($('#analyticsContent').innerHTML.includes('تحميل التحليلات')) return;
        refreshAnalytics();
      });
    });

    $('#btnLogout')?.addEventListener('click', ()=>{
      AUTH.logout();
      showGate();
      updateAuthButtons();
      showAlert('info','تم تسجيل الخروج.');
    });

    // Login modal form: prevent submit (password field must be in a form for browser/PM)
    $('#loginModalForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); });

    // upload (editor+ only)
    ($('#btnImportFile') || $('#btnImport'))?.addEventListener('click', ()=>{
      if(!AUTH.canEdit()) return;
      doImport();
    });
    $('#btnClearFiles')?.addEventListener('click', ()=>{
      $('#fileInput').value = '';
      const el = $('#importSummary');
      if (el) el.innerHTML = '';
      updateProgress(0,1);
    });
    $('#btnDownloadTemplateInfo')?.addEventListener('click', downloadTemplateInfo);

    $('#btnRefreshDash')?.addEventListener('click', ()=> refreshDashboard());
    $('#btnPrintDash')?.addEventListener('click', ()=> printPage('dashboard'));
    $('#btnDownloadDash')?.addEventListener('click', ()=> downloadDashCSV());
    $('#btnDownloadDashXlsx')?.addEventListener('click', ()=> showExportDialog());
    $('#btnRunReports')?.addEventListener('click', ()=> runReports());
    $('#btnPrintReports')?.addEventListener('click', ()=> printPage('reports'));
    $('#txtSearchTx')?.addEventListener('input', ()=> runReports());

    // extra: refresh employee options when filters change
    ['repFrom','repTo','repBranch','repType','repStatus'].forEach(id=>{
      $('#'+id)?.addEventListener('change', ()=>{
        refreshSalesOptionsForReports();
      });
    });

    $$('[data-dl]').forEach(btn=>{
      btn.addEventListener('click', ()=> downloadReport(btn.getAttribute('data-dl')));
    });
    $$('[data-dl-xlsx]').forEach(btn=>{
      btn.addEventListener('click', ()=> downloadReportXlsx(btn.getAttribute('data-dl-xlsx')));
    });

    $('#btnExportBackup')?.addEventListener('click', ()=> exportBackup());
    $('#btnImportBackup')?.addEventListener('click', async ()=>{
      if(!AUTH.canEdit()) return;
      const file = $('#backupInput')?.files?.[0];
      if(!file){ showAlert('warning','اختَر ملف Backup .json'); return; }
      try{ await importBackupFile(file); }
      catch(err){ console.error(err); showAlert('danger','فشل استعادة الـ Backup: ' + (err.message||err)); }
    });

    const clearBtn = $('#btnClearAllData') || $('#btnWipeAll');
    clearBtn?.addEventListener('click', async ()=>{
      if(!AUTH.canEdit()) return;
      if(!confirm('تأكيد: حذف كل البيانات المحلية؟')) return;
      await wipeAll();
      showAlert('success','تم حذف البيانات.');
      await refreshBranchesUI();
      await refreshDashboard();
      await updateDataSection();
    });

    // Settings: change password (form submit so password field is inside a form)
    $('#formChangePassword')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const current = $('#changePassCurrent')?.value || '';
      const newP = $('#changePassNew')?.value || '';
      const confirmP = $('#changePassConfirm')?.value || '';
      const msg = $('#changePassMsg');
      if (msg) msg.textContent = '';
      if (!current || !newP || !confirmP) { if (msg) { msg.textContent = 'املأ جميع الحقول'; msg.className = 'small mb-2 text-danger'; } return; }
      if (newP !== confirmP) { if (msg) { msg.textContent = 'كلمة المرور الجديدة غير متطابقة'; msg.className = 'small mb-2 text-danger'; } return; }
      const { username } = AUTH.getCurrentUser();
      if (!username || username === 'sawi') { if (msg) { msg.textContent = 'لا يمكن تغيير كلمة مرور المدير الأعلى من هنا'; msg.className = 'small mb-2 text-danger'; } return; }
      const ok = await AUTH.verifyUser(username, current);
      if (!ok) { if (msg) { msg.textContent = 'كلمة المرور الحالية غير صحيحة'; msg.className = 'small mb-2 text-danger'; } return; }
      try {
        await AUTH.changePassword(username, newP);
        if (msg) { msg.textContent = 'تم تحديث كلمة المرور.'; msg.className = 'small mb-2 text-success'; }
        $('#changePassCurrent').value = ''; $('#changePassNew').value = ''; $('#changePassConfirm').value = '';
      } catch (err) { if (msg) { msg.textContent = err.message || 'فشل التحديث'; msg.className = 'small mb-2 text-danger'; } }
    });

    // Settings: user management (superadmin)
    async function renderUsersTable(){
      const tbody = $('#tblUsers tbody');
      if (!tbody) return;
      const users = await AUTH.usersGetAll();
      const roleAr = { viewer: 'عرض فقط', editor: 'تعديل', admin: 'مدير' };
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${u.username}</td>
          <td>${roleAr[u.role] || u.role}</td>
          <td><button type="button" class="btn btn-sm btn-outline-danger btn-delete-user" data-username="${u.username}">حذف</button></td>
        </tr>
      `).join('');
      tbody.querySelectorAll('.btn-delete-user').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const un = btn.getAttribute('data-username');
          if (!un || !confirm(`حذف المستخدم "${un}"؟`)) return;
          try {
            await AUTH.deleteUser(un);
            showAlert('success', 'تم حذف المستخدم.');
            renderUsersTable();
          } catch (e) { showAlert('danger', e.message || 'فشل الحذف'); }
        });
      });
    }
    // Add user (form submit so password field is inside a form)
    $('#formAddUser')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const un = ($('#newUserUsername').value || '').trim().toLowerCase();
      const pw = $('#newUserPassword').value || '';
      const role = $('#newUserRole').value || 'viewer';
      const msg = $('#addUserMsg');
      if (msg) msg.textContent = '';
      if (!un || !pw) { if (msg) { msg.textContent = 'أدخل اسم المستخدم وكلمة المرور'; msg.className = 'small mt-2 text-danger'; } return; }
      try {
        await AUTH.createUser(un, pw, role);
        if (msg) { msg.textContent = 'تم إضافة المستخدم.'; msg.className = 'small mt-2 text-success'; }
        $('#newUserUsername').value = ''; $('#newUserPassword').value = '';
        renderUsersTable();
      } catch (err) { if (msg) { msg.textContent = err.message || 'فشل الإضافة'; msg.className = 'small mt-2 text-danger'; } }
    });

    await refreshBranchesUI();
    repSalesMS = createSalesMultiSelect();
    updateAuthButtons();
    const all = await idbGetAll('transactions');
    setDefaultDateRange(all);
    await refreshDashboard();
    setActiveNav('dashboard');
  }

  window.addEventListener('load', ()=>{
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(() => {}).catch(() => {});
    }
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
      const el = $('#storageSize');
      if(el) el.textContent = mb + ' MB';
    } catch(e){ console.error(e); }
  }

  // simple counts
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
