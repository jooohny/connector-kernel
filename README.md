# connector-kernel

A payments kernel: a payment (the client's intent: deposit or withdrawal) and its attempts (one
call to one provider each), two provider adapters (Alpha, Bravo), signed webhooks, a status sweep
and a cascade between providers. NestJS 11, TypeORM, PostgreSQL 16.

API:

| Route | Does |
|---|---|
| `POST /payments` + `Idempotency-Key` header | creates a payment and sends attempt 1; the same key and body replay the stored response (409 `REQUEST_IN_PROGRESS` with the payment's `resourceId` while the first request is still sending: read it with `GET /payments/:id`) |
| `GET /payments/:id` | status (`processing` / `success` / `declined` / `expired`) and attempts |
| `POST /webhooks/:connector` | verifies the signature, stores the raw delivery, answers 200 (401 bad signature, 404 unknown connector) |

## Run it

Node.js 20.18 or newer and a running Docker daemon.

```sh
npm run up                     # PORT=3999 npm run up if 3000 is taken
curl localhost:3000/health
```

`up` copies `.env.example` to `.env` if absent, then starts PostgreSQL, the migration runner and
the API. For plain Compose: `cp .env.example .env && docker compose up --build`. The provider URLs
in `.env.example` never resolve, so a create ends `UNKNOWN`. `npm run down` stops the stack.

## Test it

```sh
npm install && npm test        # unit, then e2e against a throwaway PostgreSQL container
npm run verify                 # lint + strict typecheck + dependency rules + unit tests, no Docker
```

Without Node on your machine, the same suite runs in containers next to a throwaway PostgreSQL
(the code is mounted read-only; no Docker socket is shared):

```sh
docker compose -f docker-compose.test.yml run --rm tests
docker compose -f docker-compose.test.yml down -v
```

With npm available, `npm run test:docker` runs both commands and keeps the test exit code.

E2e tests start their own PostgreSQL container and run the migrations; with `TEST_DATABASE_URL`
set, as in the containers above, they use that database instead. Providers are faked at the
HTTP transport only, so the real Alpha and Bravo adapters run in every scenario; separate unit
tests cover the real HTTP client's timeouts. No test calls a real provider.

| Tests | Prove |
|---|---|
| `tests/e2e/scenarios.e2e-spec.ts` | the 10 required scenarios, end to end over HTTP, each named after its scenario |
| `tests/e2e/{schema,payments-persistence,payment-lock,use-cases}.e2e-spec.ts` | database constraints, concurrency and locking, edge cases |
| `tests/unit/payments/` | adapters and code tables, the payment decision, attempt transitions, sweep schedule, money |

## Layout

```text
migrations/                         schema, constraints and indexes
src/@core/                          exceptions, filter, config, response base
src/modules/payments/
  domain/                           models, decider, transition policy, routes, money (no framework)
  application-services/             use cases: create, get, record webhook, process inbox, status sweep
  infrastructure/connectors/        Alpha, Bravo, code tables, signatures, HTTP client
  infrastructure/persistence/       entities, repositories, payment lock
  ui/http/                          controllers, presenters, DTOs
tests/unit  tests/e2e  tests/support
docs/adr/                           decisions
```

## Design decisions

The short version; [DESIGN.md](DESIGN.md) explains how it works and where to look,
[SPEC-NOTE.md](SPEC-NOTE.md) lists what a production team must get right and the rule I would
change, [docs/adr/](docs/adr/) holds one record per decision.

- Invariants live in PostgreSQL: one open or succeeded attempt per payment (partial unique index),
  each connector once, at most 3 attempts, one payment per idempotency key.
- Provider codes are data, never a `switch`; an unknown create code is unknown.
- A create reject other than "invalid account" is confirmed by a status query before any cascade
  (SPEC-NOTE).
- Webhooks: signature first, the delivery stored, 200, then applied by a background worker.
  Duplicates and late events are recorded but change nothing; a terminal attempt stays terminal.
- No network call inside a database transaction: the provider is called between two short
  transactions, under a per-payment row lock.
- An attempt still unknown when the 15-minute lifetime ends goes to a review queue; the payment
  stays `processing`.

## What I cut, and what I would do next

Within the timebox I put the money-safety core first: the ten scenarios, the constraints and the
webhook pipeline. Left out, all optional in the brief:

- **Reversals.** Refunds and payout returns are recognised and sent to review, not processed.
- **Partial payments and amount mismatches.** `PARTIALLY_PAID` goes to review as unrecognised;
  amounts reported by providers are not compared with the payment.
- **An outbox** with a per-payment sequence for other services.
- **Metrics.**

With another day:

- An operator endpoint to read and resolve the review queue (today it is a table).
- Metrics: attempts per outcome, time to a clear result, review queue size.
- Comparing provider-reported amounts with the payment.
- Asking Alpha how its status query answers for an order rejected on create (SPEC-NOTE).

## How I used AI tools

I used AI coding agents (Claude Code and Codex) as a fast implementation team, while the
architecture and the judgement calls stayed with me. I decided how the system should behave,
especially where money is at risk, and the agents turned those decisions into code. Every change
went through my review, and I kept steering toward the simplest design that is still correct.
Used this way, AI made me faster without making the decisions for me.
