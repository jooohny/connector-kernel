# 0003 — Concurrency and dispatch: constraints, a short payment lock, no network inside it

## Context

"A transaction has at most one active attempt at a time, enforced by the database." Maximum 3
attempts; each connector at most once (clarification 5). Webhooks, the sweep and the create path can
touch one payment at the same moment, and a provider call can hang or the process can die mid-call.

## Decision

**Invariants are constraints on `payment_attempts`:**

| Rule | Constraint |
|---|---|
| ≤ 1 attempt that is open or succeeded | partial unique index `payment_attempts__one_open_or_succeeded__uniq` on `payment_id` where status is `UNKNOWN`, `PENDING` or `SUCCEEDED` |
| each connector once | `UNIQUE (payment_id, connector)` |
| ≤ 3 attempts | `CHECK (attempt_no BETWEEN 1 AND 3)` and `UNIQUE (payment_id, attempt_no)` |

A new attempt follows only a `FAILED` one, so `SUCCEEDED` belongs in the index: no attempt can start
beside a success.

**One payment row lock serializes decisions.** Every decision about a payment (apply events or a
provider reply, decide, insert an attempt) runs under `SELECT … FOR NO KEY UPDATE` on the payment,
after re-reading its state. The webhook worker skips a locked payment; everything else waits for a
short transaction. Webhook ingress takes no payment lock. Status changes are written as
`UPDATE … WHERE status = :from`; zero rows is an error, never ignored.

**No network call inside a transaction.** The attempt is committed as `UNKNOWN` first, the provider
is called with no transaction open, and the reply is applied in a second short transaction under
the lock. The same holds for a cascade and for status queries.

**The committed attempt row is the intent to send.** There is no outbox or `SUBMITTING` status. If
the process dies after the commit, the attempt stays `UNKNOWN` and is resolved by a webhook, a
status query or review (ADR 0005). It is never sent again: a crash before the call and a crash
during it look the same from the database.

## Consequences

- Two racing cascades cannot both insert an open attempt; the unique index rejects the second.
- A slow provider holds no lock and no database connection.
- Concurrent status queries for one attempt are possible; each result is applied under the lock
  against the current state.

## Proof

- `tests/e2e/schema.e2e-spec.ts`: `rejects a new attempt beside SUCCEEDED with the open-or-succeeded
  index`, `allows a new open attempt after the only attempt has FAILED`, `rejects the same connector
  twice for one payment`, `rejects attempt_no 4 with the attempt number check`.
- `creating a second open attempt throws typed OPEN_ATTEMPT_EXISTS`.
- `lost race: a second update from UNKNOWN throws ROW_CHANGED_OUTSIDE_LOCK`.
- `a busy payment is skipped and a normal lock waits until the holder finishes`.
