# Spec note

For the team building the production version.

## What you must get right

1. **Unknown blocks the cascade.** A timeout, a 5xx, an unclear reject or an unknown code leaves the
   attempt unknown. Only a provider's confirmed failure starts the next provider, and a withdrawal
   is never sent again after a timeout.
2. **One open attempt per payment, in the database.** A partial unique index, not application
   code, stops two workers from starting two payouts.
3. **A final result is final.** An open status never overwrites it. If a success and a failure both
   arrive for one attempt, the first stays and the case goes to review. Provider timestamps are not
   an ordering (clarification 8).
4. **Webhooks: signature, store, answer, apply.** The raw bytes are verified and stored before the
   200; a redelivery is recorded and applied once; a bad signature is stored and answered 401.
5. **An unresolved payment is never declined or expired.** The 15-minute lifetime only stops new
   attempts. An attempt still open at the end keeps receiving results and is flagged for review;
   the payment stays `processing`. A confirmed failure after the lifetime declines it, because no
   new attempt may start.

## The rule I would change: create rejects

Clarification 1 makes an explicit Alpha `REJECTED` with a documented code a confirmed failure, so
the cascade could start straight from the create reply. I would keep that only for code 14
(invalid account): the request is wrong, so the payment is declined and no other provider is tried.
Codes 51, 91 and 96 do not say whether the order exists or money moved, and a wrong reject followed
by a cascade is a second payout.

**Proposal:** treat those rejects as unknown and confirm them with a status query 35 seconds after
the create (its 30 s timeout plus 5 s), using the sweep the brief already requires. The cost is a
short delay on a rare path. This is what the kernel does; clarification 2 allows the conservative
choice.

Assumption: Alpha's status query answers `FAILED` for an order it rejected on create. If it answers
404 instead, such payouts do not cascade; they go to review when the lifetime ends. Bravo has no
status query, so an unclear Bravo reject goes to review at once; a later webhook can still resolve
it.
