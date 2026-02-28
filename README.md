# Sales Local (HTML/CSS/JS) — Import Excel + Local DB + Dashboard

This web app runs **without a server** and stores everything in your browser using **IndexedDB**.

## Features
- Import Excel files like:
  - **Posted Invoice inquiry** (invoices)
  - **Refund Inquiry** (refunds)
- Detect duplicates during upload:
  - Duplicate rule = `(docType + branchId + docNo)` (example: `invoice|2|44`)
- Dashboard:
  - Net sales, invoices/refunds totals, avg ticket, discount, qty
  - Daily net chart + Top branches
- Reports:
  - By branch
  - By salesperson (Sales)
  - Transactions list + search
- Download CSV reports
- Backup/restore JSON

## Run
Recommended (avoids browser restrictions):
```bash
# inside the app folder
python -m http.server 8000
# open: http://localhost:8000
```

You can also open `index.html` directly, but importing Excel needs XLSX library loaded from CDN.

## Notes
- Excel import uses CDN libraries:
  - XLSX (SheetJS)
  - Chart.js
  - Bootstrap RTL
If you open the app **without internet**, importing and charts may not work.

## Customization
If you want:
- more KPIs (top customers, hourly sales, product category…)
- different duplicate logic
- mapping new Excel formats

Tell me the new Excel sample(s) and what fields you need.
