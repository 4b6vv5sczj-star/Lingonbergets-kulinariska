/* store.js — lokal lagring (IndexedDB) för recept + inbäddade bilder.
   IndexedDB är arbetskopian/cachen så appen fungerar offline och snabbt.
   Den primära "spara"-platsen mot iCloud Filer hanteras i icloud.js. */
(function (global) {
  'use strict';

  var DB_NAME = 'lingonberget';
  var DB_VERSION = 1;
  var STORE = 'recipes';
  var SETTINGS_KEY = 'lb_settings';

  var _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('IndexedDB saknas')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('updatedAt', 'updatedAt', { unique: false });
          os.createIndex('category', 'category', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return _dbPromise;
  }

  function tx(mode) {
    return openDB().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function asPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'r-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
  }

  var Store = {
    uuid: uuid,

    /** Hämta alla recept, nyast först. */
    all: function () {
      return tx('readonly').then(function (os) {
        return asPromise(os.getAll());
      }).then(function (list) {
        list.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
        return list;
      });
    },

    get: function (id) {
      return tx('readonly').then(function (os) { return asPromise(os.get(id)); });
    },

    /** Skapa/uppdatera. Sätter id/tidsstämplar vid behov. */
    put: function (recipe) {
      var now = new Date().toISOString();
      if (!recipe.id) recipe.id = uuid();
      if (!recipe.createdAt) recipe.createdAt = now;
      recipe.updatedAt = now;
      return tx('readwrite').then(function (os) {
        return asPromise(os.put(recipe));
      }).then(function () { return recipe; });
    },

    delete: function (id) {
      return tx('readwrite').then(function (os) { return asPromise(os.delete(id)); });
    },

    /** Hela samlingen som ett serialiserbart objekt (för säkerhetskopia till iCloud). */
    exportAll: function () {
      return this.all().then(function (list) {
        return { app: 'lingonbergets-kulinariska-samling', version: 1, exportedAt: new Date().toISOString(), recipes: list };
      });
    },

    /** Slå samman importerade recept (befintliga id uppdateras). */
    importAll: function (data) {
      var recipes = (data && data.recipes) || (Array.isArray(data) ? data : []);
      return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, 'readwrite');
          var os = t.objectStore(STORE);
          var n = 0;
          recipes.forEach(function (r) {
            if (!r || !r.id) { if (r) r.id = uuid(); }
            os.put(r); n++;
          });
          t.oncomplete = function () { resolve(n); };
          t.onerror = function () { reject(t.error); };
        });
      });
    },

    /* Inställningar (tema/filter) i localStorage */
    getSettings: function () {
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
      catch (e) { return {}; }
    },
    setSetting: function (key, val) {
      var s = this.getSettings(); s[key] = val;
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
    }
  };

  global.Store = Store;
})(window);
