# Task clarifications

Numbered clarifications referenced by the design.

1. Synchronous rejections. An explicit REJECTED from Alpha's create call with a documented code is a confirmed failure. You don't need a webhook or status query to confirm it. The "webhook or status query" rule is about resolving an attempt whose result is unknown, for example after a timeout. The brief should have said that more clearly.
2. Borderline codes (51, 91, 96). Classifying them is part of the task. Treating an unclear code as unknown is acceptable, and it's the safer default for withdrawals. Whatever you choose, give one line of reasoning per borderline code in the mapping table in DESIGN.md.
3. The 15-minute lifetime. It limits when new attempts may start. What happens to an attempt still open at the end, and to webhooks that arrive later, is for you to decide and explain in SPEC-NOTE.md. The fixed rule: a transaction with an unresolved attempt is never marked declined or expired.
4. Unpaid QR deposits. Alpha sends a webhook with status EXPIRED after expires_at. The transaction then becomes expired, not declined.
5. Maximum 3 attempts. An attempt is one call to one connector. Try each connector at most once per transaction. The cap matters on routes with more connectors; with the IDR routes you'll reach 2 at most.
6. method. The payment method: qr for deposits and bank_transfer for withdrawals. You can choose the names.
7. Event ids. Alpha's event_id and Bravo's id are unique per event. A redelivery of the same event repeats the id, and two different status updates never share one.
8. Provider timestamps. Neither provider guarantees that occurred_at or created reflect the order of status changes. Bravo's created is in whole seconds.
9. Cascading a deposit after a create timeout. The rule stands: an unknown result blocks the cascade, deposits included. Also note that IDR QR deposits route to Alpha only. If you think the rule is wrong for deposits, argue it in SPEC-NOTE.md.
10. Payout timeout and Alpha's 60-second window. Waiting for a webhook or polling, without cascading, is consistent with the brief. What a 404 after 60 seconds means is your call; explain it in DESIGN.md.
