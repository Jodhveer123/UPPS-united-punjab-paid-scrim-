# PayZapi sandbox configuration for the UPPS preview branch

This document is for the isolated `sandbox-token-verification-demo` branch only.

## Current safety boundary

The branch must remain a non-cash demonstration. It must not create real UPI orders, accept live credentials, mark paid tournament registrations as approved, or release paid-tournament room details. A simulated test result must never change the existing `registrations.payment_status` or `registrations.status` fields.

## Where credentials belong

If/when PayZapi confirms the sandbox API contract, add credentials in the Vercel project:

1. Open the UPPS project in Vercel.
2. Open **Settings → Environment Variables**.
3. Add the variables below for **Preview** only, scoped to the Git branch `sandbox-token-verification-demo`.
4. Do not add them to Production or Development. Do not commit them to GitHub, put them in HTML/JavaScript, or send them in chat.

Planned variable names (the current application does not yet read these variables):

- `PAYZAPI_TEST_API_KEY` — test key only (PayZapi advertises a `fam_test_...` prefix).
- `PAYZAPI_TEST_WEBHOOK_SECRET` — only if PayZapi provides a separate sandbox webhook secret.
- `PAYZAPI_TEST_BASE_URL` — only after PayZapi confirms the sandbox base URL in writing.

Do not use a `fam_live_...` key. Do not substitute the documented production base URL as a sandbox URL.

## Why the provider connection is not enabled yet

The public PayZapi documentation currently has an important gap:

- The API reference labels `https://payzapi.in/api/v1` as the **Production API Base URL** and its request examples use `fam_live_...`.
- The product page advertises `fam_test_...` keys and five free sandbox test requests, but does not specify a separate sandbox base URL or clearly state whether test keys use the production host.
- The API reference describes `/check` statuses as `completed`, `pending`, and `expired`; its webhook example uses `payment.completed`, while the product page also shows `order.paid` / `paid`. These event/status differences need provider confirmation before a verifier can safely interpret them.

Therefore, do not send any key to an endpoint until PayZapi confirms the sandbox host, supported test-key behavior, exact webhook event shape, and test webhook signing secret.

## Intended verification flow (test-only)

1. A player starts a clearly labelled simulated test transaction in the preview branch.
2. The UPPS backend creates a sandbox-only test record with a unique internal test ID. No UPI QR, payment link, or money transfer is created.
3. A test event is submitted to the preview webhook route.
4. The backend verifies the HMAC-SHA256 signature over the exact raw request body using a test-only secret, then validates the test ID, expected test amount, event type, and duplicate-event status.
5. The backend updates only the sandbox test record and writes an audit event.
6. The player/admin preview screens display **TEST VERIFIED** or **TEST FAILED**. This state is visually and structurally separate from tournament registration/payment approval.

A browser redirect or a client-side “success” message is never proof of payment. A failed signature, mismatched test ID/amount, unknown event, or duplicate event must not produce a verified test result.

## Existing UPPS code

The current application uses Express and PostgreSQL. Its existing manual payment workflow uses `registrations.payment_status`, `payment_events`, and the admin payment-review routes. Keep that workflow unchanged in this demonstration. Do not reuse its `VERIFIED` state for simulated events.

## Official provider references

- https://payzapi.in/docs
- https://payzapi.in/

This document records the safe configuration plan; it does not claim that a PayZapi sandbox connection has been implemented or tested.
