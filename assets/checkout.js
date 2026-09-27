/* ===========================================================================
   ReviseHub checkout — Razorpay Orders + signature verify, with safe fallbacks.
   The client never decides the price or tier: the Worker creates the order and
   grants access only after verifying the payment signature server-side.
   =========================================================================== */
(function () {
  "use strict";
  var form = document.getElementById("buy-form");
  if (!form) return;

  var plan = form.getAttribute("data-plan");
  var planName = form.getAttribute("data-name");
  var price = form.getAttribute("data-price");
  var fallbackLink = form.getAttribute("data-fallback-link") || "";
  var wa = form.getAttribute("data-wa") || "";
  var mail = form.getAttribute("data-mail") || "";

  var err = document.getElementById("buy-err");
  var btn = form.querySelector('button[type="submit"]');
  var userIn = document.getElementById("buy-username");
  var passIn = document.getElementById("buy-password");
  var pass2In = document.getElementById("buy-password2");
  var fb = document.getElementById("buy-fallback");
  var availMsg = document.getElementById("buy-avail");

  function showErr(m) { err.textContent = m || ""; }
  function fallback(reason) {
    if (fb) {
      fb.style.display = "";
      var note = fb.querySelector(".fb-note");
      if (note) note.textContent = reason || "Online checkout is unavailable right now — complete your payment below and I'll activate your login.";
    }
    if (btn) { btn.disabled = false; btn.textContent = "Pay \u20b9" + price + " securely with Razorpay"; }
  }

  // username availability hint (best-effort)
  if (userIn) {
    userIn.addEventListener("blur", function () {
      var u = userIn.value.trim();
      availMsg.textContent = "";
      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(u)) { if (u) availMsg.textContent = "3\u201332 letters, digits, . _ -"; return; }
      fetch("api/username-available?u=" + encodeURIComponent(u))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && !j.available) availMsg.textContent = "That username is taken."; })
        .catch(function () {});
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    showErr("");
    var u = userIn.value.trim(), p = passIn.value, p2 = pass2In.value;
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(u)) return showErr("Choose a username (3\u201332 letters, digits, . _ -).");
    if (p.length < 8) return showErr("Password must be at least 8 characters.");
    if (p !== p2) return showErr("Passwords do not match.");

    btn.disabled = true; btn.textContent = "Starting secure checkout\u2026";
    var order;
    try {
      var r = await fetch("api/create-order", {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ plan: plan, username: u, password: p })
      });
      if (r.status === 404 || r.status === 503 || r.status === 501) return fallback("Online checkout isn't enabled yet.");
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !j.ok) {
        btn.disabled = false; btn.textContent = "Pay \u20b9" + price + " securely with Razorpay";
        var msg = { username_taken: "That username is taken \u2014 pick another.", username_reserved: "That username is being used in another checkout \u2014 pick another.", weak_password: "Password too weak.", bad_username: "Invalid username.", bad_plan: "Unknown plan." }[j.error];
        return showErr(msg || "Could not start checkout. Please try again.");
      }
      order = j;
    } catch (ex) {
      return fallback("Online checkout is unreachable right now.");
    }

    if (typeof Razorpay === "undefined") return fallback("Payment library could not load.");

    var rzp = new Razorpay({
      key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
      name: "ReviseHub", description: order.name + " plan \u2014 lifetime access",
      prefill: { name: u },
      theme: { color: "#0e7c86" },
      handler: async function (resp) {
        btn.textContent = "Verifying payment\u2026";
        try {
          var v = await fetch("api/verify", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
            body: JSON.stringify({ order_id: order.order_id, payment_id: resp.razorpay_payment_id, signature: resp.razorpay_signature })
          });
          var vj = await v.json().catch(function () { return {}; });
          if (v.ok && vj.ok) { location.href = "thank-you.html?u=" + encodeURIComponent(vj.username || u) + "&plan=" + encodeURIComponent(planName); return; }
          fallback("We could not confirm the payment automatically. Send us your payment ID and we'll fix it instantly.");
          showErr("Payment verification failed \u2014 please contact support with your payment ID.");
        } catch (e2) { fallback("Payment made but verification did not complete \u2014 contact support with your payment ID."); }
      },
      modal: { ondismiss: function () { btn.disabled = false; btn.textContent = "Pay \u20b9" + price + " securely with Razorpay"; showErr("Checkout closed before payment completed."); } }
    });
    rzp.on("payment.failed", function (r) {
      btn.disabled = false; btn.textContent = "Pay \u20b9" + price + " securely with Razorpay";
      var d = (r && r.error && (r.error.description || r.error.reason)) || "Payment failed";
      showErr(d + ". Nothing was charged \u2014 you can try again or contact support.");
    });
    rzp.open();
  });
})();
