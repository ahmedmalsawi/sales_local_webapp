/* Golden Cala Sales Analytics - Unit tests (run in browser via tests/runner.html) */
(function(){
  'use strict';

  const buildInvoiceRecords = GC.excel.buildInvoiceRecords;
  const buildRefundRecords = GC.excel.buildRefundRecords;
  const filterTransactions = GC.core.filterTransactions;
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

  const summary = '\n--- ' + passed + ' passed, ' + failed + ' failed ---';
  const el = document.getElementById('results');
  if (el) el.textContent = log.join('\n') + summary;
  console.log(log.join('\n') + summary);
})();
