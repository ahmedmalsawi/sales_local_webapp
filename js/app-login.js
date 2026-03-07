/**
 * Golden Cala - Standalone login (depends only on helpers, db, auth).
 * Wires the gate form and handles login without waiting for the rest of the app.
 * Restores session from localStorage on load so refresh keeps user logged in.
 */
(function () {
  'use strict';

  var AUTH_USER_KEY = 'auth_username';
  var AUTH_ROLE_KEY = 'auth_role';

  function isSessionStored() {
    try {
      return !!(typeof localStorage !== 'undefined' && localStorage.getItem(AUTH_USER_KEY));
    } catch (e) { return false; }
  }

  function restoreAndShowApp() {
    var gate = document.getElementById('appGate');
    var main = document.getElementById('appMain');
    if (gate) gate.classList.add('d-none');
    if (main) main.classList.remove('d-none');
    window.dispatchEvent(new CustomEvent('golden-cala-login'));
  }

  function wireForm() {
    if (isSessionStored()) {
      restoreAndShowApp();
    }

    var form = document.getElementById('gateLoginForm');
    var btn = document.getElementById('gateBtnLogin');
    if (!form) return;

    function handleSubmit(e) {
      e.preventDefault();
      e.stopPropagation();
      doLogin();
    }

    form.addEventListener('submit', handleSubmit);
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); doLogin(); });
  }

  async function doLogin() {
    var gateMsg = document.getElementById('gateMsg');
    var gateBtn = document.getElementById('gateBtnLogin');
    var userInput = document.getElementById('gateUser');
    var passInput = document.getElementById('gatePass');
    var user = (userInput && userInput.value || '').trim();
    var pass = (passInput && passInput.value || '');

    if (gateMsg) gateMsg.textContent = '';
    if (!user || !pass) {
      if (gateMsg) { gateMsg.textContent = 'أدخل اسم المستخدم وكلمة المرور'; gateMsg.classList.add('text-danger'); }
      return;
    }

    var GC = window.GC;
    if (!GC || !GC.db || !GC.auth || !GC.auth.AUTH) {
      if (gateMsg) { gateMsg.textContent = 'التطبيق لم يُحمّل بعد. حدّث الصفحة (F5).'; gateMsg.classList.add('text-danger'); }
      return;
    }

    if (gateBtn) gateBtn.disabled = true;
    try {
      if (!GC.db.getDb || !GC.db.getDb()) {
        if (GC.db.dbInit) await GC.db.dbInit();
        if (GC.auth.AUTH.seedDefaultAdmin) await GC.auth.AUTH.seedDefaultAdmin();
      }
      var result = await GC.auth.AUTH.login(user, pass);
      if (result && result.ok) {
        var gate = document.getElementById('appGate');
        var main = document.getElementById('appMain');
        if (gate) gate.classList.add('d-none');
        if (main) main.classList.remove('d-none');
        window.dispatchEvent(new CustomEvent('golden-cala-login'));
      } else {
        if (gateMsg) { gateMsg.textContent = (result && result.message) || 'بيانات الدخول غير صحيحة'; gateMsg.classList.add('text-danger'); }
      }
    } catch (err) {
      if (gateMsg) { gateMsg.textContent = (err && err.message) || 'خطأ في تسجيل الدخول'; gateMsg.classList.add('text-danger'); }
    }
    if (gateBtn) gateBtn.disabled = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireForm);
  } else {
    wireForm();
  }
})();
