# Golden Cala – JS modules (load order)

| Order | File | Role |
|-------|------|------|
| 1 | helpers.js | GC, $, $$, format helpers |
| 2 | db.js | IndexedDB, GC.db |
| 3 | auth.js | Login/roles, GC.auth |
| 4 | **app-login.js** | **Standalone login form** – wires gate form, handles login with DB + auth only, then hides gate / shows app and dispatches `golden-cala-login` |
| 5 | excel.js | Excel parsing, GC.excel |
| 6 | core.js | Filtering, KPIs, GC.core |
| 7 | app-refs.js | Builds `window.APP` with all refs from GC |
| 8 | app-gate.js | showGate, showApp, applyNavByRole, updateAuthButtons, enforceAuth → `APP.*` |
| 9 | app-settings.js | updateDataSection → `APP.updateDataSection` |
| 10 | app.js | Main app: UI, dashboard, import, reports, analytics, boot, event wiring. Listens for `golden-cala-login` to run post-login (refresh dashboard, nav, etc.). |

**Login flow**

1. User submits gate form → **app-login.js** handles it (no need for app.js).
2. app-login.js: init DB if needed, seed admin, `AUTH.login` → on success: hide gate, show `#appMain`, dispatch `golden-cala-login`.
3. **app.js** (if loaded) handles `golden-cala-login`: `refreshBranchesUI`, `setDefaultDateRange`, `refreshDashboard`, `applyNavByRole`, `updateAuthButtons`, `setActiveNav('dashboard')`.

**Credentials**

- admin / admin123 (after first load, DB seeded)
- user / user123 (view only)
- sawi / Mm@100100 (superadmin)
