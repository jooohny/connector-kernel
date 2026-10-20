# 0004 — Outcome classification and cascade

## Context

A timeout, dropped connection, unclear response or unrecognised code is unknown; for withdrawals,
anything but an explicit decline is unknown. Unknown blocks any retry or cascade, deposits included
(clarification 9); only a confirmed failure unblocks it. Code mappings are data, with a more
conservative withdrawal mapping. Once a deposit's QR is returned, cascading is closed. A provider
with no bank mapping is skipped.

## Decision

**Two axes.** Every provider result answers: do we know it (success / failure / unknown), and did
the request or the provider fail (`CLIENT` / `PROVIDER`)?

**Create replies.** The code tables and the reason for each borderline code are in
[DESIGN.md](../../DESIGN.md#provider-codes). Alpha has a create-reject map per payment type; a unit
test asserts the withdrawal map is never less conservative than the deposit map. Bravo's create is
classified by HTTP status and the failing field. A code missing from a table, a timeout, a 5xx or an
unparsable body is unknown. A create reply never starts a cascade (see SPEC-NOTE).

**Status 404.** Alpha's "order not found" is no information at any age: the attempt keeps its
status and keeps being polled (clarification 10).

**Unclear reject without a status query.** Bravo cannot be asked, so an unclear reject sets the
attempt `UNKNOWN` and raises `UNCONFIRMED_REJECT` review at once; a later terminal webhook can still
resolve it. A timeout is not a reject: the payout may exist, so it waits (scenario 8).

**Confirmed failure, cause.** A recognised `FAILED` status or event is confirmed; its code gives the
cause. A code missing from the cause table counts as `PROVIDER`: the failure is confirmed, so the
worst case is one more decline at the next provider.

**The decision.** `PaymentDecider.nextAction` runs under the payment lock after an attempt changes.
It starts the next attempt only when all hold:

1. the changed attempt is `FAILED` with cause `PROVIDER`;
2. the payment has no open review request;
3. the 15-minute lifetime has not ended (clarification 3);
4. no attempt returned a QR to the caller;
5. an untried connector with a bank mapping is next in the route;
6. fewer than 3 attempts exist.

Payment status follows the changed attempt: `SUCCEEDED` → `success`; a deposit `EXPIRED` →
`expired`; open → `processing`; `FAILED` → `processing` while a review is open, `declined` for a
client-side cause, the next attempt if 1–6 hold, otherwise `declined`. A terminal payment status
never changes.

## Consequences

- A timeout never leads to a second send; it leads to waiting, polling or review.
- Cascade relies on a confirmed failure being final; a later contradicting success is recorded for
  manual review (ADR 0001).

## Proof

- Scenarios 5, 6 and 7 in `tests/e2e/scenarios.e2e-spec.ts`.
- `tests/unit/payments/payment-decider.spec.ts`, e.g. `starts Bravo attempt 2 after Alpha fails on
  the provider side`, `declines a client failure using its message`.
- Alpha: the `create rejects` table tests, `withdrawal is never less conservative than deposit for
  %s`, `attributes confirmed FAILED code %s to %s`; Bravo: `attributes confirmed failure %s`.
- `an unclear Bravo reject raises UNCONFIRMED_REJECT at once`.
- `a JAGO withdrawal never reaches Bravo: a provider-side failure declines`.
