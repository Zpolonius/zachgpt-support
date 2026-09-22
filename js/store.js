/* Datalag.
 *
 * Appen kender kun dette lille API og er ligeglad med, hvor data ligger:
 *
 *   var store = ZG.createStore();
 *   store.init().then(function (kind) { ... });   // "artifact" | "rest" | "local"
 *   store.watch("tickets", function (docs) {});   // docs = [{id, ...felter}]
 *   store.add("tickets", body).then(function (id) {});
 *   store.set("invoices", id, body);
 *   store.update("tickets", id, patch);
 *   store.remove("tickets", id);
 *   store.ok();                                   // true når der kan skrives
 *
 * Tre backends:
 *   artifact — Claude-artifactens indbyggede database (kun når siden kører som artifact)
 *   rest     — dit eget API (se server/server.mjs). Sæt backend: "rest" i config.js
 *   local    — localStorage. Virker med det samme, men data deles ikke mellem folk.
 *
 * Vil du hoste et andet sted (Supabase, Firebase, din egen backend), så skriv en
 * ny backend med de fem metoder nederst i RestBackend og returnér den fra pick().
 */
window.ZG = window.ZG || {};

(function (ZG) {
  "use strict";

  var COLLECTIONS = ["invoices", "tickets", "tips", "settings", "presets"];

  /* ---------- Artifact-databasen ---------- */

  function ArtifactBackend(db) {
    this.db = db;
  }
  ArtifactBackend.prototype.kind = "artifact";
  ArtifactBackend.prototype.watch = function (col, cb) {
    return this.db.collection(col).onSnapshot(function (snap) {
      cb(snap.docs.map(function (d) {
        // Snapshots er frosne — kopiér før vi lægger id'et på, ellers kaster det i strict mode.
        var v = Object.assign({}, d.data() || {});
        v.id = d.id;
        return v;
      }));
    }, function () { cb([]); });
  };
  ArtifactBackend.prototype.add = function (col, body) {
    return this.db.collection(col).add(body).then(function (ref) { return ref.id; });
  };
  ArtifactBackend.prototype.set = function (col, id, body) {
    return this.db.doc(col + "/" + id).set(body);
  };
  ArtifactBackend.prototype.update = function (col, id, patch) {
    return this.db.doc(col + "/" + id).update(patch);
  };
  ArtifactBackend.prototype.remove = function (col, id) {
    return this.db.doc(col + "/" + id).delete();
  };

  /* ---------- Dit eget API ---------- *
   * Forventet kontrakt (se server/server.mjs for en færdig implementation):
   *   GET    <apiBase>/<collection>            -> [{id, ...}, ...]
   *   POST   <apiBase>/<collection>            -> {id}          (opretter)
   *   PUT    <apiBase>/<collection>/<id>       -> {ok:true}     (erstatter)
   *   PATCH  <apiBase>/<collection>/<id>       -> {ok:true}     (fletter ind)
   *   DELETE <apiBase>/<collection>/<id>       -> {ok:true}
   * Der er ingen websockets — vi poller. Simpelt, og rigeligt til formålet.
   */

  var TOKEN_KEY = "zachgpt-admin-token";

  function RestBackend(base, pollMs) {
    this.base = String(base).replace(/\/+$/, "");
    this.pollMs = pollMs || 4000;
    this.timers = {};
    try { this.token = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { this.token = ""; }
  }
  RestBackend.prototype.kind = "rest";

  RestBackend.prototype.req = function (method, path, body) {
    var headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (this.token) headers["X-ZG-Token"] = this.token;

    return fetch(this.base + path, {
      method: method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) {
        var err = new Error("adgangskode kræves");
        err.code = "unauthorised";
        throw err;
      }
      if (!r.ok) throw new Error(method + " " + path + " svarede " + r.status);
      return r.status === 204 ? null : r.json();
    });
  };

  /* Er der overhovedet sat en adgangskode på serveren? */
  RestBackend.prototype.authRequired = function () {
    return this.req("GET", "/auth").then(function (r) { return !!(r && r.required); })
      .catch(function () { return false; });
  };

  RestBackend.prototype.hasToken = function () { return !!this.token; };

  RestBackend.prototype.login = function (password) {
    var self = this;
    return this.req("POST", "/auth", { password: password }).then(function (r) {
      self.token = (r && r.token) || "";
      try { localStorage.setItem(TOKEN_KEY, self.token); } catch (e) { /* privat vindue */ }
      return true;
    });
  };

  RestBackend.prototype.logout = function () {
    this.token = "";
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ligegyldigt */ }
  };

  RestBackend.prototype.watch = function (col, cb) {
    var self = this, stopped = false, last = "";
    function tick() {
      if (stopped) return;
      self.req("GET", "/" + col).then(function (docs) {
        if (stopped) return;
        var sig = JSON.stringify(docs);
        if (sig !== last) { last = sig; cb(docs || []); }
      }).catch(function () { /* netværksbump — vi prøver igen ved næste tick */ })
        .then(function () { if (!stopped) self.timers[col] = setTimeout(tick, self.pollMs); });
    }
    tick();
    return function () { stopped = true; clearTimeout(self.timers[col]); };
  };

  RestBackend.prototype.add = function (col, body) {
    return this.req("POST", "/" + col, body).then(function (r) { return r.id; });
  };
  RestBackend.prototype.set = function (col, id, body) {
    return this.req("PUT", "/" + col + "/" + encodeURIComponent(id), body);
  };
  RestBackend.prototype.update = function (col, id, patch) {
    return this.req("PATCH", "/" + col + "/" + encodeURIComponent(id), patch);
  };
  RestBackend.prototype.remove = function (col, id) {
    return this.req("DELETE", "/" + col + "/" + encodeURIComponent(id));
  };

  /* ---------- localStorage ---------- *
   * Data lever kun i den her browser. Fint til at bygge videre på appen,
   * ubrugeligt til at dele med kolleger.
   */

  function LocalBackend(key) {
    var self = this;
    this.key = key || "zachgpt-support";
    this.listeners = {};
    window.addEventListener("storage", function (e) {
      if (e.key === self.key) self.emitAll();
    });
  }
  LocalBackend.prototype.kind = "local";

  LocalBackend.prototype.read = function () {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; }
    catch (e) { return {}; }
  };
  LocalBackend.prototype.write = function (all) {
    try { localStorage.setItem(this.key, JSON.stringify(all)); } catch (e) { /* fuld eller blokeret */ }
    this.emitAll();
  };
  LocalBackend.prototype.docs = function (col) {
    var bucket = this.read()[col] || {};
    return Object.keys(bucket).map(function (id) {
      var v = Object.assign({}, bucket[id]);
      v.id = id;
      return v;
    });
  };
  LocalBackend.prototype.emit = function (col) {
    (this.listeners[col] || []).forEach(function (cb) { cb(); });
  };
  LocalBackend.prototype.emitAll = function () {
    var self = this;
    COLLECTIONS.forEach(function (c) { self.emit(c); });
  };
  LocalBackend.prototype.watch = function (col, cb) {
    var self = this;
    function deliver() { cb(self.docs(col)); }
    (this.listeners[col] = this.listeners[col] || []).push(deliver);
    setTimeout(deliver, 0);
    return function () {
      self.listeners[col] = (self.listeners[col] || []).filter(function (f) { return f !== deliver; });
    };
  };
  LocalBackend.prototype.add = function (col, body) {
    var id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return this.set(col, id, body).then(function () { return id; });
  };
  LocalBackend.prototype.set = function (col, id, body) {
    var all = this.read();
    all[col] = all[col] || {};
    all[col][id] = body;
    this.write(all);
    return Promise.resolve();
  };
  LocalBackend.prototype.update = function (col, id, patch) {
    var all = this.read();
    all[col] = all[col] || {};
    if (!all[col][id]) return Promise.reject(new Error("findes ikke"));
    all[col][id] = Object.assign({}, all[col][id], patch);
    this.write(all);
    return Promise.resolve();
  };
  LocalBackend.prototype.remove = function (col, id) {
    var all = this.read();
    if (all[col]) delete all[col][id];
    this.write(all);
    return Promise.resolve();
  };

  /* ---------- Valg af backend ---------- */

  /* Findes der et API på apiBase? Ét kald afgør det. Fejler det — også på
     file:// hvor fetch slet ikke må — falder vi tilbage på localStorage. */
  function probeRest(cfg) {
    if (typeof fetch !== "function") return Promise.resolve(null);
    var base = String(cfg.apiBase).replace(/\/+$/, "");
    return fetch(base + "/settings").then(function (r) {
      return r.ok ? new RestBackend(cfg.apiBase, cfg.pollMs) : null;
    }).catch(function () { return null; });
  }

  function pick(cfg) {
    if (cfg.backend === "rest") return Promise.resolve(new RestBackend(cfg.apiBase, cfg.pollMs));
    if (cfg.backend === "local") return Promise.resolve(new LocalBackend(cfg.storageKey));

    /* "auto": artifact-databasen først, så dit eget API, ellers localStorage.
       Den samme byggede fil virker dermed både som artifact og på webhotellet. */
    function fallback() {
      return probeRest(cfg).then(function (rest) {
        return rest || new LocalBackend(cfg.storageKey);
      });
    }

    if (!window.claude || !window.claude.use) return fallback();
    return window.claude.use("db").then(function (db) {
      return db ? new ArtifactBackend(db) : fallback();
    }, fallback);
  }

  ZG.createStore = function (config) {
    var cfg = Object.assign(
      { backend: "auto", apiBase: "/api", pollMs: 4000, storageKey: "zachgpt-support" },
      window.ZG_CONFIG || {}, config || {}
    );
    var backend = null;

    return {
      init: function () {
        return pick(cfg).then(function (b) { backend = b; return b.kind; });
      },
      kind: function () { return backend ? backend.kind : null; },
      ok: function () { return !!backend; },
      watch: function (col, cb) { return backend ? backend.watch(col, cb) : function () {}; },

      /* Adgangskode findes kun på REST-backenden. Artifacten har sine egne
         regler, og localStorage har ingen at beskytte sig imod. */
      authRequired: function () {
        return backend && backend.authRequired ? backend.authRequired() : Promise.resolve(false);
      },
      hasToken: function () { return !!(backend && backend.hasToken && backend.hasToken()); },
      login: function (pw) {
        return backend && backend.login ? backend.login(pw) : Promise.reject(new Error("ikke muligt her"));
      },
      logout: function () { if (backend && backend.logout) backend.logout(); },

      add: function (col, body) { return backend ? backend.add(col, body) : Promise.reject(new Error("intet datalag")); },
      set: function (col, id, body) { return backend ? backend.set(col, id, body) : Promise.reject(new Error("intet datalag")); },
      update: function (col, id, patch) { return backend ? backend.update(col, id, patch) : Promise.reject(new Error("intet datalag")); },
      remove: function (col, id) { return backend ? backend.remove(col, id) : Promise.reject(new Error("intet datalag")); }
    };
  };

  ZG.ArtifactBackend = ArtifactBackend;
  ZG.RestBackend = RestBackend;
  ZG.LocalBackend = LocalBackend;
})(window.ZG);
