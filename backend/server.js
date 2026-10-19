require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET =
  process.env.JWT_SECRET || "development-only-change-me";

const COOKIE_SECURE =
  String(process.env.COOKIE_SECURE || "false").toLowerCase() === "true";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false }
});

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const frontendDir = path.join(__dirname, "..", "public");
/* =========================================================
   HELPERS
========================================================= */

function id(prefix) {
  return `${prefix}-${Date.now()
    .toString(36)
    .toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message
  });
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d"
  });
}

/*
  IMPORTANT:
  Player and admin now use DIFFERENT cookies.
  This prevents an admin login from replacing
  the player's authentication session.
*/

function setAuthCookie(res, token, type) {
  const cookieName =
    type === "ADMIN"
      ? "upps_admin_auth"
      : "upps_player_auth";

  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

function clearAuthCookie(res, type) {
  const cookieName =
    type === "ADMIN"
      ? "upps_admin_auth"
      : "upps_player_auth";

  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/"
  });
}

/*
  Authentication middleware.

  PLAYER routes read upps_player_auth.
  ADMIN routes read upps_admin_auth.
*/

function auth(requiredType) {
  return (req, res, next) => {
    try {
      const cookieName =
        requiredType === "ADMIN"
          ? "upps_admin_auth"
          : "upps_player_auth";

      const token = req.cookies[cookieName];

      if (!token) {
        return sendError(
          res,
          401,
          "Authentication required."
        );
      }

      const decoded = jwt.verify(token, JWT_SECRET);

      if (
        requiredType &&
        decoded.type !== requiredType
      ) {
        return sendError(res, 403, "Forbidden.");
      }

      req.auth = decoded;

      next();
    } catch {
      return sendError(
        res,
        401,
        "Authentication required."
      );
    }
  };
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function audit(
  actorType,
  actorId,
  action,
  entityType,
  entityId,
  details = {}
) {
  try {
    await query(
      `INSERT INTO audit_logs(
        actor_type,
        actor_id,
        action,
        entity_type,
        entity_id,
        details
      )
      VALUES($1,$2,$3,$4,$5,$6)`,
      [
        actorType,
        actorId || null,
        action,
        entityType || null,
        entityId || null,
        JSON.stringify(details)
      ]
    );
  } catch (e) {
    console.error("Audit error:", e.message);
  }
}

/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initDb() {
  const fs = require("fs");

  const schema = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "database",
      "schema.sql"
    ),
    "utf8"
  );

  await query(schema);

  const adminUsername =
    process.env.ADMIN_USERNAME;

  const adminPassword =
    process.env.ADMIN_PASSWORD;

  if (adminUsername && adminPassword) {
    const existing = await query(
      "SELECT id FROM admins WHERE username=$1",
      [adminUsername]
    );

    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(
        adminPassword,
        12
      );

      await query(
        `INSERT INTO admins(
          username,
          password_hash,
          role
        )
        VALUES($1,$2,$3)`,
        [
          adminUsername,
          hash,
          "OWNER"
        ]
      );

      console.log(
        `Admin '${adminUsername}' created.`
      );
    }
  }
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");

    res.json({
      ok: true,
      service: "UPPS",
      version: "1.0.0",
      database: "connected"
    });
  } catch {
    res.status(503).json({
      ok: false,
      database: "unavailable"
    });
  }
});

/* =========================================================
   PUBLIC TOURNAMENTS
========================================================= */

app.get("/api/tournaments", async (_req, res) => {
  try {
    const r = await query(`
      SELECT
        t.*,
        (
          SELECT COUNT(*)
          FROM registrations r
          WHERE r.tournament_id=t.id
          AND r.status='VERIFIED'
        ) AS verified_count
      FROM tournaments t
      WHERE t.status <> 'DRAFT'
      ORDER BY
        t.start_at NULLS LAST,
        t.created_at DESC
    `);

    // Do not return legacy room credentials from public tournament listings.
    const tournaments = r.rows.map(t => {
      const safe = { ...t };
      delete safe.room_id;
      delete safe.room_password;
      return safe;
    });
    res.json({
      ok: true,
      tournaments
    });
  } catch (e) {
    console.error(e);

    sendError(
      res,
      500,
      "Could not load tournaments."
    );
  }
});

app.get(
  "/api/tournaments/:publicId",
  async (req, res) => {
    try {
      const r = await query(
        `
        SELECT
          t.*,
          (
            SELECT COUNT(*)
            FROM registrations r
            WHERE r.tournament_id=t.id
            AND r.status='VERIFIED'
          ) AS verified_count
        FROM tournaments t
        WHERE t.public_id=$1
        `,
        [req.params.publicId]
      );

      if (!r.rowCount) {
        return sendError(
          res,
          404,
          "Tournament not found."
        );
      }

      const tournament = r.rows[0];
      // Never expose legacy tournament-level room credentials publicly.
      delete tournament.room_id;
      delete tournament.room_password;

      const matches = await query(
        `
        SELECT
          public_id,
          match_number,
          status,
          start_at
        FROM matches
        WHERE tournament_id=$1
        ORDER BY match_number
        `,
        [tournament.id]
      );

      const prizes = await query(
        `
        SELECT
          position_label,
          amount,
          payout_status
        FROM prizes
        WHERE tournament_id=$1
        ORDER BY id
        `,
        [tournament.id]
      );

      const reviews = await query(
        `
        SELECT
          rv.rating,
          rv.review_text,
          rv.created_at,
          p.display_name
        FROM reviews rv
        JOIN players p
          ON p.id=rv.player_id
        WHERE rv.tournament_id=$1
        AND rv.status='APPROVED'
        ORDER BY rv.created_at DESC
        LIMIT 30
        `,
        [tournament.id]
      );

      res.json({
        ok: true,
        tournament,
        matches: matches.rows,
        prizes: prizes.rows,
        reviews: reviews.rows
      });
    } catch (e) {
      console.error(e);

      sendError(
        res,
        500,
        "Could not load tournament."
      );
    }
  }
);

/* =========================================================
   PLAYER AUTH
========================================================= */

app.post(
  "/api/auth/register",
  async (req, res) => {
    const {
      username,
      password,
      displayName,
      freeFireUid,
      email,
      phone
    } = req.body || {};

    if (!username || !displayName || !password || !email || !freeFireUid) {
      return sendError(res, 400, "Username, display name, Gmail address, Free Fire UID and password are required.");
    }

    if (!/^[^\s@]+@gmail\.com$/i.test(String(email).trim())) {
      return sendError(res, 400, "Please enter a valid Gmail address ending in @gmail.com.");
    }

    if (!/^[0-9]{5,20}$/.test(String(freeFireUid))) {
      return sendError(res, 400, "Enter a valid Free Fire UID (5–20 digits).");
    }

    if (
      !/^[A-Za-z0-9_.-]{3,30}$/.test(username)
    ) {
      return sendError(
        res,
        400,
        "Invalid username."
      );
    }

    if (password.length < 8) {
      return sendError(
        res,
        400,
        "Password must be at least 8 characters."
      );
    }

    if (
      freeFireUid &&
      !/^[0-9]{5,20}$/.test(
        String(freeFireUid)
      )
    ) {
      return sendError(
        res,
        400,
        "Invalid Free Fire UID."
      );
    }

    try {
      const exists = await query(
        `
        SELECT
          username,
          email,
          free_fire_uid
        FROM players
        WHERE username=$1
        OR ($2<>'' AND email=$2)
        OR ($3<>'' AND free_fire_uid=$3)
        `,
        [
          username,
          String(email).trim().toLowerCase(),
          String(freeFireUid)
        ]
      );

      if (exists.rowCount) {
        return sendError(
          res,
          409,
          "Username, email or Free Fire UID is already registered."
        );
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      const publicId = id("PLR");

      const r = await query(
        `
        INSERT INTO players(
          public_id,
          username,
          password_hash,
          display_name,
          free_fire_uid,
          email,
          phone
        )
        VALUES(
          $1,$2,$3,$4,$5,$6,$7
        )
        RETURNING
          id,
          public_id,
          username,
          display_name,
          free_fire_uid,
          email,
          phone,
          status,
          created_at
        `,
        [
          publicId,
          username,
          passwordHash,
          displayName,
          String(freeFireUid),
          String(email).trim().toLowerCase(),
          phone || null
        ]
      );

      await audit(
        "PLAYER",
        r.rows[0].id,
        "REGISTER",
        "PLAYER",
        r.rows[0].id
      );

      res.status(201).json({
        ok: true,
        player: r.rows[0]
      });
    } catch (e) {
      console.error(e);

      sendError(
        res,
        500,
        "Registration failed."
      );
    }
  }
);

app.post(
  "/api/auth/login",
  async (req, res) => {
    const {
      username,
      password
    } = req.body || {};

    if (!username || !password) {
      return sendError(
        res,
        400,
        "Username and password are required."
      );
    }

    const r = await query(
      "SELECT * FROM players WHERE username=$1",
      [username]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        401,
        "Invalid username or password."
      );
    }

    const player = r.rows[0];

    if (player.status !== "ACTIVE") {
      return sendError(
        res,
        403,
        `Account is ${player.status.toLowerCase()}.`
      );
    }

    const valid =
      await bcrypt.compare(
        password,
        player.password_hash
      );

    if (!valid) {
      return sendError(
        res,
        401,
        "Invalid username or password."
      );
    }

    const token = signToken({
      type: "PLAYER",
      id: player.id,
      publicId: player.public_id
    });

    setAuthCookie(
      res,
      token,
      "PLAYER"
    );

    await audit(
      "PLAYER",
      player.id,
      "LOGIN",
      "PLAYER",
      player.id
    );

    res.json({
      ok: true,
      player: {
        publicId: player.public_id,
        username: player.username,
        displayName: player.display_name,
        freeFireUid: player.free_fire_uid
      }
    });
  }
);

app.post(
  "/api/auth/logout",
  (req, res) => {
    clearAuthCookie(
      res,
      "PLAYER"
    );

    res.json({
      ok: true
    });
  }
);

app.get(
  "/api/auth/me",
  auth("PLAYER"),
  async (req, res) => {
    const r = await query(
      `
      SELECT
        id,
        public_id,
        username,
        display_name,
        free_fire_uid,
        email,
        phone,
        status,
        created_at,
        updated_at
      FROM players
      WHERE id=$1
      `,
      [req.auth.id]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        404,
        "Player not found."
      );
    }

    res.json({
      ok: true,
      authenticated: true,
      player: r.rows[0]
    });
  }
);

/* =========================================================
   ACCOUNT RECOVERY REQUESTS (manual verification; no email service)
========================================================= */
app.post("/api/auth/recovery/request", async (req, res) => {
  const { requestType, username, contact, playerUid, details } = req.body || {};
  const type = String(requestType || "").toUpperCase();
  const safeUsername = String(username || "").trim().slice(0, 30);
  const safeContact = String(contact || "").trim().slice(0, 160);
  const safeUid = String(playerUid || "").trim().slice(0, 30);
  const safeDetails = String(details || "").trim().slice(0, 1000);

  if (!["USERNAME", "PASSWORD", "BOTH"].includes(type)) {
    return sendError(res, 400, "Choose a valid recovery request type.");
  }
  if (!/^[^\s@]+@gmail\.com$/i.test(safeContact)) {
    return sendError(res, 400, "Enter the Gmail address you used when registering.");
  }
  if (!/^[0-9]{5,20}$/.test(safeUid)) {
    return sendError(res, 400, "Enter your Free Fire UID (5–20 digits).");
  }

  try {
    // Vercel imports this app as a serverless function, so initDb() may not run.
    // Ensure the recovery table exists before accepting the first request.
    await query(`
      CREATE TABLE IF NOT EXISTS account_recovery_requests (
        id BIGSERIAL PRIMARY KEY,
        request_type TEXT NOT NULL CHECK (request_type IN ('USERNAME','PASSWORD','BOTH')),
        username TEXT,
        contact TEXT,
        player_uid TEXT,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_account_recovery_status_created
      ON account_recovery_requests(status, created_at)`);
    await query(
      `INSERT INTO account_recovery_requests
       (request_type, username, contact, player_uid, details, status, created_at)
       VALUES ($1,$2,$3,$4,$5,'OPEN',NOW())`,
      [type, safeUsername || null, safeContact || null, safeUid || null, safeDetails || null]
    );
    // Generic response prevents the endpoint from confirming whether an account exists.
    return res.status(202).json({
      ok: true,
      message: "If you supplied enough information, your request has been recorded. UPPS support must verify ownership before any account details or password changes are provided."
    });
  } catch (e) {
    console.error("Recovery request error:", e.message);
    return sendError(res, 500, "Could not submit the request right now. Please try again later.");
  }
});

app.get("/api/admin/recovery-requests", auth("ADMIN"), async (_req, res) => {
  try {
    const r = await query(
      `SELECT id, request_type, username, contact, player_uid, details, status, created_at
       FROM account_recovery_requests
       WHERE status='OPEN'
       ORDER BY created_at ASC
       LIMIT 100`
    );
    res.json({ ok: true, requests: r.rows });
  } catch (e) {
    console.error("Recovery request list error:", e.message);
    sendError(res, 500, "Could not load recovery requests.");
  }
});

app.post("/api/admin/recovery-requests/:id/close", auth("ADMIN"), async (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) {
    return sendError(res, 400, "Invalid request ID.");
  }
  try {
    const r = await query(
      `UPDATE account_recovery_requests
       SET status='CLOSED', closed_at=NOW()
       WHERE id=$1 AND status='OPEN'
       RETURNING id`,
      [requestId]
    );
    if (!r.rowCount) return sendError(res, 404, "Open request not found.");
    res.json({ ok: true, message: "Request marked closed." });
  } catch (e) {
    console.error("Recovery request close error:", e.message);
    sendError(res, 500, "Could not close recovery request.");
  }
});

/* =========================================================
   PLAYER PROFILE
========================================================= */

app.patch(
  "/api/player/profile",
  auth("PLAYER"),
  async (req, res) => {
    const {
      displayName,
      email,
      phone,
      freeFireUid
    } = req.body || {};

    if (!displayName) {
      return sendError(
        res,
        400,
        "Display name is required."
      );
    }

    if (
      freeFireUid &&
      !/^[0-9]{5,20}$/.test(
        String(freeFireUid)
      )
    ) {
      return sendError(
        res,
        400,
        "Invalid Free Fire UID."
      );
    }

    try {
      const r = await query(
        `
        UPDATE players
        SET
          display_name=$1,
          email=$2,
          phone=$3,
          free_fire_uid=$4,
          updated_at=NOW()
        WHERE id=$5
        RETURNING
          id,
          public_id,
          username,
          display_name,
          free_fire_uid,
          email,
          phone,
          status,
          created_at,
          updated_at
        `,
        [
          displayName,
          email || null,
          phone || null,
          freeFireUid || null,
          req.auth.id
        ]
      );

      await audit(
        "PLAYER",
        req.auth.id,
        "PROFILE_UPDATE",
        "PLAYER",
        req.auth.id
      );

      res.json({
        ok: true,
        player: r.rows[0]
      });
    } catch (e) {
      if (e.code === "23505") {
        return sendError(
          res,
          409,
          "Email or Free Fire UID is already in use."
        );
      }

      console.error(e);

      sendError(
        res,
        500,
        "Profile update failed."
      );
    }
  }
);
app.get(
  "/api/tournaments/:publicId/registration",
  auth("PLAYER"),
  async (req, res) => {
    try {
      const r = await query(
        `
        SELECT
          r.public_id,
          r.status,
          r.created_at
        FROM registrations r
        JOIN tournaments t
          ON t.id = r.tournament_id
        WHERE t.public_id=$1
        AND r.player_id=$2
        LIMIT 1
        `,
        [
          req.params.publicId,
          req.auth.id
        ]
      );

      if (!r.rowCount) {
        return res.json({
          ok: true,
          registered: false
        });
      }

      return res.json({
        ok: true,
        registered: true,
        registration: r.rows[0]
      });

    } catch (e) {
      console.error(e);

      return sendError(
        res,
        500,
        "Could not check registration."
      );
    }
  }
);
/* =========================================================
   PLAYER TOURNAMENT REGISTRATION
========================================================= */

app.post(
  "/api/tournaments/:publicId/register",
  auth("PLAYER"),
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const tr =
        await client.query(
          `
          SELECT *
          FROM tournaments
          WHERE public_id=$1
          FOR UPDATE
          `,
          [req.params.publicId]
        );

      if (!tr.rowCount) {
        throw Object.assign(
          new Error(
            "Tournament not found."
          ),
          { status: 404 }
        );
      }

      const t = tr.rows[0];

      if (
        ![
          "REGISTRATION OPEN",
          "PUBLISHED"
        ].includes(t.status)
      ) {
        throw Object.assign(
          new Error(
            "Registration is not open."
          ),
          { status: 400 }
        );
      }

      const existing =
        await client.query(
          `
          SELECT *
          FROM registrations
          WHERE tournament_id=$1
          AND player_id=$2
          `,
          [
            t.id,
            req.auth.id
          ]
        );

      if (existing.rowCount) {
        throw Object.assign(
          new Error(
            "You are already registered for this tournament."
          ),
          { status: 409 }
        );
      }

      const count =
        await client.query(
          `
          SELECT COUNT(*)::int AS n
          FROM registrations
          WHERE tournament_id=$1
          AND status='VERIFIED'
          `,
          [t.id]
        );

      const verified =
        count.rows[0].n;

      const status =
        verified >= t.capacity
          ? "WAITLISTED"
          : "PENDING";

      const publicId =
        id("REG");

      const r =
        await client.query(
          `
          INSERT INTO registrations(
            public_id,
            tournament_id,
            player_id,
            status
          )
          VALUES($1,$2,$3,$4)
          RETURNING
            public_id,
            status,
            created_at
          `,
          [
            publicId,
            t.id,
            req.auth.id,
            status
          ]
        );

      await client.query(
        "COMMIT"
      );

      await audit(
        "PLAYER",
        req.auth.id,
        "TOURNAMENT_REGISTER",
        "TOURNAMENT",
        t.id,
        {
          registration: publicId
        }
      );

      res.status(201).json({
        ok: true,
        registration: r.rows[0],
        entryType: t.entry_type,
        entryFee: t.entry_fee
      });
    } catch (e) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      sendError(
        res,
        e.status || 500,
        e.status
          ? e.message
          : "Registration failed."
      );
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   PLAYER REGISTRATIONS
========================================================= */

app.get(
  "/api/player/registrations",
  auth("PLAYER"),
  async (req, res) => {
    const r = await query(
      `
      SELECT
        r.public_id,
        r.status,
        r.payment_id,
        r.utr,
        r.team_name,
        r.created_at,
        t.public_id AS tournament_public_id,
        t.title,
        t.mode,
        t.entry_type,
        t.entry_fee,
        t.status AS tournament_status,
        t.start_at
      FROM registrations r
      JOIN tournaments t
        ON t.id=r.tournament_id
      WHERE r.player_id=$1
      ORDER BY r.created_at DESC
      `,
      [req.auth.id]
    );

    res.json({
      ok: true,
      registrations: r.rows
    });
  }
);

/* =========================================================
   PAYMENT REFERENCE
========================================================= */

app.post(
  "/api/registrations/:publicId/payment",
  auth("PLAYER"),
  async (_req, res) => {
    return sendError(
      res,
      410,
      "Payment submission is not available in this version. Registration requires organizer approval."
    );
  }
);


/* =========================================================
   PLAYER ROOM CREDENTIALS
   Credentials are returned only to a logged-in player with a
   VERIFIED registration for this exact tournament, and only
   after the admin enables them and the release time has arrived.
========================================================= */

app.get(
  "/api/player/tournaments/:publicId/rooms",
  auth("PLAYER"),
  async (req, res) => {
    const eligible = await query(
      `SELECT t.id
       FROM tournaments t
       JOIN registrations r ON r.tournament_id=t.id
       JOIN players p ON p.id=r.player_id
       WHERE t.public_id=$1
         AND r.player_id=$2
         AND r.status='VERIFIED'
         AND p.status='ACTIVE'
       LIMIT 1`,
      [req.params.publicId, req.auth.id]
    );

    if (!eligible.rowCount) {
      return sendError(res, 403, "Room details are available only to approved players in this tournament.");
    }

    const matches = await query(
      `SELECT
         m.public_id, m.match_number, m.status, m.start_at,
         m.room_release_at,
         CASE
           WHEN m.room_enabled=TRUE
            AND m.room_id IS NOT NULL
            AND m.room_password IS NOT NULL
            AND (m.room_release_at IS NULL OR m.room_release_at <= NOW())
           THEN m.room_id ELSE NULL
         END AS room_id,
         CASE
           WHEN m.room_enabled=TRUE
            AND m.room_id IS NOT NULL
            AND m.room_password IS NOT NULL
            AND (m.room_release_at IS NULL OR m.room_release_at <= NOW())
           THEN m.room_password ELSE NULL
         END AS room_password,
         (m.room_enabled=TRUE
          AND m.room_id IS NOT NULL
          AND m.room_password IS NOT NULL
          AND (m.room_release_at IS NULL OR m.room_release_at <= NOW())) AS released
       FROM matches m
       WHERE m.tournament_id=$1
       ORDER BY m.match_number`,
      [eligible.rows[0].id]
    );

    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, matches: matches.rows });
  }
);

/* =========================================================
   PLAYER RESULTS
========================================================= */

app.get(
  "/api/player/results",
  auth("PLAYER"),
  async (req, res) => {
    const r = await query(
      `
      SELECT
        t.title,
        m.match_number,
        res.placement,
        res.kills,
        res.points
      FROM results res
      JOIN matches m
        ON m.id=res.match_id
      JOIN tournaments t
        ON t.id=m.tournament_id
      WHERE res.player_id=$1
      ORDER BY
        t.start_at DESC NULLS LAST,
        m.match_number
      `,
      [req.auth.id]
    );

    res.json({
      ok: true,
      results: r.rows
    });
  }
);

/* =========================================================
   REVIEWS
========================================================= */

app.post(
  "/api/tournaments/:publicId/review",
  auth("PLAYER"),
  async (req, res) => {
    const {
      rating,
      reviewText
    } = req.body || {};

    if (
      !Number.isInteger(
        Number(rating)
      ) ||
      Number(rating) < 1 ||
      Number(rating) > 5
    ) {
      return sendError(
        res,
        400,
        "Rating must be 1 to 5."
      );
    }

    const t = await query(
      `
      SELECT id
      FROM tournaments
      WHERE public_id=$1
      `,
      [req.params.publicId]
    );

    if (!t.rowCount) {
      return sendError(
        res,
        404,
        "Tournament not found."
      );
    }

    const eligible =
      await query(
        `
        SELECT id
        FROM registrations
        WHERE tournament_id=$1
        AND player_id=$2
        AND status='VERIFIED'
        `,
        [
          t.rows[0].id,
          req.auth.id
        ]
      );

    if (!eligible.rowCount) {
      return sendError(
        res,
        403,
        "Only verified participants can review this tournament."
      );
    }

    try {
      const r = await query(
        `
        INSERT INTO reviews(
          tournament_id,
          player_id,
          rating,
          review_text
        )
        VALUES($1,$2,$3,$4)
        RETURNING
          id,
          rating,
          review_text,
          status,
          created_at
        `,
        [
          t.rows[0].id,
          req.auth.id,
          Number(rating),
          String(
            reviewText || ""
          ).slice(0, 1000)
        ]
      );

      res.status(201).json({
        ok: true,
        review: r.rows[0]
      });
    } catch (e) {
      if (e.code === "23505") {
        return sendError(
          res,
          409,
          "You already reviewed this tournament."
        );
      }

      sendError(
        res,
        500,
        "Review failed."
      );
    }
  }
);

/* =========================================================
   ADMIN AUTH
========================================================= */

app.post(
  "/api/admin/login",
  async (req, res) => {
    const {
      username,
      password
    } = req.body || {};

    const r = await query(
      "SELECT * FROM admins WHERE username=$1",
      [username || ""]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        401,
        "Invalid admin credentials."
      );
    }

    const admin = r.rows[0];

    const valid =
      await bcrypt.compare(
        password || "",
        admin.password_hash
      );

    if (!valid) {
      return sendError(
        res,
        401,
        "Invalid admin credentials."
      );
    }

    const token = signToken({
      type: "ADMIN",
      id: admin.id,
      role: admin.role
    });

    setAuthCookie(
      res,
      token,
      "ADMIN"
    );

    await audit(
      "ADMIN",
      admin.id,
      "LOGIN",
      "ADMIN",
      admin.id
    );

    res.json({
      ok: true,
      admin: {
        username: admin.username,
        role: admin.role
      }
    });
  }
);

app.get(
  "/api/admin/me",
  auth("ADMIN"),
  async (req, res) => {
    const r = await query(
      `
      SELECT
        id,
        username,
        role,
        created_at
      FROM admins
      WHERE id=$1
      `,
      [req.auth.id]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        404,
        "Admin not found."
      );
    }

    res.json({
      ok: true,
      admin: r.rows[0]
    });
  }
);

app.post(
  "/api/admin/logout",
  (req, res) => {
    clearAuthCookie(
      res,
      "ADMIN"
    );

    res.json({
      ok: true
    });
  }
);

/* =========================================================
   ADMIN TOURNAMENTS
========================================================= */

app.get(
  "/api/admin/tournaments",
  auth("ADMIN"),
  async (_req, res) => {
    const r = await query(
      `
      SELECT
        t.*,
        (
          SELECT COUNT(*)
          FROM registrations r
          WHERE r.tournament_id=t.id
          AND r.status='VERIFIED'
        ) AS verified_count,
        (
          SELECT COUNT(*)
          FROM registrations r
          WHERE r.tournament_id=t.id
          AND r.status IN (
            'PAYMENT_PENDING',
            'PENDING'
          )
        ) AS pending_count
      FROM tournaments t
      ORDER BY t.created_at DESC
      `
    );

    res.json({
      ok: true,
      tournaments: r.rows
    });
  }
);

app.post(
  "/api/admin/tournaments",
  auth("ADMIN"),
  async (req, res) => {
    const b =
      req.body || {};

    const required = [
      "title",
      "mode",
      "entryType",
      "capacity"
    ];

    for (const k of required) {
      if (
        b[k] === undefined ||
        b[k] === ""
      ) {
        return sendError(
          res,
          400,
          `${k} is required.`
        );
      }
    }

    if (
      ![
        "SOLO",
        "DUO",
        "SQUAD"
      ].includes(b.mode)
    ) {
      return sendError(
        res,
        400,
        "Invalid mode."
      );
    }

    if (
      ![
        "FREE",
        "PAID"
      ].includes(b.entryType)
    ) {
      return sendError(
        res,
        400,
        "Invalid entry type."
      );
    }

    const r = await query(
      `
      INSERT INTO tournaments(
        public_id,
        title,
        description,
        mode,
        entry_type,
        entry_fee,
        capacity,
        matches_count,
        scoring_type,
        status,
        start_at,
        registration_close_at,
        rules,
        prize_summary
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14
      )
      RETURNING *
      `,
      [
        id("TRN"),
        b.title,
        b.description || "",
        b.mode,
        b.entryType,
        Number(b.entryFee || 0),
        Number(b.capacity),
        Number(b.matchesCount || 1),
        b.scoringType || "CUSTOM",
        b.status || "DRAFT",
        b.startAt || null,
        b.registrationCloseAt || null,
        b.rules || "",
        b.prizeSummary || ""
      ]
    );

    await audit(
      "ADMIN",
      req.auth.id,
      "CREATE",
      "TOURNAMENT",
      r.rows[0].id,
      {
        title: b.title
      }
    );

    res.status(201).json({
      ok: true,
      tournament: r.rows[0]
    });
  }
);

app.patch(
  "/api/admin/tournaments/:id/status",
  auth("ADMIN"),
  async (req, res) => {
    const allowed = [
      "DRAFT",
      "PUBLISHED",
      "REGISTRATION OPEN",
      "REGISTRATION CLOSED",
      "READY",
      "LIVE",
      "RESULTS PENDING",
      "RESULTS FINAL",
      "PAYOUTS PENDING",
      "COMPLETED",
      "CANCELLED",
      "SUSPENDED"
    ];

    if (
      !allowed.includes(
        req.body.status
      )
    ) {
      return sendError(
        res,
        400,
        "Invalid tournament status."
      );
    }

    const r = await query(
      `
      UPDATE tournaments
      SET
        status=$1,
        updated_at=NOW()
      WHERE id=$2
      RETURNING *
      `,
      [
        req.body.status,
        req.params.id
      ]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        404,
        "Tournament not found."
      );
    }

    await audit(
      "ADMIN",
      req.auth.id,
      "STATUS_CHANGE",
      "TOURNAMENT",
      r.rows[0].id,
      {
        status:
          req.body.status
      }
    );

    res.json({
      ok: true,
      tournament: r.rows[0]
    });
  }
);

/* =========================================================
   ADMIN REGISTRATIONS
========================================================= */

app.get(
  "/api/admin/registrations",
  auth("ADMIN"),
  async (_req, res) => {
    const r = await query(
      `
      SELECT
        r.*,
        p.username,
        p.display_name,
        p.free_fire_uid,
        t.title,
        t.entry_type,
        t.entry_fee
      FROM registrations r
      JOIN players p
        ON p.id=r.player_id
      JOIN tournaments t
        ON t.id=r.tournament_id
      ORDER BY r.created_at DESC
      `
    );

    res.json({
      ok: true,
      registrations: r.rows
    });
  }
);

app.patch(
  "/api/admin/registrations/:id/status",
  auth("ADMIN"),
  async (req, res) => {
    const status =
      req.body.status;

    if (
      ![
        "VERIFIED",
        "REJECTED",
        "WAITLISTED",
        "CANCELLED"
      ].includes(status)
    ) {
      return sendError(
        res,
        400,
        "Invalid registration status."
      );
    }

    const r = await query(
      `
      UPDATE registrations
      SET
        status=$1,
        verified_at=
          CASE
            WHEN $1='VERIFIED'
            THEN NOW()
            ELSE verified_at
          END
      WHERE id=$2
      RETURNING *
      `,
      [
        status,
        req.params.id
      ]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        404,
        "Registration not found."
      );
    }

    await audit(
      "ADMIN",
      req.auth.id,
      "REGISTRATION_STATUS",
      "REGISTRATION",
      r.rows[0].id,
      {
        status
      }
    );

    res.json({
      ok: true,
      registration:
        r.rows[0]
    });
  }
);

/* =========================================================
   ADMIN MATCHES
========================================================= */

app.post(
  "/api/admin/tournaments/:id/matches",
  auth("ADMIN"),
  async (req, res) => {
    const {
      matchNumber,
      roomId,
      roomPassword,
      roomReleaseAt,
      roomEnabled,
      startAt
    } = req.body || {};

    if (!Number(matchNumber)) {
      return sendError(
        res,
        400,
        "matchNumber is required."
      );
    }

    const normalizedRoomId = String(roomId || "").trim();
    const normalizedRoomPassword = String(roomPassword || "").trim();
    const publishRoom = roomEnabled === true || roomEnabled === "true" || roomEnabled === "on";
    if ((normalizedRoomId && !normalizedRoomPassword) || (!normalizedRoomId && normalizedRoomPassword)) {
      return sendError(res, 400, "Enter both the room ID and room password, or leave both blank.");
    }
    if (publishRoom && (!normalizedRoomId || !normalizedRoomPassword)) {
      return sendError(res, 400, "Add both room ID and password before publishing credentials.");
    }

    try {
      const r = await query(
        `
        INSERT INTO matches(
          public_id,
          tournament_id,
          match_number,
          room_id,
          room_password,
          room_release_at,
          room_enabled,
          start_at
        )
        VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8
        )
        RETURNING *
        `,
        [
          id("MAT"),
          req.params.id,
          Number(matchNumber),
          normalizedRoomId || null,
          normalizedRoomPassword || null,
          roomReleaseAt || null,
          publishRoom,
          startAt || null
        ]
      );

      await audit(
        "ADMIN",
        req.auth.id,
        "CREATE",
        "MATCH",
        r.rows[0].id
      );

      res.status(201).json({
        ok: true,
        match: r.rows[0]
      });
    } catch (e) {
      if (e.code === "23505") {
        return sendError(
          res,
          409,
          "That match number already exists."
        );
      }

      sendError(
        res,
        500,
        "Could not create match."
      );
    }
  }
);

app.patch(
  "/api/admin/matches/:id/room",
  auth("ADMIN"),
  async (req, res) => {
    const roomId = String(req.body?.roomId || "").trim();
    const roomPassword = String(req.body?.roomPassword || "").trim();
    const roomReleaseAt = req.body?.roomReleaseAt || null;
    const roomEnabled = req.body?.roomEnabled === true;

    if (roomId.length > 100 || roomPassword.length > 100) {
      return sendError(res, 400, "Room ID and password must be 100 characters or fewer.");
    }
    if ((roomId && !roomPassword) || (!roomId && roomPassword)) {
      return sendError(res, 400, "Enter both the room ID and room password, or leave both blank.");
    }
    if (roomEnabled && (!roomId || !roomPassword)) {
      return sendError(res, 400, "Add both room ID and password before publishing credentials.");
    }
    if (roomReleaseAt && Number.isNaN(Date.parse(roomReleaseAt))) {
      return sendError(res, 400, "Invalid room release date and time.");
    }

    const r = await query(
      `UPDATE matches
       SET room_id=$1, room_password=$2, room_release_at=$3, room_enabled=$4
       WHERE id=$5
       RETURNING id, public_id, match_number, room_release_at, room_enabled`,
      [roomId || null, roomPassword || null, roomReleaseAt, roomEnabled, req.params.id]
    );
    if (!r.rowCount) return sendError(res, 404, "Match not found.");

    await audit("ADMIN", req.auth.id, "UPDATE_ROOM_CREDENTIALS", "MATCH", r.rows[0].id, {
      roomEnabled, hasRoomId: Boolean(roomId), releaseAt: roomReleaseAt
    });
    return res.json({ ok: true, match: r.rows[0] });
  }
);

app.get(
  "/api/admin/matches",
  auth("ADMIN"),
  async (_req, res) => {
    const r = await query(
      `
      SELECT
        m.*,
        t.title
      FROM matches m
      JOIN tournaments t
        ON t.id=m.tournament_id
      ORDER BY
        m.start_at NULLS LAST,
        m.tournament_id,
        m.match_number
      `
    );

    res.json({
      ok: true,
      matches: r.rows
    });
  }
);

/* =========================================================
   ADMIN RESULTS
========================================================= */

app.post(
  "/api/admin/matches/:id/results",
  auth("ADMIN"),
  async (req, res) => {
    const results =
      Array.isArray(
        req.body.results
      )
        ? req.body.results
        : [];

    if (!results.length) {
      return sendError(
        res,
        400,
        "Results array is required."
      );
    }

    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      for (const x of results) {
        if (
          !Number(x.playerId) ||
          !Number(x.placement)
        ) {
          throw new Error(
            "Invalid result row."
          );
        }

        await client.query(
          `
          INSERT INTO results(
            match_id,
            player_id,
            placement,
            kills,
            points,
            notes
          )
          VALUES(
            $1,$2,$3,$4,$5,$6
          )
          ON CONFLICT(
            match_id,
            player_id
          )
          DO UPDATE SET
            placement=EXCLUDED.placement,
            kills=EXCLUDED.kills,
            points=EXCLUDED.points,
            notes=EXCLUDED.notes
          `,
          [
            req.params.id,
            Number(x.playerId),
            Number(x.placement),
            Number(x.kills || 0),
            Number(x.points || 0),
            x.notes || ""
          ]
        );
      }

      await client.query(
        `
        UPDATE matches
        SET status='COMPLETED'
        WHERE id=$1
        `,
        [req.params.id]
      );

      await client.query(
        "COMMIT"
      );

      await audit(
        "ADMIN",
        req.auth.id,
        "UPSERT_RESULTS",
        "MATCH",
        Number(req.params.id),
        {
          count: results.length
        }
      );

      res.json({
        ok: true,
        count: results.length
      });
    } catch (e) {
      await client.query(
        "ROLLBACK"
      );

      sendError(
        res,
        400,
        e.message ||
          "Could not save results."
      );
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   PUBLIC LEADERBOARD
========================================================= */

app.get(
  "/api/tournaments/:publicId/leaderboard",
  async (req, res) => {
    const r = await query(
      `
      SELECT
        p.public_id,
        p.display_name,
        COALESCE(
          SUM(res.kills),
          0
        )::int AS kills,
        COALESCE(
          SUM(res.points),
          0
        )::numeric AS points,
        COUNT(res.id)::int AS matches
      FROM tournaments t
      JOIN matches m
        ON m.tournament_id=t.id
      JOIN results res
        ON res.match_id=m.id
      JOIN players p
        ON p.id=res.player_id
      WHERE t.public_id=$1
      GROUP BY p.id
      ORDER BY
        points DESC,
        kills DESC,
        p.display_name
      `,
      [req.params.publicId]
    );

    res.json({
      ok: true,
      leaderboard: r.rows
    });
  }
);

/* =========================================================
   ADMIN PRIZES
========================================================= */

app.post(
  "/api/admin/tournaments/:id/prizes",
  auth("ADMIN"),
  async (req, res) => {
    const {
      positionLabel,
      amount
    } = req.body || {};

    if (!positionLabel) {
      return sendError(
        res,
        400,
        "Position label is required."
      );
    }

    const r = await query(
      `
      INSERT INTO prizes(
        tournament_id,
        position_label,
        amount
      )
      VALUES($1,$2,$3)
      RETURNING *
      `,
      [
        req.params.id,
        positionLabel,
        Number(amount || 0)
      ]
    );

    res.status(201).json({
      ok: true,
      prize: r.rows[0]
    });
  }
);

app.patch(
  "/api/admin/prizes/:id",
  auth("ADMIN"),
  async (req, res) => {
    const r = await query(
      `
      UPDATE prizes
      SET
        winner_player_id=$1,
        payout_status=$2
      WHERE id=$3
      RETURNING *
      `,
      [
        req.body.winnerPlayerId ||
          null,
        req.body.payoutStatus ||
          "PENDING",
        req.params.id
      ]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        404,
        "Prize not found."
      );
    }

    res.json({
      ok: true,
      prize: r.rows[0]
    });
  }
);

/* =========================================================
   ADMIN PLAYERS
========================================================= */

app.get(
  "/api/admin/players",
  auth("ADMIN"),
  async (_req, res) => {
    const r = await query(
      `
      SELECT
        id,
        public_id,
        username,
        display_name,
        free_fire_uid,
        email,
        phone,
        status,
        created_at
      FROM players
      ORDER BY created_at DESC
      `
    );

    res.json({
      ok: true,
      players: r.rows
    });
  }
);

app.patch("/api/admin/players/:id/username", auth("ADMIN"), async (req, res) => {
  const username = String((req.body || {}).username || "").trim();
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return sendError(res, 400, "Username must be 3–30 characters using letters, numbers, dots, underscores or hyphens.");
  try {
    const r = await query("UPDATE players SET username=$1, updated_at=NOW() WHERE id=$2 RETURNING id, username, email, free_fire_uid", [username, req.params.id]);
    if (!r.rowCount) return sendError(res, 404, "Player account not found.");
    await audit("ADMIN", req.auth.id, "PLAYER_USERNAME_CHANGE", "PLAYER", r.rows[0].id, { username });
    res.json({ ok: true, player: r.rows[0], message: "Username changed. Inform the player using their registered Gmail." });
  } catch (e) {
    if (e.code === "23505") return sendError(res, 409, "That username is already taken.");
    console.error(e);
    sendError(res, 500, "Could not change player username.");
  }
});

app.post("/api/admin/players/:id/password", auth("ADMIN"), async (req, res) => {
  const password = String((req.body || {}).password || "");
  if (password.length < 8) return sendError(res, 400, "New password must be at least 8 characters.");
  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await query("UPDATE players SET password_hash=$1, updated_at=NOW() WHERE id=$2 RETURNING id, username, email, free_fire_uid", [hash, req.params.id]);
    if (!r.rowCount) return sendError(res, 404, "Player account not found.");
    await audit("ADMIN", req.auth.id, "PLAYER_PASSWORD_RESET", "PLAYER", r.rows[0].id, { username: r.rows[0].username });
    res.json({ ok: true, player: r.rows[0], message: "Password changed. Contact the player through their registered Gmail and share the new password securely." });
  } catch (e) {
    console.error(e);
    sendError(res, 500, "Could not reset player password.");
  }
});

app.patch(
  "/api/admin/players/:id/status",
  auth("ADMIN"),
  async (req, res) => {
    if (
      ![
        "ACTIVE",
        "SUSPENDED",
        "BANNED"
      ].includes(
        req.body.status
      )
    ) {
      return sendError(
        res,
        400,
        "Invalid player status."
      );
    }

    const r = await query(
      `
      UPDATE players
      SET
        status=$1,
        updated_at=NOW()
      WHERE id=$2
      RETURNING
        id,
        public_id,
        username,
        status
      `,
      [
        req.body.status,
        req.params.id
      ]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        404,
        "Player not found."
      );
    }

    await audit(
      "ADMIN",
      req.auth.id,
      "PLAYER_STATUS",
      "PLAYER",
      r.rows[0].id,
      {
        status:
          req.body.status
      }
    );

    res.json({
      ok: true,
      player: r.rows[0]
    });
  }
);

/* =========================================================
   ADMIN AUDIT
========================================================= */

app.get(
  "/api/admin/audit",
  auth("ADMIN"),
  async (_req, res) => {
    const r = await query(
      `
      SELECT *
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 500
      `
    );

    res.json({
      ok: true,
      logs: r.rows
    });
  }
);

/* UPPS admin expansion routes.
   Insert this block into backend/server.js BEFORE the STATIC FRONTEND section.
   This adds dashboard stats, review moderation, and staff management.
   It does not add payment collection or payout handling.
*/

app.get("/api/admin/dashboard", auth("ADMIN"), async (_req, res) => {
  try {
    const r = await query(`
      SELECT
        (SELECT COUNT(*) FROM players)::int AS players,
        (SELECT COUNT(*) FROM tournaments)::int AS tournaments,
        (SELECT COUNT(*) FROM registrations WHERE status='PENDING')::int AS pending_registrations,
        (SELECT COUNT(*) FROM registrations WHERE status='VERIFIED')::int AS verified_registrations,
        (SELECT COUNT(*) FROM tournaments WHERE status='LIVE')::int AS live_tournaments,
        (SELECT COUNT(*) FROM reviews WHERE status='PENDING')::int AS pending_reviews
    `);
    res.json({ ok:true, stats:r.rows[0] });
  } catch (e) {
    console.error(e);
    sendError(res,500,"Could not load dashboard.");
  }
});

app.get("/api/admin/reviews", auth("ADMIN"), async (_req,res) => {
  try {
    const r = await query(`
      SELECT
        rv.id,
        rv.rating,
        rv.review_text,
        rv.status,
        rv.created_at,
        p.username,
        p.display_name,
        t.title
      FROM reviews rv
      JOIN players p ON p.id=rv.player_id
      JOIN tournaments t ON t.id=rv.tournament_id
      ORDER BY rv.created_at DESC
      LIMIT 500
    `);
    res.json({ok:true,reviews:r.rows});
  } catch(e) {
    console.error(e);
    sendError(res,500,"Could not load reviews.");
  }
});

app.patch("/api/admin/reviews/:id/status", auth("ADMIN"), async (req,res) => {
  const status=req.body && req.body.status;
  if (!["PENDING","APPROVED","REJECTED"].includes(status)) {
    return sendError(res,400,"Invalid review status.");
  }
  try {
    const r=await query(`
      UPDATE reviews SET status=$1 WHERE id=$2 RETURNING *
    `,[status,req.params.id]);
    if(!r.rowCount) return sendError(res,404,"Review not found.");
    await audit("ADMIN",req.auth.id,"REVIEW_STATUS","REVIEW",r.rows[0].id,{status});
    res.json({ok:true,review:r.rows[0]});
  } catch(e) {
    console.error(e);
    sendError(res,500,"Could not update review.");
  }
});

app.get("/api/admin/staff", auth("ADMIN"), async (_req,res) => {
  try {
    const r=await query(`
      SELECT id,username,role,created_at
      FROM admins
      ORDER BY created_at DESC
    `);
    res.json({ok:true,staff:r.rows});
  } catch(e) {
    console.error(e);
    sendError(res,500,"Could not load staff.");
  }
});

app.post("/api/admin/staff", auth("ADMIN"), async (req,res) => {
  const {username,password,role}=req.body||{};
  const allowed=["OWNER","TOURNAMENT_MANAGER","RESULTS_MANAGER","MODERATOR","SUPPORT"];
  if(!username || !password || password.length<8) return sendError(res,400,"Username and a password of at least 8 characters are required.");
  if(!allowed.includes(role)) return sendError(res,400,"Invalid staff role.");
  try {
    const exists=await query("SELECT id FROM admins WHERE username=$1",[username]);
    if(exists.rowCount) return sendError(res,409,"That username already exists.");
    const hash=await bcrypt.hash(password,12);
    const r=await query(`
      INSERT INTO admins(username,password_hash,role)
      VALUES($1,$2,$3)
      RETURNING id,username,role,created_at
    `,[username,hash,role]);
    await audit("ADMIN",req.auth.id,"CREATE","ADMIN",r.rows[0].id,{username,role});
    res.status(201).json({ok:true,staff:r.rows[0]});
  } catch(e) {
    console.error(e);
    sendError(res,500,"Could not create staff account.");
  }
});

app.patch("/api/admin/staff/:id/role", auth("ADMIN"), async (req,res) => {
  const allowed=["OWNER","TOURNAMENT_MANAGER","RESULTS_MANAGER","MODERATOR","SUPPORT"];
  const role=req.body && req.body.role;
  if(!allowed.includes(role)) return sendError(res,400,"Invalid staff role.");
  if(Number(req.params.id)===Number(req.auth.id) && role!=="OWNER") {
    return sendError(res,400,"You cannot remove your own OWNER role from this session.");
  }
  try {
    const r=await query(`UPDATE admins SET role=$1 WHERE id=$2 RETURNING id,username,role,created_at`,[role,req.params.id]);
    if(!r.rowCount) return sendError(res,404,"Staff account not found.");
    await audit("ADMIN",req.auth.id,"STAFF_ROLE","ADMIN",r.rows[0].id,{role});
    res.json({ok:true,staff:r.rows[0]});
  } catch(e) {
    console.error(e);
    sendError(res,500,"Could not update staff role.");
  }
});

/* =========================================================
   STATIC FRONTEND
========================================================= */

app.use(
  express.static(frontendDir)
);

app.use(
  (req, res) => {
    if (
      req.path.startsWith("/api/")
    ) {
      return res.status(404).json({
        error:
          "API route not found."
      });
    }

    res.sendFile(
      path.join(
        frontendDir,
        "index.html"
      )
    );
  }
);

/* =========================================================
   START SERVER
========================================================= */

if (require.main === module) {
  initDb()
    .then(() => {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`UPPS v1 running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Database initialization failed:", err);
      process.exit(1);
    });
}

module.exports = app;
