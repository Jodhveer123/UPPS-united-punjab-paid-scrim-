async function load() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = '<div class="empty">Loading your player dashboard…</div>';

  try {
    const meResponse = await fetch("/api/auth/me", {credentials:"same-origin", cache:"no-store"});
    if (meResponse.status === 401) { location.href = "/login.html"; return; }
    const me = await meResponse.json().catch(() => ({}));
    if (!meResponse.ok || !me.ok || !me.player) {
      throw new Error(me.error || "Could not load your player profile. Please sign in again.");
    }
    const p = me.player;

    const [registrationsResponse, resultsResponse] = await Promise.all([
      fetch("/api/player/registrations", {credentials:"same-origin", cache:"no-store"}),
      fetch("/api/player/results", {credentials:"same-origin", cache:"no-store"})
    ]);
    if (registrationsResponse.status === 401 || resultsResponse.status === 401) {
      location.href = "/login.html"; return;
    }
    const [registrationsData, resultsData] = await Promise.all([
      registrationsResponse.json().catch(() => ({})),
      resultsResponse.json().catch(() => ({}))
    ]);
    if (!registrationsResponse.ok || !registrationsData.ok) {
      throw new Error(registrationsData.error || "Could not load your registrations. Please refresh in a moment.");
    }
    if (!resultsResponse.ok || !resultsData.ok) {
      throw new Error(resultsData.error || "Could not load tournament results. Please refresh in a moment.");
    }

    const registrations = Array.isArray(registrationsData.registrations) ? registrationsData.registrations : [];
    const results = Array.isArray(resultsData.results) ? resultsData.results : [];

    app.innerHTML = `
      <div class="page-title">
        <div>
          <span class="eyebrow">PLAYER DASHBOARD</span>
          <h1>Welcome, ${esc(p.display_name)}</h1>
          <p class="muted">${esc(p.public_id)}</p>
        </div>
      </div>

      <section class="panel qr-demo-panel">
        <div class="qr-demo-heading">
          <div><span class="eyebrow">LIVE BACKEND DEMO</span><h2>QR Signal Verification</h2>
            <p class="muted">Scan the one-time QR with your phone and send any short letter or text. Watch this dashboard update.</p>
          </div>
          <span class="qr-demo-tag">TEST MODE</span>
        </div>
        <div class="qr-demo-content">
          <div class="qr-demo-art"><div id="demoQrCode"><div class="qr-placeholder">QR will appear here</div></div></div>
          <div class="qr-demo-info">
            <div class="qr-demo-status" id="demoQrStatus" role="status" aria-live="polite"><span class="demo-pulse"></span> Waiting to start a test session</div>
            <p class="muted" id="demoQrHelp">A secure one-time QR expires after five minutes. It does not make a payment or approve a tournament.</p>
            <div class="row"><b>Session ID</b><code id="demoQrSession">—</code></div>
            <button class="btn primary" id="startQrDemo" type="button">Generate QR session</button>
            <button class="btn" id="refreshQrDemo" type="button" hidden>Generate another QR</button>
          </div>
        </div>
      </section>
      <div class="grid2">
        <section class="panel">
          <h2>Profile</h2>
          <div class="row"><b>Username</b><span>${esc(p.username)}</span></div>
          <div class="row"><b>Free Fire UID</b><span>${esc(p.free_fire_uid || "Not set")}</span></div>
          <div class="row"><b>Email</b><span>${esc(p.email || "Not set")}</span></div>
          <div class="row"><b>Status</b><span>${esc(p.status || "ACTIVE")}</span></div>
        </section>
        <section class="panel">
          <h2>My registrations</h2>
          ${registrations.map(x => renderRegistration(x, p.free_fire_uid)).join("") || '<p class="muted">No registrations yet. Join a tournament to see it here.</p>'}
        </section>
      </div>
      <section class="panel">
        <h2>Eligibility</h2>
        <p class="muted">A registration is not automatically a confirmed slot. The UPPS organizer must review and approve it before you are eligible to participate.</p>
        <div class="eligibility-grid">
          <div class="eligibility-card pending-card"><b>⏳ Pending</b><span>Waiting for organizer approval.</span></div>
          <div class="eligibility-card approved-card"><b>✅ Approved</b><span>You are eligible for the tournament.</span></div>
          <div class="eligibility-card rejected-card"><b>❌ Rejected</b><span>You are not eligible for that tournament.</span></div>
        </div>
      </section>
      <section class="panel">
        <h2>Results</h2>
        ${results.map(x => `<div class="row"><b>${esc(x.title)}</b><span>#${esc(x.placement)} • ${esc(x.kills)} kills • ${esc(x.points)} pts</span></div>`).join("") || '<p class="muted">No results yet.</p>'}
      </section>
      <a class="btn" href="/tournaments.html">Find a tournament</a>
    `;

    initQrDemo();

    for (const registration of registrations.filter(x => x.status === "VERIFIED")) {
      loadTournamentRooms(registration.tournament_public_id);
    }
  } catch (error) {
    app.innerHTML = `<section class="panel"><h2>We couldn't load your dashboard</h2><p class="muted">${esc(error.message || "Unexpected error. Please try again.")}</p><button class="btn" id="retryDashboard" type="button">Try again</button></section>`;
    document.getElementById("retryDashboard")?.addEventListener("click", load);
  }
}

async function loadTournamentRooms(tournamentPublicId) {
  const target = [...document.querySelectorAll("[data-room-tournament]")]
    .find(el => el.dataset.roomTournament === tournamentPublicId);
  if (!target) return;
  try {
    const response = await fetch("/api/player/tournaments/" + encodeURIComponent(tournamentPublicId) + "/rooms", {
      credentials: "include",
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      target.innerHTML = `<p class="muted">Room access is unavailable. Your approval may have changed; refresh the page.</p>`;
      return;
    }
    if (!data.matches.length) {
      target.innerHTML = `<p class="muted">Room details have not been added yet.</p>`;
      return;
    }
    target.innerHTML = `<h3>Tournament room</h3>` + data.matches.map(m => `
      <div class="room-access-card">
        <div class="row"><b>Game room</b><span>${esc(m.status)}</span></div>
        ${m.released
          ? `<div class="row"><b>Room ID</b><code>${esc(m.room_id)}</code></div>
             <div class="row"><b>Password</b><code>${esc(m.room_password)}</code></div>`
          : `<p class="muted">${m.room_release_at
              ? `Room details are hidden until ${esc(new Date(m.room_release_at).toLocaleString())}.`
              : "Room details have not been published yet."}</p>`}
      </div>
    `).join("");
  } catch {
    target.innerHTML = `<p class="muted">Could not load room details. Please refresh.</p>`;
  }
}

function renderRegistration(x, profileUid) {
  const status = String(x.status || "PENDING");
  const info = statusInfo(status);
  const paid = x.entry_type === "PAID";
  const paymentStatus = String(x.payment_status || (paid ? "NOT_SUBMITTED" : "NOT_REQUIRED"));
  const canSubmitPayment = paid && ["NOT_SUBMITTED","REJECTED"].includes(paymentStatus) && !["REJECTED","CANCELLED"].includes(status);

  return `
    <div class="registration-card">
      <div class="row">
        <div>
          <b>${esc(x.title)}</b>
          <small>${esc(x.public_id)} • ${esc(x.mode)}</small>
        </div>
        <span class="status-pill ${info.className}">${esc(info.label)}</span>
      </div>
      ${paid ? `
        <div class="registration-status ${paymentStatus==="VERIFIED"?"approved":paymentStatus==="REJECTED"?"rejected":"pending"}">
          <strong>Payment: ${esc(paymentStatus.replaceAll("_"," "))}</strong>
          <p><b>Entry fee:</b> ₹${Number(x.entry_fee||0).toFixed(2)}</p>
          <p>${paymentStatus==="VERIFIED"?"Payment verified by the organizer. Registration approval is still shown separately above.":paymentStatus==="SUBMITTED"?"Your UID is safely submitted and locked while the organizer checks it. Please do not pay again or submit another UID while it is under review.":paymentStatus==="REJECTED"?"Payment reference rejected. Read the organizer note below, check your transaction details, and submit a corrected UID only if needed.":"Pay the exact entry fee using the tournament's official UPPS QR/payment instructions. After the payment succeeds, submit your UID. Verification is manual, so keep your transaction receipt until approved."}</p>
          ${x.payment_note ? `<p><b>Organizer note:</b> ${esc(x.payment_note)}</p>` : ""}
          ${x.utr ? `<p><b>Submitted UID:</b> ${esc(x.utr)}</p>` : ""}
          ${canSubmitPayment ? `
            <form class="payment-reference-form" data-registration="${esc(x.public_id)}">
              <label>Free Fire UID (must match your profile)
                <input name="freeFireUid" inputmode="numeric" pattern="[0-9]{5,20}" minlength="5" maxlength="20" value="${esc(profileUid||"")}" required>
              </label>
              <label>UID
                <input name="utr" minlength="6" maxlength="40" pattern="[A-Za-z0-9-]{6,40}" value="${esc(paymentStatus==="REJECTED"?"":x.utr||"")}" placeholder="Enter your Free Fire UID" required>
              </label>
              <button class="btn primary" type="submit">${paymentStatus==="REJECTED"?"Resubmit corrected UID":"Submit UID"}</button>
              <p class="muted payment-message" role="status" aria-live="polite"></p>
            </form>
          ` : ""}
        </div>` : ""}
      <div class="registration-status ${info.className}">
        <strong>${esc(info.title)}</strong>
        <p>${esc(info.message)}</p>
        ${status === "VERIFIED"
          ? `<div class="success-note">You are eligible to participate. Follow the tournament instructions when they are published.</div>
             <div class="room-access" data-room-tournament="${esc(x.tournament_public_id)}"><p class="muted">Checking tournament room access…</p></div>`
          : ""}
      </div>
    </div>
  `;
}

document.addEventListener("submit", async event => {
  const form = event.target.closest(".payment-reference-form");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const message = form.querySelector(".payment-message");
  const values = new FormData(form);
  button.disabled = true;
  button.textContent = "Submitting…";
  message.textContent = "";
  try {
    const response = await fetch("/api/registrations/" + encodeURIComponent(form.dataset.registration) + "/payment", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      credentials: "same-origin",
      body: JSON.stringify({utr:String(values.get("utr")||"").trim(), freeFireUid:String(values.get("freeFireUid")||"").trim()})
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.href = "/login.html"; return; }
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not submit payment reference.");
    message.textContent = data.message || "Payment reference submitted for review.";
    await load();
  } catch (error) {
    message.textContent = error.message || "Network error. Try again.";
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "Submit UID";
    }
  }
});


let qrDemoPoll = null;
let qrDemoNotified = false;

function initQrDemo() {
  const start = document.getElementById("startQrDemo");
  const again = document.getElementById("refreshQrDemo");
  if (!start || start.dataset.bound) return;
  start.dataset.bound = "1";
  start.addEventListener("click", createQrDemoSession);
  again?.addEventListener("click", createQrDemoSession);
}

async function createQrDemoSession() {
  const start = document.getElementById("startQrDemo");
  const again = document.getElementById("refreshQrDemo");
  const qr = document.getElementById("demoQrCode");
  const status = document.getElementById("demoQrStatus");
  const sessionLabel = document.getElementById("demoQrSession");
  if (!start || !qr || !status) return;
  clearInterval(qrDemoPoll);
  start.disabled = true;
  start.textContent = "Creating secure session…";
  status.textContent = "Connecting to UPPS backend…";
  qr.innerHTML = '<div class="qr-placeholder">Generating secure QR…</div>';
  try {
    const response = await fetch("/api/demo-access/create", {
      method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:"{}"
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.href="/login.html"; return; }
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not create QR session.");
    sessionLabel.textContent = data.sessionId;
    const confirmUrl = location.origin + "/demo-confirm.html?token=" + encodeURIComponent(data.token);
    qr.innerHTML = "";
    if (typeof QRCode === "undefined") {
      qr.innerHTML = '<p class="muted">QR generator did not load. Refresh this page and try again.</p>';
      throw new Error("QR library unavailable.");
    }
    new QRCode(qr, {text:confirmUrl,width:220,height:220,colorDark:"#120d1d",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
    status.innerHTML = '<span class="demo-pulse"></span> QR ready — waiting for your phone';
    start.hidden = true;
    again.hidden = false;
    start.disabled = false;
    start.textContent = "Generate QR session";
    qrDemoNotified = false;
    pollQrDemoStatus(data.sessionId);
  } catch (error) {
    status.textContent = error.message || "Could not start test.";
    start.disabled = false;
    start.textContent = "Try again";
  }
}

function pollQrDemoStatus(sessionId) {
  clearInterval(qrDemoPoll);
  const status = document.getElementById("demoQrStatus");
  const help = document.getElementById("demoQrHelp");
  const poll = async () => {
    try {
      const response = await fetch("/api/demo-access/status/" + encodeURIComponent(sessionId), {
        credentials:"same-origin", cache:"no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Status check failed.");
      if (data.session.status === "TEST_ACCESS_GRANTED") {
        clearInterval(qrDemoPoll);
        status.className = "qr-demo-status granted";
        status.textContent = "✓ ACCESS GRANTED — TEST MODE";
        help.textContent = "Backend confirmation received. Test signal: " + data.session.submitted_text + ". No tournament registration was changed.";
        if (!qrDemoNotified && "Notification" in window && Notification.permission === "granted") {
          new Notification("UPPS test confirmed", {body:"QR signal received. Demo access granted."});
        }
        qrDemoNotified = true;
      } else if (data.session.status === "EXPIRED") {
        clearInterval(qrDemoPoll);
        status.className = "qr-demo-status expired";
        status.textContent = "QR EXPIRED — GENERATE A NEW ONE";
        help.textContent = "This one-time session expired without a confirmation.";
      }
    } catch (error) {
      status.textContent = error.message || "Waiting for backend status…";
    }
  };
  poll();
  qrDemoPoll = setInterval(poll, 2000);
}

function statusInfo(status) {
  if (status === "VERIFIED") {
    return {
      label: "APPROVED",
      title: "✅ You are eligible",
      message: "The organizer approved your registration. Your slot is confirmed.",
      className: "approved"
    };
  }

  if (status === "REJECTED") {
    return {
      label: "REJECTED",
      title: "❌ Not eligible",
      message: "The organizer rejected this registration. You cannot participate in this tournament.",
      className: "rejected"
    };
  }

  if (status === "WAITLISTED") {
    return {
      label: "WAITLISTED",
      title: "🕐 On the waiting list",
      message: "The tournament is currently full. Your registration is not a confirmed slot.",
      className: "waitlisted"
    };
  }

  if (status === "CANCELLED") {
    return {
      label: "CANCELLED",
      title: "Registration cancelled",
      message: "This registration is no longer active.",
      className: "rejected"
    };
  }

  return {
    label: "PENDING",
    title: "⏳ Waiting for approval",
    message: "Your registration was received, but you are NOT eligible to play yet. The organizer must approve your registration first.",
    className: "pending"
  };
}

function esc(x) {
  return String(x ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m]
  );
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/";
});

load();
