/* Golden Cala Sales Analytics - IndexedDB */
(function(){
  'use strict';
  const GC = window.GC || (window.GC = {});

  const DB_NAME = 'sales_local_db';
  const DB_VERSION = 2;
  let db = null;

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if(!d.objectStoreNames.contains('transactions')){
          const os = d.createObjectStore('transactions', { keyPath: 'key' });
          os.createIndex('branchId', 'branchId', { unique:false });
          os.createIndex('docType', 'docType', { unique:false });
          os.createIndex('businessDate', 'businessDate', { unique:false });
          os.createIndex('docNo', 'docNo', { unique:false });
          os.createIndex('sales', 'sales', { unique:false });
        }
        if(!d.objectStoreNames.contains('branches')){
          d.createObjectStore('branches', { keyPath: 'branchId' });
        }
        if(!d.objectStoreNames.contains('users')){
          d.createObjectStore('users', { keyPath: 'username' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function usersGet(username){
    return new Promise((resolve, reject) => {
      if(!db) return reject(new Error('DB not open'));
      const req = db.transaction('users', 'readonly').objectStore('users').get(username);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function usersGetAll(){
    return new Promise((resolve, reject) => {
      if(!db) return reject(new Error('DB not open'));
      const req = db.transaction('users', 'readonly').objectStore('users').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function usersPut(user){
    return new Promise((resolve, reject) => {
      if(!db) return reject(new Error('DB not open'));
      const tx = db.transaction('users', 'readwrite');
      const req = tx.objectStore('users').put(user);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function usersDelete(username){
    return new Promise((resolve, reject) => {
      if(!db) return reject(new Error('DB not open'));
      const req = db.transaction('users', 'readwrite').objectStore('users').delete(username);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function dbInit(){ db = await openDB(); }

  function idbTx(storeName, mode='readonly'){
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function idbGetAll(storeName){
    return new Promise((resolve, reject) => {
      const req = idbTx(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function idbClearStore(storeName){
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const os = tx.objectStore(storeName);
      const req = os.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function wipeAll(){
    await Promise.all([
      idbClearStore('transactions'),
      idbClearStore('branches')
    ]);
  }

  async function upsertBranchesFromRecords(records){
    const branches = new Map();
    for(const r of records){
      if(r.branchId != null){
        branches.set(r.branchId, { branchId: r.branchId, branchName: r.branchName || `Branch ${r.branchId}` });
      }
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('branches', 'readwrite');
      const os = tx.objectStore('branches');
      for(const b of branches.values()) os.put(b);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function addManyTransactions(records, onProgress){
    if(!records.length) return {inserted:0, skipped:0, errors:0};
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      const os = tx.objectStore('transactions');

      let inserted = 0, skipped = 0, errors = 0, done = 0;
      function step(){
        done += 1;
        if(onProgress) onProgress(done, records.length);
      }

      for(const rec of records){
        const req = os.add(rec);
        req.onsuccess = () => { inserted++; step(); };
        req.onerror = (ev) => {
          if(req.error && req.error.name === 'ConstraintError'){
            skipped++; ev.preventDefault(); step();
          }else{
            errors++; ev.preventDefault(); step();
          }
        };
      }

      tx.oncomplete = () => resolve({inserted, skipped, errors});
      tx.onerror = () => reject(tx.error);
    });
  }

  function getDb(){ return db; }

  GC.db = GC.db || {};
  GC.db.dbInit = dbInit;
  GC.db.idbGetAll = idbGetAll;
  GC.db.idbClearStore = idbClearStore;
  GC.db.wipeAll = wipeAll;
  GC.db.upsertBranchesFromRecords = upsertBranchesFromRecords;
  GC.db.addManyTransactions = addManyTransactions;
  GC.db.getDb = getDb;
  GC.db.usersGet = usersGet;
  GC.db.usersGetAll = usersGetAll;
  GC.db.usersPut = usersPut;
  GC.db.usersDelete = usersDelete;
})();
