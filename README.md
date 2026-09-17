# QA Performance Practice Project

A local API you fully control, built to practice three things at once:
**SQL (JOIN + UPDATE validation)**, **Redis caching**, and **Artillery load testing** —
all three map directly to gaps/requirements from the backend QA role you're applying to.

Verified working: builds clean with `npm run build`, and manual smoke tests confirmed
`/users`, `/users/:id` (cache MISS→HIT), `/login` → `/profile` (JWT chain), and the
JOIN preview endpoint all return correct results.

## Setup

```bash
npm install
npm run build
npm start
```

Server runs at `http://localhost:3000`. By default it uses an **in-memory cache**
(no Redis server required) so you can run it standalone immediately.

### To practice against real Redis (recommended before your interview)

```bash
docker run -p 6379:6379 redis
USE_REAL_REDIS=true npm start
```

Now `GET /users/:id` is genuinely backed by Redis. Try:
- `redis-cli KEYS '*'` to see cached keys
- `redis-cli TTL user:5` to watch the 30s expiry count down
- Comment out the `cache.del(...)` line in `src/index.ts`'s `PUT /users/:id`
  handler, restart, and reproduce the stale-cache bug from Scenario 1 in
  the refresher doc on purpose — then put the fix back and confirm it's resolved.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/login` | Returns a JWT for a given `userId` |
| GET | `/users` | List all users (uncached — baseline load target) |
| GET | `/users/:id` | Single user (cached, 30s TTL — watch `X-Cache: MISS`/`HIT` header) |
| PUT | `/users/:id` | Update email + invalidate cache (demonstrates correct invalidation) |
| GET | `/profile` | Requires `Authorization: Bearer <token>` — for the login→auth-flow scenario |
| POST | `/orders` | Create an order (stateful write, good POST load target) |
| GET | `/admin/preview-flag-orders` | SELECT preview of the JOIN — see which rows *would* be affected |
| POST | `/admin/run-flag-orders` | Runs the actual JOIN+UPDATE in a transaction, returns rows changed |

## SQL practice (JOIN + UPDATE scoping)

The pattern in `src/db.ts` (`previewFlagQuery` / `runFlagUpdate`) mirrors exactly
what you described doing at Shopee: validating an UPDATE-with-JOIN-and-filter
against mock data before it ships.

Try this:
1. `curl http://localhost:3000/admin/preview-flag-orders` — see which rows would be affected
2. Deliberately loosen the JOIN in `db.ts` (e.g., remove the region filter) and
   re-run the preview — watch the row count balloon. This is the exact bug
   pattern from Scenario 4 in the refresher doc.
3. Put the filter back, confirm the row count returns to expected.

## Load testing with Artillery

Two scenarios are included in `artillery/`:

- **`basic-load.yml`** — ramping load against `/users`, `/users/:id`, `/orders`
- **`auth-flow.yml`** — the login → capture token → authenticated request chain

Run them:

```bash
npm run load:basic
npm run load:auth
```

(Make sure `npm start` is running in another terminal first.)

### Finding your breaking point

In `artillery/basic-load.yml`, increase the `arrivalRate` / `rampTo` values in
the "Sustained peak" phase until you see:
- p95/p99 latency climb noticeably, or
- non-2xx responses start appearing

Note the arrival rate where that happens — that's your concrete "I found where
it degrades" story for the interview, instead of just "I ran a load test."

## Stretch goal

Wire `npm run load:basic` into your existing `testjenkins` CI/CD pipeline as a
stage that runs after deploy and fails the build if p95 latency exceeds a
threshold. This directly echoes the JD's "integrated into CI pipelines" language.
