/* ===========================================================================
   ReviseHub admin dashboard (admin tier only; APIs are gated server-side).
   =========================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function inr(paise) { return "\u20b9" + ((paise || 0) / 100).toLocaleString("en-IN"); }
  function dt(ms) { return ms ? new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "\u2014"; }
  var note = document.getElementById("admin-note");

  async function api(path, opts) {
    var r = await fetch(path, Object.assign({ credentials: "same-origin", headers: { "content-type": "application/json" } }, opts || {}));
    if (r.status === 403) { throw new Error("You are not an admin."); }
    if (!r.ok) { throw new Error("Request failed (" + r.status + ")"); }
    return r.json();
  }

  async function loadStats() {
    var j = await api("api/admin/stats");
    var s = j.stats, t = s.usersByTier || {};
    var cards = [
      ["Users", s.usersTotal, "basic " + (t.basic || 0) + " \u00b7 pro " + (t.pro || 0) + " \u00b7 max " + (t.max || 0) + " \u00b7 admin " + (t.admin || 0)],
      ["Revenue", inr(s.revenueTotal), s.revenueCount + " paid orders"],
      ["Orders", s.ordersTotal, Object.entries(s.ordersByStatus || {}).map(function (e) { return e[0] + " " + e[1]; }).join(" \u00b7 ") || "\u2014"],
      ["By plan", Object.keys(s.revenueByPlan || {}).length ? Object.keys(s.revenueByPlan).map(function (k) { return k + " " + inr(s.revenueByPlan[k].amount); }).join(" \u00b7 ") : "\u2014", "revenue"],
    ];
    $("#admin-stats").innerHTML = cards.map(function (c) {
      return '<div class="stat-card"><div class="stat-v">' + esc(c[1]) + '</div><div class="stat-k">' + esc(c[0]) + '</div><div class="stat-s">' + esc(c[2]) + "</div></div>";
    }).join("");

    $("#recent-orders").innerHTML = rows(s.recentOrders || [], [["id", "Order"], ["username", "User"], ["plan", "Plan"], ["status", "Status"], ["amount", "Amount", inr], ["created_at", "Created", dt]]);
    $("#recent-payments").innerHTML = rows(s.recentPayments || [], [["payment_id", "Payment"], ["order_id", "Order"], ["amount", "Amount", inr], ["status", "Status"], ["created_at", "Created", dt]]);
  }

  function rows(list, cols) {
    if (!list.length) return '<div class="admin-empty">Nothing yet.</div>';
    var head = "<tr>" + cols.map(function (c) { return "<th>" + esc(c[1]) + "</th>"; }).join("") + "</tr>";
    var body = list.map(function (r) {
      return "<tr>" + cols.map(function (c) {
        var v = c[2] ? c[2](r[c[0]]) : r[c[0]];
        return "<td>" + esc(v) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<table class="admin-table"><thead>' + head + "</thead><tbody>" + body + "</tbody></table>";
  }

  async function loadUsers(q) {
    var j = await api("api/admin/users?limit=200" + (q ? "&q=" + encodeURIComponent(q) : ""));
    $("#admin-users").innerHTML = (j.users || []).map(function (u) {
      return '<tr><td>' + esc(u.username) + '</td>' +
        '<td><select class="mini" data-user="' + esc(u.username) + '">' +
          ["basic", "pro", "max", "admin"].map(function (t) { return '<option' + (t === u.tier ? " selected" : "") + ">" + t + "</option>"; }).join("") +
        '</select></td>' +
        '<td><span class="pill ' + (u.status === "disabled" ? "off" : "on") + '">' + esc(u.status) + '</span></td>' +
        '<td>' + esc(dt(u.created_at)) + '</td>' +
        '<td><button class="mini-btn" data-status="' + esc(u.username) + '">' + (u.status === "disabled" ? "Enable" : "Disable") + "</button></td></tr>";
    }).join("") || '<tr><td colspan="5" class="admin-empty">No users.</td></tr>';
  }

  document.addEventListener("change", async function (e) {
    var sel = e.target.closest("select[data-user]"); if (!sel) return;
    try { await api("api/admin/set-tier", { method: "POST", body: JSON.stringify({ username: sel.dataset.user, tier: sel.value }) }); flash("Tier updated for " + sel.dataset.user); }
    catch (ex) { alert(ex.message); loadUsers($("#user-q").value); }
  });
  document.addEventListener("click", async function (e) {
    var b = e.target.closest("button[data-status]"); if (!b) return;
    var u = b.dataset.status, disable = b.textContent === "Disable";
    try { await api("api/admin/set-status", { method: "POST", body: JSON.stringify({ username: u, status: disable ? "disabled" : "active" }) }); flash(u + (disable ? " disabled" : " enabled")); loadUsers($("#user-q").value); }
    catch (ex) { alert(ex.message); }
  });
  var form = document.getElementById("create-user");
  if (form) form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var u = $("#new-user").value.trim(), p = $("#new-pass").value, t = $("#new-tier").value;
    try { await api("api/admin/create-user", { method: "POST", body: JSON.stringify({ username: u, password: p, tier: t }) }); flash("Created " + u); form.reset(); loadUsers($("#user-q").value); }
    catch (ex) { alert(ex.message); }
  });
  var q = $("#user-q");
  if (q) { var timer; q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { loadUsers(q.value); }, 250); }); }

  function flash(m) { if (!note) return; note.textContent = m; note.style.display = ""; setTimeout(function () { note.style.display = "none"; }, 2500); }

  (async function () {
    try { await loadStats(); await loadUsers(""); }
    catch (ex) {
      if (note) { note.style.display = ""; note.textContent = "Admin APIs are available only on the deployed Worker (and you must be logged in as an admin). " + ex.message; }
    }
  })();
})();
