/* Golden Cala - Gate & auth UI (showGate, showApp, applyNavByRole, updateAuthButtons, enforceAuth) */
(function () {
  'use strict';
  var APP = window.APP;
  if (!APP) return;
  var $ = APP.$;
  var AUTH = APP.AUTH;

  function showGate() {
    var gate = $ ? $('#appGate') : document.getElementById('appGate');
    var main = document.getElementById('appMain');
    if (gate) gate.classList.remove('d-none');
    if (main) main.classList.add('d-none');
  }

  function showApp() {
    var gate = $ ? $('#appGate') : document.getElementById('appGate');
    var main = document.getElementById('appMain');
    if (gate) gate.classList.add('d-none');
    if (main) main.classList.remove('d-none');
  }

  function applyNavByRole() {
    var settingsNav = document.querySelector('.nav-item-settings');
    var editNav = document.querySelector('.nav-item-edit');
    if (AUTH && settingsNav) settingsNav.style.display = AUTH.canAccessSettings() ? '' : 'none';
    if (AUTH && editNav) editNav.style.display = AUTH.canEdit() ? '' : 'none';
  }

  function updateAuthButtons() {
    var badge = document.getElementById('navUserBadge');
    var logoutBtn = document.getElementById('btnLogout');
    if (AUTH && badge && AUTH.isLoggedIn()) {
      var user = AUTH.getCurrentUser();
      var roleLabel = { viewer: 'عرض فقط', editor: 'تعديل', admin: 'مدير', superadmin: 'مدير أعلى' }[user.role] || user.role;
      badge.textContent = (user.username || '') + ' | ' + roleLabel;
      badge.classList.remove('d-none');
    } else if (badge) badge.classList.add('d-none');
    if (logoutBtn) logoutBtn.classList.toggle('d-none', !AUTH || !AUTH.isLoggedIn());
  }

  function enforceAuth() {
    if (AUTH && AUTH.isLoggedIn()) return true;
    showGate();
    return false;
  }

  APP.showGate = showGate;
  APP.showApp = showApp;
  APP.applyNavByRole = applyNavByRole;
  APP.updateAuthButtons = updateAuthButtons;
  APP.enforceAuth = enforceAuth;
})();
