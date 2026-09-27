/* ReviseHub auth — dual mode.
   • Server mode: when the site is served behind the Cloudflare Worker, this talks to
     /api/login, /api/me, /api/logout (HttpOnly session cookie + KV-backed users).
   • Local/demo mode: on a plain static host it falls back to assets/users.json.
   The site works unchanged on GitHub Pages (demo) or Cloudflare (real gating). */
(function () {
  "use strict";
  var LS = "rh:session";
  var LEVEL = { basic: 1, pro: 2, max: 3, admin: 4 };

  function root() { return document.body.getAttribute("data-tier") ? "../" : ""; }
  function localSession() { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } }
  function saveLocal(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} }

  async function sha256hex(str) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  async function pbkdf2hex(pw, saltHex, iters) {
    var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(saltHex), iterations: iters, hash: "SHA-256" }, key, 256);
    return Array.from(new Uint8Array(bits)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  async function checkPassword(password, rec) {
    if (rec.algo === "pbkdf2") return (await pbkdf2hex(password, rec.salt, rec.iters || 120000)) === rec.hash;
    return (await sha256hex(rec.salt + password)) === rec.hash; // legacy
  }

  var SH = {
    state: null,
    mode: "local",
    LEVEL: LEVEL,
    root: root,

    async ready() {
      if (this._ready) return this.state;
      try {
        var r = await fetch(root() + "api/me", { credentials: "same-origin" });
        if (r.ok) { this.mode = "server"; this.state = await r.json(); this._ready = true; return this.state; }
        if (r.status === 401) { this.mode = "server"; this.state = null; this._ready = true; return null; }
      } catch (e) { /* not behind the worker */ }
      this.mode = "local";
      this.state = localSession();
      this._ready = true;
      return this.state;
    },

    async login(user, pass) {
      if (this.mode === "server") {
        try {
          var r = await fetch(root() + "api/login", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ u: user, p: pass })
          });
          if (r.ok) { this.state = await r.json(); return this.state; }
          if (r.status === 401) return null;
        } catch (e) {}
      }
      // local/demo mode: verify against assets/users.json
      var res = await fetch(root() + "assets/users.json", { cache: "no-store" });
      var data = await res.json();
      var rec = data.users[user];
      if (!rec) return null;
      if (!(await checkPassword(pass, rec))) return null;
      this.state = { u: user, tier: rec.tier, ts: Date.now() };
      saveLocal(this.state);
      return this.state;
    },

    async logout() {
      if (this.mode === "server") { try { await fetch(root() + "api/logout", { method: "POST", credentials: "same-origin" }); } catch (e) {} }
      try { localStorage.removeItem(LS); } catch (e) {}
      location.href = root() + "login.html";
    },

    requireTier(min) {
      var lvl = this.state ? (LEVEL[this.state.tier] || 0) : 0;
      if (lvl < LEVEL[min]) {
        location.replace(root() + "login.html?next=" + encodeURIComponent(location.pathname + location.hash));
        return null;
      }
      return this.state;
    },

    chip() {
      var el = document.getElementById("userchip"); if (!el) return;
      var s = this.state;
      if (s) {
        el.innerHTML = '<span class="who">' + s.u + " \u00b7 " + s.tier.toUpperCase() + '</span>' +
                       '<button class="iconbtn" id="logout">Logout</button>';
        el.querySelector("#logout").addEventListener("click", function () { SH.logout(); });
      } else {
        el.innerHTML = '<a class="iconbtn" href="' + root() + 'login.html">Login</a>';
      }
    }
  };

  window.SH = SH;
})();
