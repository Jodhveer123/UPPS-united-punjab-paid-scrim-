# UPPS mock payment verification demo

This branch contains a **mock-only** verification flow. It does not connect to PayZapi, FamPay, UPI, or any other payment service. It creates no real payment request and transfers no money.

## Vercel Preview variables

In the Vercel project, open **Settings → Environment Variables** and add these variables for **Preview** only, scoped to `sandbox-token-verification-demo`:

| Variable | Example placeholder | Purpose |
|---|---|---|
| `DEMO_PAYMENT_API_KEY` | `payment-key` | Server-side HMAC key used to create a mock checkout reference |
| `DEMO_WEBHOOK_KEY` | `webhook-key` | Shared test secret expected in the mock webhook header |

Use your own random test-only values in Vercel rather than the example words above. Do not add them to Production, commit real secrets, or send them in chat. The `.env.example` file is only a template.

## How the mock flow works

1. A logged-in player sends `POST /api/demo-payments/create`.
2. The backend creates an isolated database record with a unique `TESTPAY-` ID, fixed amount `1.00`, currency `TEST`, and status `TEST_PENDING`.
3. The backend signs the internal checkout reference with `DEMO_PAYMENT_API_KEY`. The key itself is never returned to the browser.
4. A test sender posts a fake `payment.confirmed` event to `POST /api/demo-payments/webhook`, including the test ID, amount, currency, checkout reference, and a unique event ID.
5. The backend checks `x-demo-webhook-key`, verifies the signed reference, checks the expected test amount/currency, and rejects unknown or replayed events.
6. A valid event changes only the isolated demo record to `TEST_VERIFIED`.
7. The player can read the result through `GET /api/demo-payments/:testId`.

## Windows CMD test outline

First sign in to the Preview website in your browser. Use the browser's authenticated session when calling the create endpoint, or use the site's existing authenticated API session. The create endpoint returns `testId` and `checkoutReference`.

Then send a simulated webhook from CMD (replace the preview URL and values with the returned ones):

```cmd
curl.exe -X POST "https://YOUR-VERCEL-PREVIEW-URL/api/demo-payments/webhook" -H "Content-Type: application/json" -H "x-demo-webhook-key: YOUR_DEMO_WEBHOOK_KEY" -d "{\"eventId\":\"evt-test-001\",\"event\":\"payment.confirmed\",\"testId\":\"TESTPAY-REPLACE\",\"amount\":\"1.00\",\"currency\":\"TEST\",\"checkoutReference\":\"PASTE_RETURNED_REFERENCE\"}"
```

A successful simulated event returns `TEST_VERIFIED`. Repeating the same event is treated as a duplicate. A wrong webhook key, amount, currency, event type, or checkout reference is rejected.

## Safety and scope

- This is not a payment gateway integration. No provider API request, UPI intent, QR code, payment link, or real transaction exists.
- `TEST_VERIFIED` is deliberately separate from the existing registration `VERIFIED` state.
- The mock routes do **not** approve tournament registrations, grant tournament entry, reveal room credentials, or update prizes.
- Existing tournament/payment workflows are not modified by this mock verifier.
- Do not add live provider keys or use this test harness to verify real payments.

The mock route implementation is in `backend/server.js`; the environment variable template is `.env.example`.


## QR-triggered signal demo (no API keys required)

The player dashboard also includes a separate **QR Signal Verification** panel:

1. A signed-in player clicks **Generate QR session**.
2. The backend creates a random, one-time token and stores only its SHA-256 hash in `demo_access_sessions`. The session expires after five minutes.
3. The dashboard renders a QR locally in the browser. Scanning it opens `/demo-confirm.html` on the UPPS site.
4. The phone page accepts any short non-empty text (1–32 characters) and sends it to `POST /api/demo-access/confirm`.
5. The backend checks the one-time token, expiry, and session state, then changes only that demo session to `TEST_ACCESS_GRANTED`.
6. The dashboard polls `GET /api/demo-access/status/:sessionId` every two seconds and displays **ACCESS GRANTED — TEST MODE** when the backend confirms it.

This flow uses no payment provider, payment API key, webhook secret, QR payment app, or money. The QR is simply a one-time link to a test confirmation page. The website's polling response acts as its live notification. The status is not connected to tournament registration approval, paid-entry verification, or room credentials.

The QR generator is loaded in the browser from the QRCode.js CDN. If that external script is blocked, the dashboard displays an error and the QR cannot be rendered.
