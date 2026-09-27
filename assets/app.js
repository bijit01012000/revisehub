/* ===========================================================================
   ReviseHub — product site behaviour (themes, sidebar, search, bookmarks,
   active section, copy link, login form wiring, tier-aware filtering)
   =========================================================================== */
(async function () {
  "use strict";
  var LS_THEME = "rh:theme", LS_STARS = "rh:stars";
  var THEMES = ["light", "dark", "nord", "dracula", "solarized-light", "solarized-dark", "paper"];
  var SITE = window.SITE || { docs: {}, subjects: [] };
  var TIER = document.body.getAttribute("data-tier") || "";
  function root() { return TIER ? "../" : ""; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function loadJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function SH() { return window.SH || { session: function () { return null; }, LEVEL: {} }; }

  /* theme */
  function currentTheme() { var t = document.documentElement.getAttribute("data-theme"); return THEMES.indexOf(t) !== -1 ? t : "paper"; }
  function applyTheme(t) { if (THEMES.indexOf(t) === -1) t = "paper"; document.documentElement.setAttribute("data-theme", t); store(LS_THEME, t); var s = document.getElementById("theme-select"); if (s) s.value = t; }
  var themeSel = document.getElementById("theme-select");
  applyTheme(currentTheme());
  if (themeSel) themeSel.addEventListener("change", function () { applyTheme(themeSel.value); });

  /* resolve session (server mode via Worker, or local demo mode) */
  await SH().ready();

  /* gate + user chip */
  if (TIER) {
    var s = SH().requireTier(TIER);
    if (!s) return; // redirected to login
  }
  if (window.SH && SH().chip) SH().chip();

  /* mobile sidebar */
  var burger = document.getElementById("hamburger"), scrim = document.querySelector(".scrim");
  if (burger) burger.addEventListener("click", function () { document.body.classList.toggle("nav-open"); });
  if (scrim) scrim.addEventListener("click", function () { document.body.classList.remove("nav-open"); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".sidebar a");
    if (a && window.matchMedia("(max-width: 1000px)").matches) document.body.classList.remove("nav-open");
  });

  /* login form */
  var form = document.getElementById("login-form");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var err = document.getElementById("login-err"); err.textContent = "";
      var u = document.getElementById("username").value.trim();
      var p = document.getElementById("password").value;
      var btn = form.querySelector("button"); btn.disabled = true; btn.textContent = "Logging in\u2026";
      try {
        var s = await SH().login(u, p);
        if (!s) { err.textContent = "Invalid username or password."; btn.disabled = false; btn.textContent = "Login"; return; }
        var next = new URLSearchParams(location.search).get("next");
        location.href = next || "app.html";
      } catch (ex) {
        err.textContent = "Login failed. Please try again.";
        btn.disabled = false; btn.textContent = "Login";
      }
    });
  }

  /* app dashboard: hide locked cards for pro users */
  var appGrid = document.getElementById("app-grid");
  if (appGrid) {
    var sess = SH().state;
    var lvl = sess ? (SH().LEVEL[sess.tier] || 0) : 0;
    var locked = 0;
    appGrid.querySelectorAll(".subject-card[data-tier]").forEach(function (c) {
      var need = SH().LEVEL[c.getAttribute("data-tier")] || 1;
      if (need > lvl) { c.classList.add("locked"); c.setAttribute("aria-disabled", "true");
        c.href = "#pricing"; c.querySelector(".sc-meta").textContent = "Locked \u2014 upgrade to Max";
        c.addEventListener("click", function (e) { e.preventDefault(); location.href = "../index.html#pricing"; });
        locked++;
      }
    });
    if (lvl < 3 && locked) { var un = document.getElementById("upgrade-note"); if (un) un.style.display = ""; }
    
  }

  /* bookmarks */
  var stars = loadJSON(LS_STARS, []);
  function isStarred(s) { return stars.indexOf(s) !== -1; }
  function saveStars() { store(LS_STARS, JSON.stringify(stars)); renderBookmarks(); }
  function renderBookmarks() {
    var block = document.getElementById("bookmarks"), list = document.getElementById("bookmarks-list");
    if (!block || !list) return; list.innerHTML = "";
    if (!stars.length) { block.style.display = "none"; return; }
    block.style.display = "";
    stars.forEach(function (slug) {
      var d = SITE.docs[slug]; if (!d) return;
      var li = document.createElement("li"); li.className = "side-link-row";
      var a = document.createElement("a"); a.href = root() + d.url; a.textContent = d.title; a.title = d.subject + " \u203a " + d.title;
      var b = document.createElement("button"); b.className = "star on"; b.textContent = "\u2605"; b.title = "Remove bookmark";
      b.addEventListener("click", function (e) { e.preventDefault(); stars = stars.filter(function (x) { return x !== slug; }); saveStars(); syncStars(); });
      li.appendChild(a); li.appendChild(b); list.appendChild(li);
    });
  }
  function syncStars() {
    document.querySelectorAll(".star[data-doc]").forEach(function (btn) {
      var slug = btn.getAttribute("data-doc"), on = isStarred(slug), label = btn.getAttribute("data-label");
      btn.classList.toggle("on", on); btn.textContent = label ? ((on ? "\u2605 " : "\u2606 ") + label) : (on ? "\u2605" : "\u2606");
    });
  }
  document.querySelectorAll(".star[data-doc]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var slug = btn.getAttribute("data-doc");
      if (isStarred(slug)) stars = stars.filter(function (x) { return x !== slug; }); else stars.push(slug);
      saveStars(); syncStars();
    });
  });

  /* search (tier-filtered) */
  var sideResults = document.getElementById("search-results");
  var sideInput = document.getElementById("q");
  if (sideInput && sideResults) {
    sideInput.addEventListener("input", function () {
      var term = sideInput.value.trim().toLowerCase();
      if (term.length < 2) { sideResults.classList.remove("show"); sideResults.innerHTML = ""; return; }
      var sess = SH().state; var lvl = sess ? (SH().LEVEL[sess.tier] || 0) : 2;
      var hits = (window.SEARCH_INDEX || []).filter(function (r) {
        return (SH().LEVEL[r.tier] || 1) <= lvl && r.text.toLowerCase().indexOf(term) !== -1;
      }).slice(0, 60);
      sideResults.classList.add("show");
      sideResults.innerHTML = hits.length
        ? hits.map(function (r) {
            return '<a class="sr-item" href="' + root() + esc(r.url) + '"><span class="sr-lect">' + esc(r.subject) + " \u203a " + esc(r.doc) + '</span> ' + esc(r.section || r.doc) + "</a>";
          }).join("")
        : '<div class="sr-empty">No matches for "' + esc(term) + '"</div>';
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !e.target.matches("input,textarea") && sideInput) { e.preventDefault(); sideInput.focus(); }
  });

  /* active section */
  var secLinks = document.querySelectorAll(".sections a");
  if (secLinks.length) {
    var map = {}; secLinks.forEach(function (a) { var id = a.getAttribute("href").split("#")[1]; if (id) map[id] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting && map[en.target.id]) { secLinks.forEach(function (a) { a.classList.remove("active"); }); map[en.target.id].classList.add("active"); } });
    }, { rootMargin: "-70px 0px -75% 0px", threshold: 0 });
    document.querySelectorAll(".article h2[id]").forEach(function (h) { io.observe(h); });
  }

  /* heading anchors + copy link */
  document.querySelectorAll(".article h2[id], .article h3[id]").forEach(function (h) {
    var b = document.createElement("button"); b.className = "anchor-btn"; b.textContent = "#"; b.title = "Copy link to this section";
    b.addEventListener("click", function () { copy(location.href.split("#")[0] + "#" + h.id, b); });
    h.appendChild(b);
  });
  var cl = document.getElementById("copy-link");
  if (cl) cl.addEventListener("click", function () { copy(location.href.split("#")[0], cl); });
  function copy(text, el) { var done = function () { var o = el.textContent; el.textContent = "copied"; setTimeout(function () { el.textContent = o; }, 1100); }; if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done(); }

  renderBookmarks(); syncStars();
})();
