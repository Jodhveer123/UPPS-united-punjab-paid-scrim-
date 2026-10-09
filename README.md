# UPPS v1

United Punjab Paid Scrim Tournaments — full-stack tournament platform.

## Stack

- Node.js 22+
- Express
- PostgreSQL
- Plain HTML/CSS/JavaScript frontend
- JWT authentication in an HttpOnly cookie

The Express server serves the frontend and API from one deployment, which is the simplest free deployment architecture.

## Local setup

1. Install Node.js 22 LTS or newer.
2. Create a PostgreSQL database.
3. Copy `.env.example` to `.env`.
4. Fill in `DATABASE_URL`, `JWT_SECRET`, and admin credentials.
5. Run:

```cmd
npm install
npm start
```

Open `http://localhost:10000`.

The server automatically creates the database tables and an admin account from the environment variables.

## Main routes

- `/` public homepage
- `/tournaments.html` tournament list
- `/login.html` player login
- `/register.html` player registration
- `/player.html` player dashboard
- `/admin.html` admin dashboard

## Production deployment

Recommended free architecture at the time this package was created:

- Render Web Service for the Node/Express application
- Neon Postgres for the database

The app listens on `process.env.PORT` and `0.0.0.0`, as required by Render.

Never commit `.env` or real payment credentials.

## Important

This is a complete functional v1/MVP foundation, but payment verification and prize payouts are deliberately records/workflows: an adult organizer must verify actual payments and handle real-money payouts through an appropriate account. UPPS is not affiliated with Garena or Free Fire.


## Registration approval flow

New tournament registrations start as `PENDING` (or `WAITLISTED` when capacity is reached). They are not automatically eligible to play. An adult organizer reviews registrations in the Admin panel and can approve or reject them. The player dashboard clearly shows the resulting eligibility status.

This version intentionally does not implement real-money payment collection or payout handling.
