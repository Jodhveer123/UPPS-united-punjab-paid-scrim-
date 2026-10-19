
const id = new URLSearchParams(location.search).get("id");

fetch("/api/tournaments/" + encodeURIComponent(id))
  .then(r => r.json())
  .then(d => {
    if (!d.ok) throw Error(d.error);

    const t = d.tournament;
    document.title = t.title + " — UPPS";

    document.getElementById("app").innerHTML = `
      <div class="hero compact">
        <div>
          <span class="eyebrow">${esc(t.status)}</span>
          <h1>${esc(t.title)}</h1>
          <p>${esc(t.description)}</p>

          <div class="meta big">
            <span>${esc(t.mode)}</span>
            <span>${t.entry_type === "PAID" ? "Paid tournament" : "FREE"}</span>
            <span>${esc(t.verified_count)}/${esc(t.capacity)} confirmed</span>
          </div>

          <button class="btn" id="registerBtn" type="button">Register</button>
        </div>
      </div>

      <section class="panel registration-notice">
        <h2>How registration works</h2>
        <ol>
          <li>Create your UPPS Player ID and log in.</li>
          <li>Click Register and review the registration window.</li>
          <li>New players must press Submit Registration to create their registration.</li>
          <li>Your registration starts as Pending.</li>
          <li>The organizer reviews your registration.</li>
          <li>For paid tournaments, follow the payment instructions. For free tournaments, you can skip payment. Check your WhatsApp number or player page for updates.</li>
        </ol>

        <p class="warning-note">
          <b>Important:</b>
          Registering does not automatically confirm your slot. Paid registrations require payment verification; free tournaments do not require payment. Contact the Help Centre if you need assistance.
        </p>
      </section>

      <div class="grid2">
        <section class="panel">
          <h2>Rules</h2>
          <pre>${esc(t.rules || "Rules will be published by the organizer.")}</pre>
        </section>

        <section class="panel">
          <h2>Prizes</h2>
          <div>
            ${
              (d.prizes || []).map(p => `
                <div class="row">
                  <b>${esc(p.position_label)}</b>
                  <span>₹${Number(p.amount).toFixed(0)}</span>
                </div>
              `).join("") ||
              '<div class="muted">Prize structure not published yet.</div>'
            }
          </div>
        </section>
      </div>

      <section class="panel">
        <h2>Matches</h2>
        <div>
          ${
            (d.matches || []).map(m => `
              <div class="row">
                <b>Match ${esc(m.match_number)}</b>
                <span>${esc(m.status)}</span>
              </div>
            `).join("") ||
            '<div class="muted">Matches will appear here.</div>'
          }
        </div>
      </section>

      <section class="panel">
        <h2>Leaderboard</h2>
        <div id="lb">Loading…</div>
      </section>

      <section class="panel" id="reviewsSection">
        <h2>Reviews</h2>

        <form id="reviewForm" class="review-form">
          <h3>Write a review</h3>
          <p class="muted">Only players with a verified registration for this tournament can submit a review. One review per player per tournament.</p>

          <label for="reviewRating">Your rating</label>
          <select id="reviewRating" name="rating" required>
            <option value="">Choose stars</option>
            <option value="5">★★★★★ — Excellent</option>
            <option value="4">★★★★☆ — Very good</option>
            <option value="3">★★★☆☆ — Good</option>
            <option value="2">★★☆☆☆ — Fair</option>
            <option value="1">★☆☆☆☆ — Poor</option>
          </select>

          <label for="reviewText">Your feedback</label>
          <textarea id="reviewText" name="reviewText" rows="4" maxlength="1000" placeholder="Tell us about your tournament experience..." required></textarea>

          <button class="btn" id="submitReviewBtn" type="submit">Submit Review</button>
          <p id="reviewFormMessage" class="muted" role="status" aria-live="polite"></p>
        </form>

        <div id="reviewList">
          ${
            (d.reviews || []).map(x => `
              <div class="review">
                <b>
                  ${esc(x.display_name)}
                  •
                  ${"★".repeat(Number(x.rating || 0))}
                  ${"☆".repeat(Math.max(0, 5 - Number(x.rating || 0)))}
                </b>
                <p>${esc(x.review_text)}</p>
              </div>
            `).join("") ||
            '<div class="muted">No reviews yet.</div>'
          }
        </div>
      </section>
    `;

    document.getElementById("registerBtn")
      .addEventListener("click", openRegistrationWindow);

    document.getElementById("reviewForm")
      .addEventListener("submit", submitReview);

    loadLB();
  })
  .catch(e => {
    document.getElementById("app").innerHTML =
      '<div class="empty">' + esc(e.message) + "</div>";
  });


/* =========================================================
   SUBMIT TOURNAMENT REVIEW
========================================================= */

async function submitReview(event) {
  event.preventDefault();

  const form = document.getElementById("reviewForm");
  const button = document.getElementById("submitReviewBtn");
  const message = document.getElementById("reviewFormMessage");
  const rating = Number(document.getElementById("reviewRating").value);
  const reviewText = document.getElementById("reviewText").value.trim();

  if (!rating || rating < 1 || rating > 5) {
    message.textContent = "Please choose a rating from 1 to 5 stars.";
    return;
  }

  if (!reviewText) {
    message.textContent = "Please write your feedback before submitting.";
    return;
  }

  button.disabled = true;
  button.textContent = "Submitting...";
  message.textContent = "";

  try {
    const response = await fetch(
      "/api/tournaments/" + encodeURIComponent(id) + "/review",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ rating, reviewText })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      location.href = "/login.html";
      return;
    }

    if (!response.ok || !data.ok) {
      message.textContent = data.error || "Could not submit your review.";
      return;
    }

    form.reset();
    message.textContent =
      "Thank you! Your review was submitted successfully. It will appear according to the site's review approval settings.";
  } catch (error) {
    message.textContent = "Network error. Please check your connection and try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Submit Review";
  }
}


/* =========================================================
   OPEN REGISTRATION WINDOW
========================================================= */

async function openRegistrationWindow() {
  const registerButton = document.getElementById("registerBtn");
  if (registerButton) {
    if (registerButton.dataset.checking === "true") return;
    registerButton.dataset.checking = "true";
    registerButton.disabled = true;
    registerButton.dataset.originalText = registerButton.textContent;
    registerButton.textContent = "Checking account…";
  }

  try {
    const authCheck = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    if (authCheck.status === 401) {
      location.href = "/login.html";
      return;
    }
    if (!authCheck.ok) throw new Error("Could not verify your account. Please try again.");

    const response = await fetch(
      "/api/tournaments/" + encodeURIComponent(id) + "/registration",
      { credentials: "same-origin", cache: "no-store" }
    );
    if (response.status === 401) {
      location.href = "/login.html";
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Could not check your registration. Please try again.");
    }

    if (data.registered) showRegistrationModal(data.registration, true);
    else showRegistrationModal(null, false);
  } catch (error) {
    alert(error.message || "Network error while checking registration. Please try again.");
  } finally {
    if (registerButton) {
      registerButton.disabled = false;
      registerButton.dataset.checking = "false";
      registerButton.textContent = registerButton.dataset.originalText || "Register";
    }
  }
}

/* =========================================================
   REGISTRATION MODAL
========================================================= */

function showRegistrationModal(registration, alreadyRegistered) {
  const old = document.getElementById("registrationModal");
  if (old) old.remove();

  const modal = document.createElement("div");
  modal.id = "registrationModal";
  modal.className = "modal-backdrop";

  const statusHTML = alreadyRegistered
    ? `
      <span class="eyebrow">ALREADY REGISTERED</span>
      <h2 id="modalTitle">You are already registered</h2>
      <div class="modal-icon">✓</div>
      <p>You already have a registration for this tournament.</p>

      <div class="modal-status">
        <div>
          <span>Registration ID</span>
          <b>${esc(registration.public_id)}</b>
        </div>
        <div>
          <span>Status</span>
          <b>${esc(registration.status)}</b>
        </div>
      </div>

      <p class="muted">You cannot create another registration for the same tournament.</p>
    `
    : `
      <span class="eyebrow">TOURNAMENT REGISTRATION</span>
      <h2 id="modalTitle">Ready to register?</h2>
      <div class="modal-icon">📝</div>
      <p>Review the information below. Your registration will only be created when you press <b>Submit Registration</b>.</p>
    `;

  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <button class="modal-close" id="modalClose" type="button" aria-label="Close">×</button>

      ${statusHTML}

      <div class="whatsapp-section">
        <h3>Payment instructions</h3>
        <p class="muted">For paid tournaments, follow the organizer's payment instructions. Free tournaments do not require payment.also when do payment write your free fire uid to check its you. Contact the Help Centre if you need help.</p>

        <img src="qr.jpg" alt="UPPS payment QR Code" class="whatsapp-qr">

        <a href="#" id="whatsappJoinBtn" class="btn">
          Join our WhatsApp for updates
        </a>
      </div>

      ${
        alreadyRegistered
          ? `
            <div class="modal-actions">
              <a class="btn" href="/player.html">Open Player Dashboard</a>
              <button class="btn ghost" id="modalDone" type="button">Done</button>
            </div>
          `
          : `
            <div class="modal-actions">
              <button class="btn" id="submitRegistration" type="button">Submit Registration</button>
              <button class="btn ghost" id="modalDone" type="button">Cancel</button>
            </div>
          `
      }
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();

  document.getElementById("modalClose").addEventListener("click", close);
  document.getElementById("modalDone").addEventListener("click", close);

  modal.addEventListener("click", event => {
    if (event.target === modal) close();
  });

  if (!alreadyRegistered) {
    document.getElementById("submitRegistration")
      .addEventListener("click", submitRegistration);
  }

  document.getElementById("whatsappJoinBtn")
    .addEventListener("click", event => {
      event.preventDefault();
      window.open("YOUR_WHATSAPP_GROUP_LINK", "_blank", "noopener,noreferrer");
    });
}

/* =========================================================
   ACTUALLY SUBMIT REGISTRATION
========================================================= */

async function submitRegistration() {
  const button = document.getElementById("submitRegistration");
  if (!button) return;

  button.disabled = true;
  button.textContent = "Submitting...";

  try {
    const r = await fetch(
      "/api/tournaments/" + encodeURIComponent(id) + "/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }
    );

    const d = await r.json();

    if (r.status === 401) {
      location.href = "/login.html";
      return;
    }

    if (r.status === 409) {
      alert("You are already registered for this tournament.");

      const modal = document.getElementById("registrationModal");
      if (modal) modal.remove();

      await openRegistrationWindow();
      return;
    }

    if (!d.ok) {
      alert(d.error || "Registration failed.");
      return;
    }

    showSubmittedModal(d.registration);
  } catch (e) {
    alert("Could not submit registration.");
  } finally {
    const current = document.getElementById("submitRegistration");

    if (current) {
      current.disabled = false;
      current.textContent = "Submit Registration";
    }
  }
}


/* =========================================================
   AFTER SUCCESSFUL SUBMISSION
========================================================= */

function showSubmittedModal(registration) {
  const old = document.getElementById("registrationModal");
  if (old) old.remove();

  const modal = document.createElement("div");
  modal.id = "registrationModal";
  modal.className = "modal-backdrop";

  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <button class="modal-close" id="modalClose" type="button" aria-label="Close">×</button>

      <span class="eyebrow">REGISTRATION RECEIVED</span>
      <h2 id="modalTitle">Your registration is pending</h2>
      <div class="modal-icon">⏳</div>

      <p>
        Your registration has been submitted successfully.
        <b>You are not eligible to play yet.</b>
      </p>

      <div class="modal-status">
        <div>
          <span>Registration ID</span>
          <b>${esc(registration.public_id)}</b>
        </div>
        <div>
          <span>Status</span>
          <b>${esc(registration.status)}</b>
        </div>
      </div>

      <p class="muted">
        The organizer must review your registration and approve it before your slot is confirmed.
      </p>

      <div class="whatsapp-section">
        <h3>Join our WhatsApp group</h3>
        <p class="muted">
          You can pay match fees on this qr. If tournament is free of fees then you skip it. Your registration will checked and also payment if entry fees needed. It requires organizer verification.
        </p>

        <img src="qr.jpg" alt="payment QR Code" class="whatsapp-qr">

        <a href="#" id="whatsappJoinBtn" class="btn">Join WhatsApp Group</a>
      </div>

      <div class="modal-actions">
        <a class="btn" href="/player.html">Open Player Dashboard</a>
        <button class="btn ghost" id="modalDone" type="button">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();

  document.getElementById("modalClose").addEventListener("click", close);
  document.getElementById("modalDone").addEventListener("click", close);

  modal.addEventListener("click", event => {
    if (event.target === modal) close();
  });

  document.getElementById("whatsappJoinBtn")
    .addEventListener("click", event => {
      event.preventDefault();
      window.open("YOUR_WHATSAPP_GROUP_LINK", "_blank", "noopener,noreferrer");
    });
}


/* =========================================================
   LEADERBOARD
========================================================= */

async function loadLB() {
  const r = await fetch(
    "/api/tournaments/" + encodeURIComponent(id) + "/leaderboard"
  );

  const d = await r.json();

  document.getElementById("lb").innerHTML =
    (d.leaderboard || []).map((x, i) => `
      <div class="row">
        <b>#${i + 1} ${esc(x.display_name)}</b>
        <span>${esc(x.points)} pts • ${esc(x.kills)} kills</span>
      </div>
    `).join("") ||
    '<div class="muted">No results yet.</div>';
}


/* =========================================================
   ESCAPE HTML
========================================================= */

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
