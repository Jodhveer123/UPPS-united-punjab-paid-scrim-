async function load() {
  const r = await fetch("/api/auth/me");
  if (r.status === 401) {
    location.href = "/login.html";
    return;
  }

  const d = await r.json();
  const p = d.player;

  const a = await fetch("/api/player/registrations").then(x => x.json());
  const rr = await fetch("/api/player/results").then(x => x.json());

  const registrations = a.registrations || [];

  document.getElementById("app").innerHTML = `
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
        <div class="row"><b>Status</b><span>${esc(p.status)}</span></div>
      </section>

      <section class="panel">
        <h2>My registrations</h2>
        ${
          registrations.map(renderRegistration).join("") ||
          '<p class="muted">No registrations yet.</p>'
        }
      </section>
    </div>

    <section class="panel">
      <h2>Eligibility</h2>
      <p class="muted">
        A registration is not automatically a confirmed slot.
        The UPPS organizer must review and approve it before you are eligible to participate.
      </p>
      <div class="eligibility-grid">
        <div class="eligibility-card pending-card">
          <b>⏳ Pending</b>
          <span>Waiting for organizer approval.</span>
        </div>
        <div class="eligibility-card approved-card">
          <b>✅ Approved</b>
          <span>You are eligible for the tournament.</span>
        </div>
        <div class="eligibility-card rejected-card">
          <b>❌ Rejected</b>
          <span>You are not eligible for that tournament.</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Results</h2>
      ${
        (rr.results || []).map(x => `
          <div class="row">
            <b>${esc(x.title)} — Match ${esc(x.match_number)}</b>
            <span>#${esc(x.placement)} • ${esc(x.kills)} kills • ${esc(x.points)} pts</span>
          </div>
        `).join("") ||
        '<p class="muted">No results yet.</p>'
      }
    </section>

    <a class="btn" href="/tournaments.html">Find a tournament</a>
  `;
}

function renderRegistration(x) {
  const status = String(x.status || "PENDING");
  const info = statusInfo(status);

  return `
    <div class="registration-card">
      <div class="row">
        <div>
          <b>${esc(x.title)}</b>
          <small>${esc(x.public_id)} • ${esc(x.mode)}</small>
        </div>
        <span class="status-pill ${info.className}">${esc(info.label)}</span>
      </div>

      <div class="registration-status ${info.className}">
        <strong>${esc(info.title)}</strong>
        <p>${esc(info.message)}</p>
        ${
          status === "VERIFIED"
            ? '<div class="success-note">You are eligible to participate. Follow the tournament instructions when they are published.</div>'
            : ""
        }
      </div>
    </div>
  `;
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
