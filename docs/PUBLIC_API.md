# Moveup Media — Rank Tracking API

Read-only HTTP API over the rank-tracking data: the projects we track, the
keywords under them, every position snapshot we have taken, and two derived
views the console computes.

Base URL: `https://ai-workflow-kappa-one.vercel.app/api/v1`

---

## Authentication

Every request needs a key.

```
Authorization: Bearer mu_live_xxxxxxxx_…
```

or, if that is awkward:

```
X-API-Key: mu_live_xxxxxxxx_…
```

Keys are created in the console under **Users → API Keys**, by a super-admin. A
key is shown once, at creation, and never again — it is stored as a SHA-256
hash, so nobody, including an administrator, can recover it. Lost keys are
revoked and replaced.

**A key is its own identity.** Unlike a login, it carries only the scope chosen
when it was created: either every project, or an explicit list. It never
inherits a signed-in user's access, so handing a key to an outside agency gives
them exactly what the key says and nothing else.

**The API is read-only.** Any method other than `GET` returns `405`, checked
before the key is even examined.

### Errors

| Status | Meaning |
|---|---|
| `401 unauthorized` | Missing, malformed, unknown or revoked key. Deliberately indistinguishable — the API will not confirm that a prefix exists. |
| `403 project_not_in_scope` | The project exists but is outside this key's scope. |
| `404 not_found` | No such row, or no such endpoint. |
| `405 read_only` | A non-GET method. |
| `503` | The key store or database is unavailable. |

---

## Read this before trusting a number

Four things about this data that will otherwise look like bugs.

**A null `position` means "not ranking", not zero.** The target did not appear
anywhere in the tracked depth of that SERP. Sorting or averaging as if it were 0
puts the worst pages first and drags every average to meaningless.

**`source` tells you which engine measured the row.** Snapshots written before
the DataForSEO migration have `source: null` and came from SerpAPI. Two
providers sample Google differently — most keywords shift a place or two across
that boundary — so a position change spanning it is a change of instrument, not
of ranking. `/stats/{project_id}` reports `latest_from_serpapi` so you can see
how much of a project is still on the old side of it.

**Snapshots are daily at best, and a gap is deliberate.** The sweep records
nothing rather than guessing when the SERP source is unavailable, so a missing
day means "not measured", never "unchanged". Do not forward-fill without saying
that you did.

**`top_domains` is the top ten of that SERP at that moment**, stored even when
our own target was nowhere in it. It is the most useful field here for
competitor work and the easiest to mistake for our own rankings.

---

## Endpoints

### `GET /api/v1`

The endpoint map. Needs no key, so it is the easiest way to check the service is
up before debugging your auth.

### `GET /api/v1/whoami`

Which key this is and what it can read. The call to make first.

```bash
curl -H "Authorization: Bearer $KEY" https://ai-workflow-kappa-one.vercel.app/api/v1/whoami
```

### `GET /api/v1/projects`

Tracked domains with their current KPIs: keyword count, average position, top 3,
top 10, visibility percentage and when they were last checked.

### `GET /api/v1/keywords`

Tracked keywords, each with its most recent snapshot. Ordered by position,
ranking keywords first.

| Parameter | Notes |
|---|---|
| `project_id` | Restrict to one project. |
| `q` | Substring of the keyword. |
| `position_max` | Only keywords at or above this position. |
| `ranking` | `true` for keywords with a position, `false` for those without. |
| `updated_since` | ISO timestamp. The incremental-sync parameter. |
| `limit`, `offset` | Default 100, max 500. |

Returns `{ total, limit, offset, rows }`.

### `GET /api/v1/keywords/{tracking_id}`

One keyword with its position history. `history_days` defaults to 90, max 365.

### `GET /api/v1/rankings`

Raw snapshots, oldest first — the endpoint to sync from. Filter with `since`
against a stored high-water mark rather than re-reading everything. `limit`
defaults to 200, max 1000.

### `GET /api/v1/stats/{project_id}`

**Derived.** One project in numbers: how many keywords rank, how many do not,
top 3 and top 10 counts, average position, today's coverage, and
`latest_from_serpapi` — how many keywords' newest snapshot predates the
DataForSEO migration.

### `GET /api/v1/alerts`

Recent ranking alerts: drops, gains, lost rankings and featured-snippet changes,
with the previous and current values.

---

## Paging

`limit` defaults to 100 and caps at 500 (1000 on `/rankings`). Page with
`offset` until you have `total` rows. For a full pull, prefer `since` or
`updated_since` on a stored high-water mark.

## Worked example

```bash
KEY=mu_live_xxxxxxxx_…
BASE=https://ai-workflow-kappa-one.vercel.app/api/v1

# What can this key see?
curl -s -H "Authorization: Bearer $KEY" $BASE/whoami

# Which projects, and how are they doing?
curl -s -H "Authorization: Bearer $KEY" $BASE/projects

# How much of this project is measured, and on which engine?
curl -s -H "Authorization: Bearer $KEY" $BASE/stats/<project_id>

# Everything currently in the top 10
curl -s -H "Authorization: Bearer $KEY" "$BASE/keywords?position_max=10&limit=100"

# New snapshots since the last sync
curl -s -H "Authorization: Bearer $KEY" "$BASE/rankings?since=2026-10-01T00:00:00Z"
```

## Notes for an agent

- Call `/stats/{project_id}` before drawing conclusions, and quote
  `latest_from_serpapi` alongside anything that compares positions over time.
- Do not treat a null `position` as zero. It means the page did not rank.
- Do not forward-fill missing days. A gap means not measured.
- `top_domains` is the SERP, not our rankings.
- The API cannot write. If asked to add or re-check a keyword, say so — that is
  done in the console.
