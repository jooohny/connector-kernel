# 0005 — Reconciliation, lifetime and review

## Context

`runStatusSweep(now)` queries open attempts on connectors that support it, more often at first and
less often later; tests call it directly. Alpha's new orders can take up to 60 seconds to appear on
its status endpoint; Bravo has no status query. A transaction lives 15 minutes; the lifetime limits
new attempts, and an attempt still unknown at the end flags the transaction for manual review while
it stays processing (clarification 3).

## Decision

**Schedule.** The first status check becomes due 35 seconds after the attempt is created (the 30 s
create timeout plus 5 s), then at 60, 120, 300 and 600 seconds, then every 5 minutes. Connectors
without a status query have no schedule.

**`runStatusSweep(now)`** does three things:

1. queries the due attempts with no transaction open, applies each result under the payment lock
   (ADR 0003), and always moves `next_check_at` on, after a 404 or a transport error too;
2. runs the webhook worker for events still waiting;
3. raises `LIFETIME_ENDED_UNRESOLVED` review for any attempt still open after the lifetime.

When the service runs under Compose, the webhook worker runs every second and the sweep every 5
seconds; tests disable both and call them directly.

**Review is its own table.** `review_requests` holds a reason, the payment and attempt (none for an
unmatched webhook), the event that raised it, and when it was raised and resolved. At most one open
request per attempt and reason. Review requests are stored for operators; the payment API does not
expose them.

| Reason | Raised when | Resolved automatically |
|---|---|---|
| `LIFETIME_ENDED_UNRESOLVED` | the lifetime ended with this attempt open | yes, by a clear result |
| `UNCONFIRMED_REJECT` | an unclear create reject on a connector without a status query | yes, by a clear result |
| `SUCCEEDED_THEN_FAILED`, `FAILED_THEN_SUCCEEDED` | two contradicting terminal results | no |
| `UNRECOGNISED_EVENT`, `FUNDS_RETURNED` | an event we cannot or should not apply (ADR 0001) | no |
| `UNMATCHED_EVENT` | a valid webhook that matches no attempt | no |

**Lifetime.** After 15 minutes no new attempt starts. Open attempts keep receiving webhooks and
status results; a confirmed failure after the lifetime declines the payment when nothing is open or
under review. An open review request blocks a new attempt.

## Consequences

- A crashed sweep loses nothing: the attempt stays due.
- Webhooks and status results share one transition table, so the same tests cover both.
- A contradiction between two terminal results is never settled automatically; the payment keeps
  its status.

## Proof

- Scenario 7 (404 waits, `FAILED` cascades) and scenario 8 (no recovery: one lifetime review, still
  `processing`) in `tests/e2e/scenarios.e2e-spec.ts`.
- `tests/unit/payments/sweep-schedule.spec.ts`, including `schedules the first query after the
  create timeout`.
- `a status query that closes the attempt clears its next check`.
- `the sweep reads the clock after each status query: a failure confirmed after the lifetime
  declines`.
- `insertOne is idempotent and SYSTEM resolves only the two system review reasons`;
  `rejects a second open review for the same attempt and reason`.
