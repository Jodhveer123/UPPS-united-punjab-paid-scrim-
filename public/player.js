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
      throw new Error(resultsData.error || "Could not load match results. Please refresh in a moment.");
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
  const canSubmitPayment = paid && paymentStatus !== "VERIFIED" && !["REJECTED","CANCELLED"].includes(status);

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
          <p>${paymentStatus==="VERIFIED"?"Payment verified by the organizer. Registration approval is still shown separately above.":paymentStatus==="SUBMITTED"?"Your UTR has been submitted and is waiting for organizer verification.":paymentStatus==="REJECTED"?"Payment reference rejected. Check the note and submit a corrected UTR.":"Submit your UTR after paying the entry fee. The organizer will verify it manually."}</p>
          ${x.payment_note ? `<p><b>Organizer note:</b> ${esc(x.payment_note)}</p>` : ""}
          ${x.utr ? `<p><b>Submitted UTR:</b> ${esc(x.utr)}</p>` : ""}
          ${canSubmitPayment ? `
            <form class="payment-reference-form" data-registration="${esc(x.public_id)}">
              <label>Free Fire UID (must match your profile)
                <input name="freeFireUid" inputmode="numeric" pattern="[0-9]{5,20}" minlength="5" maxlength="20" value="${esc(profileUid||"")}" required>
              </label>
              <label>UTR / transaction reference
                <input name="utr" minlength="6" maxlength="40" pattern="[A-Za-z0-9-]{6,40}" value="${esc(x.utr||"")}" placeholder="Enter UTR from your payment app" required>
              </label>
              <button class="btn primary" type="submit">${paymentStatus==="REJECTED"?"Resubmit payment reference":"Submit payment reference"}</button>
              <p class="muted payment-message" role="status" aria-live="polite"></p>
            </form>
          ` : ""}
        </div>` : ""}
      <div class="registration-status ${info.className}">
        <strong>${esc(info.title)}</strong>
        <p>${esc(info.message)}</p>
        ${status === "VERIFIED"
          ? `<div class="success-note">You are eligible to participate. Follow the tournament instructions when they are published.</div>
             <div class="room-access" data-room-tournament="${esc(x.tournament_public_id)}"><p class="muted">Checking match room access…</p></div>`
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
      button.textContent = "Submit payment reference";
    }
  }
});

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
