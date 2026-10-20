# 0001 — Webhook pipeline and event application

## Context

The brief: verify the signature before any processing; reject and record an invalid one; store the
raw notification, respond 2xx, then process it; a repeat is recorded but not applied twice; a late
event is recorded but does not change state; a terminal state is final; an unmatched notification
goes to the review queue with a 2xx. Event ids repeat only on redelivery (clarification 7).
Provider timestamps do not give an order (clarification 8).

## Decision

**Two tables.** `webhook_deliveries` keeps every HTTP hit as received; `provider_events` holds one
row per `(connector, event_id)` and is the processing inbox. Deliveries preserve every receipt;
events give each logical event exactly one application.

**Ingress** takes no payment lock and writes before it answers:

- Signature checked on the raw bytes (constant-time; Bravo timestamp within 5 minutes). Invalid →
  the delivery is stored with its signature status → 401. Nothing else is read from it.
- Valid → the delivery is stored, then the event:
  `INSERT … ON CONFLICT (connector, event_id) DO NOTHING`. A redelivery adds a delivery row and no
  event row, so two concurrent copies still yield one event.
- The event is matched by the reference we sent (the attempt id). No match → the event is stored
  already processed, together with an `UNMATCHED_EVENT` review request, and still answered 200.

**Processing** is a separate worker (`processWebhooks`). It takes a payment with unprocessed events
(`FOR NO KEY UPDATE SKIP LOCKED`), applies them in arrival order (`received_at`, then `id`) through
`AttemptTransitionPolicy.apply`, then runs the payment decision once (ADR 0004).

| Attempt is | Event says | Result |
|---|---|---|
| open | a higher open status (`PENDING` over `UNKNOWN`) | applied |
| open | an equal or lower open status | ignored |
| open | `SUCCEEDED` / `FAILED` / `EXPIRED` | applied |
| terminal | an open status, or the same terminal | ignored |
| `FAILED` / `EXPIRED` | the other of the two | ignored |
| `SUCCEEDED` | `FAILED` / `EXPIRED` | status kept; review `SUCCEEDED_THEN_FAILED` |
| `FAILED` / `EXPIRED` | `SUCCEEDED` | status kept; review `FAILED_THEN_SUCCEEDED` |
| any | a refund or payout return | no transition; review `FUNDS_RETURNED` |
| any | an unrecognised status (e.g. `PARTIALLY_PAID`) | stored in full; review `UNRECOGNISED_EVENT` |

Every event keeps its result and `processed_at`; nothing is deleted. Alpha `EXPIRED` is defined only
for a QR deposit (clarification 4), so on a withdrawal it is unrecognised.

## Consequences

- Open-state updates never overwrite a terminal result; the first terminal result stays, and a
  conflicting success or failure goes to review.
- Scenario 4 ("completed, then an older failed") keeps the payment `success` and also raises
  review: without a provider ordering, "older" cannot be established.
- An event that a busy worker skipped is picked up by the next run; it is never lost.

## Proof

- Scenarios 3, 4, 9 and 10 in `tests/e2e/scenarios.e2e-spec.ts`.
- `duplicate webhook delivered concurrently: every delivery recorded, applied once`.
- `a webhook body that is not JSON is still recorded byte for byte`.
- `matched webhook ingress completes on another connection before the payment lock is released`.
- Unit: `events converge in any order` permutes consistent event sequences and asserts one final
  attempt status; the transition table is tested row by row in `attempt-transition.policy.spec.ts`.
