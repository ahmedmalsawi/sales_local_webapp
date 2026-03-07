/* Golden Cala - Settings page (updateDataSection) */
(function () {
  'use strict';
  var APP = window.APP;
  if (!APP) return;
  var $ = APP.$;
  var idbGetAll = APP.idbGetAll;
  var netValue = APP.netValue;
  var fmtNumber = APP.fmtNumber;
  var showAlert = APP.showAlert;

  async function updateDataSection() {
    var all = await idbGetAll('transactions');

    if (navigator.storage && navigator.storage.estimate) {
      try {
        var est = await navigator.storage.estimate();
        var mb = (est.usage / (1024 * 1024)).toFixed(2);
        var el = $('#storageSize');
        if (el) el.textContent = mb + ' MB';
      } catch (e) { console.error(e); }
    }

    var elTx = $('#statTransactions'); if (elTx) elTx.textContent = all.length;
    var elBr = $('#statBranches'); if (elBr) elBr.textContent = new Set(all.map(function (t) { return t.branchId; })).size;
    var elSa = $('#statSales'); if (elSa) elSa.textContent = new Set(all.map(function (t) { return t.sales || '(غير محدد)'; })).size;
    var elCu = $('#statCustomers'); if (elCu) elCu.textContent = new Set(all.map(function (t) { return t.customer || '(غير محدد)'; })).size;

    var tbody = $('#tblAllBranches tbody');
    if (tbody) {
      tbody.innerHTML = '';
      var agg = {};
      all.forEach(function (t) {
        var id = t.branchId || '(غير محدد)';
        var name = t.branchName || id;
        if (!agg[id]) agg[id] = { name: name, count: 0, net: 0 };
        agg[id].count++;
        agg[id].net += netValue(t);
      });
      Object.keys(agg).forEach(function (id) {
        var b = agg[id];
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + b.name + '</td><td>' + b.count + '</td><td>' + fmtNumber(b.net) + '</td>';
        tbody.appendChild(tr);
      });
    }

    var settingsPage = $('#page-settings');
    
    // Inject Time Configuration Card if missing
    if (settingsPage && !document.getElementById('cardTimeConfig')) {
      var timeDiv = document.createElement('div');
      timeDiv.id = 'cardTimeConfig';
      timeDiv.className = 'card mb-4 fade-in-up';
      timeDiv.innerHTML = [
        '<div class="card-header bg-white fw-bold">⏰ إعدادات التوقيت (Time Zone)</div>',
        '<div class="card-body">',
        '<p class="small text-muted">حدد فرق التوقيت بالساعات ليتم تطبيقه على التواريخ عند استيراد الملفات (الافتراضي +6).</p>',
        '<div class="row align-items-end g-3">',
        '<div class="col-auto"><label class="form-label small mb-0">فرق التوقيت (ساعات)</label>',
        '<input type="number" id="settingTimeOffset" class="form-control form-control-sm" value="6" step="1"></div>',
        '<div class="col-auto"><button class="btn btn-primary btn-sm" id="btnSaveTimeOffset">حفظ الإعداد</button></div>',
        '</div>',
        '<div class="small text-warning mt-2">ملاحظة: هذا الإعداد يؤثر على الملفات التي يتم استيرادها مستقبلاً. لتحديث البيانات القديمة، يرجى إعادة استيراد الملفات.</div>',
        '</div>'
      ].join('');
      // Insert before the user management row or at the top
      var firstRow = settingsPage.querySelector('.row');
      if(firstRow) settingsPage.insertBefore(timeDiv, firstRow);
      else settingsPage.appendChild(timeDiv);

      // Bind Save
      var btn = timeDiv.querySelector('#btnSaveTimeOffset');
      var inp = timeDiv.querySelector('#settingTimeOffset');
      if(APP.GC && APP.GC.getTimeOffset) inp.value = APP.GC.getTimeOffset();
      btn.onclick = function(){
        localStorage.setItem('gc_time_offset', inp.value);
        showAlert('success', 'تم حفظ إعداد التوقيت (' + inp.value + ' hours).');
      };
    }

    if (settingsPage && !document.getElementById('devInfoCard')) {
      var div = document.createElement('div');
      div.id = 'devInfoCard';
      div.className = 'card mt-4 mb-4 fade-in-up';
      div.innerHTML = [
        '<div class="card-header bg-white fw-bold">ℹ️ عن النظام والمطور</div>',
        '<div class="card-body">',
        '<div class="row g-3">',
        '<div class="col-md-6"><h6 class="text-primary mb-3">معلومات المطور</h6>',
        '<p class="mb-2"><strong>تطوير:</strong> Ahmed Elsawi</p>',
        '<p class="mb-2"><strong>الدعم الفني:</strong> ahmedmalsawi@gmail.com</p></div>',
        '<div class="col-md-6"><h6 class="text-primary mb-3">معلومات النسخة</h6>',
        '<p class="mb-2"><strong>الإصدار:</strong> v2.5.0 (Premium)</p>',
        '<p class="mb-2"><strong>تاريخ التحديث:</strong> March 2026</p>',
        '<p class="mb-0"><strong>الترخيص:</strong> Golden Cala</p></div></div>',
        '<hr class="my-3"><div class="text-center text-muted small">&copy; 2026 Ahmed Elsawi. جميع الحقوق محفوظة.</div>',
        '</div></div>'
      ].join('');
      settingsPage.appendChild(div);
    }
  }

  APP.updateDataSection = updateDataSection;
})();
