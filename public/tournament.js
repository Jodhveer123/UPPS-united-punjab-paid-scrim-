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

            <span>
              ${t.entry_type === "PAID"
                ? "Paid tournament"
                : "FREE"}
            </span>

            <span>
              ${esc(t.verified_count)}/${esc(t.capacity)} confirmed
            </span>
          </div>

          <button
            class="btn"
            id="registerBtn"
            type="button"
          >
            Register
          </button>
        </div>
      </div>


      <section class="panel registration-notice">

        <h2>How registration works</h2>

        <ol>
          <li>Create your UPPS Player ID and log in.</li>

          <li>
            Click Register and review the registration window.
          </li>

          <li>
            New players must press Submit Registration
            to create their registration.
          </li>

          <li>
            Your registration starts as Pending.
          </li>

          <li>
            The organizer reviews your registration.
          </li>

          <li>
            Only an approved registration gives you
            an eligible, confirmed slot.
          </li>
        </ol>

        <p class="warning-note">
          <b>Important:</b>
          Registering does not automatically make you eligible to play.
        </p>

      </section>


      <div class="grid2">

        <section class="panel">

          <h2>Rules</h2>

          <pre>
${esc(
  t.rules ||
  "Rules will be published by the organizer."
)}
          </pre>

        </section>


        <section class="panel">

          <h2>Prizes</h2>

          <div>

            ${
              (d.prizes || [])
                .map(p => `
                  <div class="row">

                    <b>
                      ${esc(p.position_label)}
                    </b>

                    <span>
                      ₹${Number(p.amount).toFixed(0)}
                    </span>

                  </div>
                `)
                .join("") ||

              '<div class="muted">Prize structure not published yet.</div>'
            }

          </div>

        </section>

      </div>


      <section class="panel">

        <h2>Matches</h2>

        <div>

          ${
            (d.matches || [])
              .map(m => `
                <div class="row">

                  <b>
                    Match ${esc(m.match_number)}
                  </b>

                  <span>
                    ${esc(m.status)}
                  </span>

                </div>
              `)
              .join("") ||

            '<div class="muted">Matches will appear here.</div>'
          }

        </div>

      </section>


      <section class="panel">

        <h2>Leaderboard</h2>

        <div id="lb">
          Loading…
        </div>

      </section>


      <section class="panel">

        <h2>Reviews</h2>

        <div>

          ${
            (d.reviews || [])
              .map(x => `
                <div class="review">

                  <b>
                    ${esc(x.display_name)}
                    •
                    ${"★".repeat(
                      Number(x.rating || 0)
                    )}
                  </b>

                  <p>
                    ${esc(x.review_text)}
                  </p>

                </div>
              `)
              .join("") ||

            '<div class="muted">No reviews yet.</div>'
          }

        </div>

      </section>
    `;


    document
      .getElementById("registerBtn")
      .addEventListener(
        "click",
        openRegistrationWindow
      );


    loadLB();

  })
  .catch(e => {

    document.getElementById("app").innerHTML =
      '<div class="empty">' +
      esc(e.message) +
      "</div>";

  });


/* =========================================================
   OPEN REGISTRATION WINDOW
========================================================= */

async function openRegistrationWindow() {

  const authCheck = await fetch(
    "/api/auth/me"
  );

  if (authCheck.status === 401) {
    location.href = "/login.html";
    return;
  }


  if (!authCheck.ok) {
    alert("Could not verify your account.");
    return;
  }


  /*
     Check whether this player is already registered.
     IMPORTANT:
     This does NOT create a registration.
  */

  const r = await fetch(
    "/api/tournaments/" +
    encodeURIComponent(id) +
    "/registration"
  );


  if (r.status === 401) {
    location.href = "/login.html";
    return;
  }


  const d = await r.json();


  if (!d.ok) {
    alert(
      d.error ||
      "Could not check registration."
    );

    return;
  }


  if (d.registered) {

    showRegistrationModal(
      d.registration,
      true
    );

  } else {

    showRegistrationModal(
      null,
      false
    );

  }

}


/* =========================================================
   REGISTRATION MODAL
========================================================= */

function showRegistrationModal(
  registration,
  alreadyRegistered
) {

  const old =
    document.getElementById(
      "registrationModal"
    );


  if (old) {
    old.remove();
  }


  const modal =
    document.createElement("div");


  modal.id =
    "registrationModal";

  modal.className =
    "modal-backdrop";


  /*
     Existing registration
  */

  const statusHTML =
    alreadyRegistered

      ? `

        <span class="eyebrow">
          ALREADY REGISTERED
        </span>

        <h2 id="modalTitle">
          You are already registered
        </h2>

        <div class="modal-icon">
          ✓
        </div>

        <p>
          You already have a registration
          for this tournament.
        </p>

        <div class="modal-status">

          <div>

            <span>
              Registration ID
            </span>

            <b>
              ${esc(registration.public_id)}
            </b>

          </div>


          <div>

            <span>
              Status
            </span>

            <b>
              ${esc(registration.status)}
            </b>

          </div>

        </div>

        <p class="muted">
          You cannot create another registration
          for the same tournament.
        </p>

      `

      :

      `

        <span class="eyebrow">
          TOURNAMENT REGISTRATION
        </span>

        <h2 id="modalTitle">
          Ready to register?
        </h2>

        <div class="modal-icon">
          📝
        </div>

        <p>
          Review the information below.
          Your registration will only be created
          when you press
          <b>Submit Registration</b>.
        </p>

      `;


  modal.innerHTML = `

    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
    >

      <button
        class="modal-close"
        id="modalClose"
        type="button"
        aria-label="Close"
      >
        ×
      </button>


      ${statusHTML}


      <!-- WhatsApp Section -->

      <div class="whatsapp-section">

        <h3>
          Join our WhatsApp group
        </h3>

        <p class="muted">
          Join the official UPPS WhatsApp group
          after registering.
          Your tournament registration still
          requires organizer verification.
        </p>


        <img
          src="/assets/qr.jpg"
          alt="UPPS WhatsApp Group QR Code"
          class="whatsapp-qr"
        >


        <a
          href="#"
          id="whatsappJoinBtn"
          class="btn"
        >
          Join WhatsApp Group
        </a>

      </div>


      ${
        alreadyRegistered

          ? `

            <div class="modal-actions">

              <a
                class="btn"
                href="/player.html"
              >
                Open Player Dashboard
              </a>

              <button
                class="btn ghost"
                id="modalDone"
                type="button"
              >
                Done
              </button>

            </div>

          `

          : `

            <div class="modal-actions">

              <button
                class="btn"
                id="submitRegistration"
                type="button"
              >
                Submit Registration
              </button>

              <button
                class="btn ghost"
                id="modalDone"
                type="button"
              >
                Cancel
              </button>

            </div>

          `
      }

    </div>

  `;


  document.body.appendChild(modal);


  const close = () =>
    modal.remove();


  document
    .getElementById("modalClose")
    .addEventListener(
      "click",
      close
    );


  document
    .getElementById("modalDone")
    .addEventListener(
      "click",
      close
    );


  modal.addEventListener(
    "click",
    event => {

      if (event.target === modal) {
        close();
      }

    }
  );


  /*
     Only NEW registrations get
     the Submit Registration button.
  */

  if (!alreadyRegistered) {

    document
      .getElementById(
        "submitRegistration"
      )
      .addEventListener(
        "click",
        submitRegistration
      );

  }


  /*
     Put your actual WhatsApp group link here.
     This button is intentionally separate
     from tournament registration.
  */

  document
    .getElementById(
      "whatsappJoinBtn"
    )
    .addEventListener(
      "click",
      event => {

        event.preventDefault();

        /*
           Replace the URL below with your
           actual WhatsApp group invite link.
        */

        window.open(
          "YOUR_WHATSAPP_GROUP_LINK",
          "_blank",
          "noopener,noreferrer"
        );

      }
    );

}


/* =========================================================
   ACTUALLY SUBMIT REGISTRATION
========================================================= */

async function submitRegistration() {

  const button =
    document.getElementById(
      "submitRegistration"
    );


  if (!button) {
    return;
  }


  button.disabled = true;

  button.textContent =
    "Submitting...";


  try {

    const r = await fetch(
      "/api/tournaments/" +
      encodeURIComponent(id) +
      "/register",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        }
      }
    );


    const d = await r.json();


    if (r.status === 401) {
      location.href =
        "/login.html";

      return;
    }


    /*
       Safety check:
       Another registration may have
       appeared between the check and
       submission.
    */

    if (r.status === 409) {

      alert(
        "You are already registered for this tournament."
      );

      const modal =
        document.getElementById(
          "registrationModal"
        );

      if (modal) {
        modal.remove();
      }

      await openRegistrationWindow();

      return;
    }


    if (!d.ok) {

      alert(
        d.error ||
        "Registration failed."
      );

      return;
    }


    /*
       Registration successfully created.
       Now show the pending confirmation.
    */

    showSubmittedModal(
      d.registration
    );


  } catch (e) {

    alert(
      "Could not submit registration."
    );

  } finally {

    const current =
      document.getElementById(
        "submitRegistration"
      );

    if (current) {

      current.disabled =
        false;

      current.textContent =
        "Submit Registration";

    }

  }

}


/* =========================================================
   AFTER SUCCESSFUL SUBMISSION
========================================================= */

function showSubmittedModal(
  registration
) {

  const old =
    document.getElementById(
      "registrationModal"
    );


  if (old) {
    old.remove();
  }


  const modal =
    document.createElement("div");


  modal.id =
    "registrationModal";

  modal.className =
    "modal-backdrop";


  modal.innerHTML = `

    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
    >

      <button
        class="modal-close"
        id="modalClose"
        type="button"
        aria-label="Close"
      >
        ×
      </button>


      <span class="eyebrow">
        REGISTRATION RECEIVED
      </span>


      <h2 id="modalTitle">
        Your registration is pending
      </h2>


      <div class="modal-icon">
        ⏳
      </div>


      <p>
        Your registration has been submitted successfully.
        <b>You are not eligible to play yet.</b>
      </p>


      <div class="modal-status">

        <div>

          <span>
            Registration ID
          </span>

          <b>
            ${esc(registration.public_id)}
          </b>

        </div>


        <div>

          <span>
            Status
          </span>

          <b>
            ${esc(registration.status)}
          </b>

        </div>

      </div>


      <p class="muted">
        The organizer must review your registration
        and approve it before your slot is confirmed.
      </p>


      <div class="whatsapp-section">

        <h3>
          Join our WhatsApp group
        </h3>

        <p class="muted">
          You can join the official UPPS WhatsApp group.
          Your registration still requires organizer verification.
        </p>


        <img
          src="/assets/qr.jpg"
          alt="UPPS WhatsApp Group QR Code"
          class="whatsapp-qr"
        >


        <a
          href="#"
          id="whatsappJoinBtn"
          class="btn"
        >
          Join WhatsApp Group
        </a>

      </div>


      <div class="modal-actions">

        <a
          class="btn"
          href="/player.html"
        >
          Open Player Dashboard
        </a>


        <button
          class="btn ghost"
          id="modalDone"
          type="button"
        >
          Done
        </button>

      </div>

    </div>

  `;


  document.body.appendChild(modal);


  const close = () =>
    modal.remove();


  document
    .getElementById("modalClose")
    .addEventListener(
      "click",
      close
    );


  document
    .getElementById("modalDone")
    .addEventListener(
      "click",
      close
    );


  modal.addEventListener(
    "click",
    event => {

      if (event.target === modal) {
        close();
      }

    }
  );


  document
    .getElementById(
      "whatsappJoinBtn"
    )
    .addEventListener(
      "click",
      event => {

        event.preventDefault();

        window.open(
          "YOUR_WHATSAPP_GROUP_LINK",
          "_blank",
          "noopener,noreferrer"
        );

      }
    );

}


/* =========================================================
   LEADERBOARD
========================================================= */

async function loadLB() {

  const r = await fetch(
    "/api/tournaments/" +
    encodeURIComponent(id) +
    "/leaderboard"
  );


  const d = await r.json();


  document.getElementById("lb").innerHTML =
    (d.leaderboard || [])
      .map((x, i) => `

        <div class="row">

          <b>
            #${i + 1}
            ${esc(x.display_name)}
          </b>

          <span>
            ${esc(x.points)}
            pts •
            ${esc(x.kills)}
            kills
          </span>

        </div>

      `)
      .join("") ||

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
