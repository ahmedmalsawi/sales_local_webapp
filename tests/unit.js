/* Golden Cala Sales Analytics - Unit tests (run in browser via tests/runner.html) */
(function(){
  'use strict';

  const buildInvoiceRecords = GC.excel.buildInvoiceRecords;
  const buildRefundRecords = GC.excel.buildRefundRecords;
  const filterTransactions = GC.core.filterTransactions;
  const computeKPIs = GC.core.computeKPIs;
  const aggByBranch = GC.core.aggByBranch;
  const netValue = GC.core.netValue;

  let passed = 0;
  let failed = 0;
  const log = [];

  function assert(cond, name, detail){
    if (cond) { passed++; log.push('PASS: ' + name + (detail ? ' — ' + detail : '')); }
    else { failed++; log.push('FAIL: ' + name + (detail ? ' — ' + detail : '')); }
  }

  function assertEqual(a, b, name){
    const ok = a === b || (Number(a) === Number(b) && !isNaN(Number(a)));
    assert(ok, name, 'expected ' + b + ', got ' + a);
  }

  // --- buildInvoiceRecords ---
  (function(){
    const jsonRows = [
      { 'Invoice': 'Store : 2 - فرع الرياض', 'Business Date': null, 'Customer': null },
      { 'Invoice': '44', 'Business Date': '2024-01-15', 'Customer': 'أحمد', 'Sales': 'محمد', 'Amount': 100, 'Paid Amount': 100, 'Qty': 1, 'Discount': 0, 'Tax': 0, 'Mobile': '', 'Status': '', 'Refunded': '', 'Type': '', 'Note Log': '', 'Create User': '', 'Create Date': null }
    ];
    const out = buildInvoiceRecords(jsonRows, 'test.xlsx');
    assert(out.length === 1, 'buildInvoiceRecords returns one record');
    assertEqual(out[0].key, 'invoice|2|44', 'buildInvoiceRecords key');
    assertEqual(out[0].branchId, 2, 'buildInvoiceRecords branchId');
    assertEqual(out[0].docNo, '44', 'buildInvoiceRecords docNo');
    assertEqual(out[0].docType, 'invoice', 'buildInvoiceRecords docType');
    assertEqual(out[0].paidAmount, 100, 'buildInvoiceRecords paidAmount');
    assertEqual(out[0].businessDate, '2024-01-15', 'buildInvoiceRecords businessDate from file only');
  })();
  (function(){
    const jsonRows = [
      { 'Invoice': 'Store : 1 - فرع', 'Business Date': null },
      { 'Invoice': '99', 'Business Date': null, 'Customer': 'ج', 'Sales': 'س', 'Amount': 50, 'Paid Amount': 50, 'Qty': 1, 'Discount': 0, 'Tax': 0, 'Mobile': '', 'Status': '', 'Refunded': '', 'Type': '', 'Note Log': '', 'Create User': '', 'Create Date': '2024-06-01T10:00:00' }
    ];
    const out = buildInvoiceRecords(jsonRows, 'skip.xlsx');
    assertEqual(out.length, 0, 'buildInvoiceRecords skips row when Business Date is empty');
  })();

  // --- buildRefundRecords ---
  (function(){
    const jsonRows = [
      { 'Company': 'Store : 1 - فرع جدة', 'Refund': null, 'Invoice': null },
      { 'Company': '', 'Refund': '10', 'Invoice': '44', 'Business Date': '2024-02-01', 'Customer': 'عميل', 'Sales': 'موظف', 'Amount': 50, 'Paid Amount': 50, 'Qty': 1, 'Discount': 0, 'Tax': 0, 'Create User': '' }
    ];
    const out = buildRefundRecords(jsonRows, 'refund.xlsx');
    assert(out.length === 1, 'buildRefundRecords returns one record');
    assertEqual(out[0].key, 'refund|1|10', 'buildRefundRecords key');
    assertEqual(out[0].branchId, 1, 'buildRefundRecords branchId');
    assertEqual(out[0].docType, 'refund', 'buildRefundRecords docType');
  })();

  // --- filterTransactions ---
  (function(){
    const all = [
      { businessDate: '2024-01-10', branchId: 1, docType: 'invoice', sales: 'A', status: 'closed' },
      { businessDate: '2024-01-20', branchId: 1, docType: 'invoice', sales: 'A', status: 'closed' },
      { businessDate: '2024-02-05', branchId: 2, docType: 'refund', sales: 'B', status: '' }
    ];
    const full = filterTransactions(all, null, null, 'all', 'all', null, 'all');
    assertEqual(full.length, 3, 'filterTransactions no filter');

    const byDate = filterTransactions(all, '2024-01-15', null, 'all', 'all', null, 'all');
    assertEqual(byDate.length, 2, 'filterTransactions fromISO');

    const byBranch = filterTransactions(all, null, null, '2', 'all', null, 'all');
    assertEqual(byBranch.length, 1, 'filterTransactions branchId');

    const byType = filterTransactions(all, null, null, 'all', 'invoice', null, 'all');
    assertEqual(byType.length, 2, 'filterTransactions docType invoice');

    const withNoDate = [
      { businessDate: null, createDate: '2024-01-25T00:00:00', branchId: 1, docType: 'invoice' },
      { businessDate: '2024-01-20', branchId: 1, docType: 'invoice' }
    ];
    const withDateFilter = filterTransactions(withNoDate, '2024-01-01', '2024-01-31', 'all', 'all', null, 'all');
    assertEqual(withDateFilter.length, 1, 'filterTransactions excludes tx without businessDate when date filter set');
  })();

  // --- aggByBranch ---
  (function(){
    const list = [
      { branchId: 5, branchName: 'فرع أ', docType: 'invoice', paidAmount: 200 },
      { branchId: 5, branchName: 'فرع أ', docType: 'refund', paidAmount: 50 }
    ];
    const by = aggByBranch(list);
    assertEqual(by.length, 1, 'aggByBranch one branch');
    assertEqual(by[0].net, 150, 'aggByBranch net = inv - ref');
    assertEqual(by[0].invoicesCount, 1, 'aggByBranch invoicesCount');
    assertEqual(by[0].refundsCount, 1, 'aggByBranch refundsCount');
  })();

  // --- duplicate key (composite key consistency) ---
  (function(){
    const jsonRows = [
      { 'Invoice': 'Store : 3 - فرع القاهرة', 'Business Date': null },
      { 'Invoice': '100', 'Business Date': '2024-03-01', 'Customer': 'ج', 'Sales': 'س', 'Amount': 10, 'Paid Amount': 10, 'Qty': 1, 'Discount': 0, 'Tax': 0, 'Mobile': '', 'Status': '', 'Refunded': '', 'Type': '', 'Note Log': '', 'Create User': '', 'Create Date': null },
      { 'Invoice': '100', 'Business Date': '2024-03-01', 'Customer': 'ج2', 'Sales': 'س', 'Amount': 20, 'Paid Amount': 20, 'Qty': 1, 'Discount': 0, 'Tax': 0, 'Mobile': '', 'Status': '', 'Refunded': '', 'Type': '', 'Note Log': '', 'Create User': '', 'Create Date': null }
    ];
    const out = buildInvoiceRecords(jsonRows, 'dup.xlsx');
    assert(out.length === 2, 'buildInvoiceRecords two rows with same docNo');
    const keys = out.map(r => r.key);
    assert(keys[0] === 'invoice|3|100' && keys[1] === 'invoice|3|100', 'buildInvoiceRecords same key for same branch+docNo (IDB dedup on add)');
  })();

  // --- netValue ---
  (function(){
    assertEqual(netValue({ docType: 'invoice', paidAmount: 100 }), 100, 'netValue invoice');
    assertEqual(netValue({ docType: 'refund', paidAmount: 30 }), -30, 'netValue refund');
  })();

  // --- computeKPIs: صافي المبيعات = اجمالي الفواتير - اجمالي الخصومات - اجمالي المرتجعات ---
  (function(){
    const list = [
      { docType: 'invoice', amount: 1000, discount: 100, paidAmount: 900 },
      { docType: 'refund', amount: 200, discount: 10, paidAmount: 190 }
    ];
    const k = computeKPIs(list);
    assertEqual(k.invGross, 1000, 'computeKPIs invGross');
    assertEqual(k.invDisc, 100, 'computeKPIs invDisc');
    assertEqual(k.refGross, 200, 'computeKPIs refGross');
    const expectedNet = 1000 - 100 - 200;
    assertEqual(k.net, expectedNet, 'computeKPIs net = invGross - invDisc - refGross');
  })();

  const summary = '\n--- ' + passed + ' passed, ' + failed + ' failed ---';
  const el = document.getElementById('results');
  if (el) el.textContent = log.join('\n') + summary;
  console.log(log.join('\n') + summary);
})();
