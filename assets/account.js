/* ===========================================================================
   ReviseHub — account page (plan info + change password).
   =========================================================================== */
(function () {
  "use strict";
  var SH = window.SH;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var note = document.getElementById("account-note");

  function say(m, ok) { if (!note) return; note.textContent = m; note.style.display = ""; note.style.color = ok ? "var(--c-golden)" : "var(--c-trap)"; }

  (async function () {
    await SH.ready();
    var s = SH.state;
    if (!s) { location.replace("login.html?next=" + encodeURIComponent(location.pathname)); return; }
    document.getElementById("acc-user").textContent = s.u;
    document.getElementById("acc-tier").textContent = ({ basic: "Basic \u2014 Java + DSA", pro: "Pro \u2014 + Spring Boot & Interview Playbook", max: "Max \u2014 everything + HLD, LLD, AI", admin: "Admin \u2014 full access" })[s.tier] || s.tier;
    document.getElementById("acc-upgrade").style.display = (s.tier === "basic" || s.tier === "pro") ? "" : "none";
  })();

  var form = document.getElementById("pw-form");
  if (form) form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var oldp = document.getElementById("old-pw").value, np = document.getElementById("new-pw").value, np2 = document.getElementById("new-pw2").value;
    if (np.length < 8) return say("New password must be at least 8 characters.");
    if (np !== np2) return say("New passwords do not match.");
    var btn = form.querySelector("button"); btn.disabled = true; btn.textContent = "Updating\u2026";
    try {
      var r = await fetch("api/change-password", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ old: oldp, new: np }) });
      if (r.status === 404 || r.status === 501) { say("Password change is available on the deployed site (requires the server)."); }
      else if (r.ok) { say("Password updated. Use it next time you log in.", true); form.reset(); }
      else { var j = await r.json().catch(function () { return {}; }); say(j.error === "bad_old" ? "Current password is incorrect." : "Could not update password."); }
    } catch (ex) { say("Could not update password (server unavailable)."); }
    btn.disabled = false; btn.textContent = "Update password";
  });
})();
