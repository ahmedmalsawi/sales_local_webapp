/* Golden Cala Sales Analytics - Auth with roles (viewer, editor, admin, superadmin) */
(function(){
  'use strict';
  const GC = window.GC || (window.GC = {});

  const SUPERADMIN_USER = 'sawi';
  const SUPERADMIN_PASS = 'Mm@100100';
  const READONLY_USER = 'user';
  const READONLY_PASS = 'user123';
  const SESSION_USER = 'auth_username';
  const SESSION_ROLE = 'auth_role';

  async function hash(pass){
    const enc = new TextEncoder().encode(pass);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  const storage = typeof localStorage !== 'undefined' ? localStorage : sessionStorage;

  function getSession(){
    const user = storage.getItem(SESSION_USER);
    const role = storage.getItem(SESSION_ROLE);
    return { username: user || null, role: role || null };
  }

  function setSession(username, role){
    storage.setItem(SESSION_USER, username);
    storage.setItem(SESSION_ROLE, role);
  }

  function clearSession(){
    storage.removeItem(SESSION_USER);
    storage.removeItem(SESSION_ROLE);
    storage.removeItem('auth_ok');
  }

  async function seedDefaultAdmin(){
    const users = await GC.db.usersGetAll();
    if (users.length > 0) return;
    await GC.db.usersPut({
      username: 'admin',
      passwordHash: await hash('admin123'),
      role: 'admin',
      createdAt: new Date().toISOString()
    });
  }

  async function login(user, pass){
    const u = (user || '').trim();
    const p = pass || '';
    if (!u || !p) return { ok: false, message: 'أدخل اسم المستخدم وكلمة المرور' };

    if (u === SUPERADMIN_USER && p === SUPERADMIN_PASS) {
      setSession(SUPERADMIN_USER, 'superadmin');
      return { ok: true, role: 'superadmin' };
    }
    if (u === READONLY_USER && p === READONLY_PASS) {
      setSession(READONLY_USER, 'viewer');
      return { ok: true, role: 'viewer' };
    }

    const stored = await GC.db.usersGet(u);
    if (!stored) return { ok: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    const h = await hash(p);
    if (stored.passwordHash !== h) return { ok: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };

    setSession(stored.username, stored.role);
    return { ok: true, role: stored.role };
  }

  function logout(){
    clearSession();
  }

  function isLoggedIn(){
    return !!storage.getItem(SESSION_USER);
  }

  function getCurrentUser(){
    return getSession();
  }

  function getRole(){
    return storage.getItem(SESSION_ROLE) || null;
  }

  function canAccessSettings(){
    const r = getRole();
    return r === 'admin' || r === 'superadmin';
  }

  function canEdit(){
    const r = getRole();
    return r === 'editor' || r === 'admin' || r === 'superadmin';
  }

  function canView(){
    return isLoggedIn();
  }

  function isSuperAdmin(){
    return getRole() === 'superadmin';
  }

  async function verifyUser(username, pass){
    if (!username || !pass) return false;
    if (username === SUPERADMIN_USER && pass === SUPERADMIN_PASS) return true;
    const stored = await GC.db.usersGet(username);
    if (!stored) return false;
    const h = await hash(pass);
    return stored.passwordHash === h;
  }

  async function changePassword(username, newPass){
    const user = await GC.db.usersGet(username);
    if (!user) throw new Error('المستخدم غير موجود');
    user.passwordHash = await hash(newPass);
    user.updatedAt = new Date().toISOString();
    await GC.db.usersPut(user);
  }

  async function createUser(username, password, role){
    const u = (username || '').trim().toLowerCase();
    if (!u || !password) throw new Error('اسم المستخدم وكلمة المرور مطلوبان');
    if (u === SUPERADMIN_USER) throw new Error('لا يمكن إنشاء مستخدم بهذا الاسم');
    if (!['viewer','editor','admin'].includes(role)) throw new Error('الدور غير صالح');
    const existing = await GC.db.usersGet(u);
    if (existing) throw new Error('اسم المستخدم مستخدم مسبقاً');
    await GC.db.usersPut({
      username: u,
      passwordHash: await hash(password),
      role,
      createdAt: new Date().toISOString()
    });
  }

  async function deleteUser(username){
    if (username === SUPERADMIN_USER) throw new Error('لا يمكن حذف هذا المستخدم');
    const current = getSession().username;
    if (username === current) throw new Error('لا يمكنك حذف حسابك أثناء تسجيل الدخول');
    await GC.db.usersDelete(username);
  }

  const AUTH = {
    enabled: function(){ return true; },
    setEnabled: function(){},
    hasUser: function(){ return isLoggedIn(); },
    hash,
    login,
    logout,
    isLoggedIn,
    getCurrentUser,
    getRole,
    canAccessSettings,
    canEdit,
    canView,
    isSuperAdmin,
    verifyUser,
    changePassword,
    createUser,
    deleteUser,
    usersGetAll: () => GC.db.usersGetAll(),
    seedDefaultAdmin,
    reset: clearSession
  };

  GC.auth = GC.auth || {};
  GC.auth.AUTH = AUTH;
})();
