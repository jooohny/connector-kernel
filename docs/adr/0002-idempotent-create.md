# 0002 — Idempotent create with a stored response

## Context

Scenario 2: the same key and body return the same response with one attempt; the same key with a
different body is a distinct error; two concurrent requests with one key create one transaction.
The API has no merchant field.

## Decision

- `payments.idempotency_key` is `UNIQUE`, global (there are no merchants).
- Create inserts with `ON CONFLICT (idempotency_key) DO NOTHING`. On conflict the request is compared
  with the stored payment columns: any difference → a conflict error.
- `payments.result_snapshot` stores the create response our API returned. The same key and request
  replay it, even after the payment's status has moved on.
- Until that response is stored, a retry with the same key returns 409 `REQUEST_IN_PROGRESS` with
  the payment's `resourceId` and sends nothing; the client reads the payment with
  `GET /payments/:id`.

## Consequences

- One payment and one attempt per key, decided by the unique index, not by request timing.
- A replay returns the original response, including the QR, after the payment succeeds.

## Proof

- Scenario 2 in `tests/e2e/scenarios.e2e-spec.ts`.
- `concurrent creates with the same key insert one payment and one attempt`.
- `a repeated key while the first send is in progress returns REQUEST_IN_PROGRESS with the payment id`.
- `a create replay preserves the original result after the payment succeeds`.
- `a reused withdrawal key with accountNumber 987654321 conflicts`.
