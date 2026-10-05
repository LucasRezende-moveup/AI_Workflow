# Moveup Media Rank Tracking API — agent guide

You are reading this because you have been given a key to this API. It serves
rank-tracking data: which keywords we track, where they rank, and how that has
moved.

```
Base URL   https://ai-workflow-kappa-one.vercel.app/api/v1
Auth       Authorization: Bearer mu_live_…      (or  X-API-Key: mu_live_…)
Methods    GET only. Everything else returns 405.
```

Start with `GET /api/v1/whoami`. It tells you which projects your key can read.
If you call a project outside that scope you get `403 project_not_in_scope`;
that is a fact about the key, not a transient error, so do not retry it.

---

## Five things that will make you state something false

Read these before you report a number. Each one has caused a wrong answer.

### 1. `position: null` means NOT RANKING. It is never 0.

The page did not appear anywhere in the tracked depth of that SERP.

- **Do not** average it as 0 — it drags every mean toward "excellent".
- **Do not** sort ascending without excluding it — nulls are the *worst* result
  and will surface as the best.
- **Do** count them separately: `/stats/{project_id}` gives `ranking` and
  `not_ranking` already split.

Correct phrasing: *"42 of 180 keywords rank; average position 14.2 across those
42. The other 138 do not appear in the top results at all."*

### 2. A missing day means NOT MEASURED. Never forward-fill silently.

The daily sweep records nothing rather than guessing when the SERP source is
unavailable, so gaps in `history` are real gaps. If you interpolate to draw a
trend, say that you did, in the same sentence as the trend.

### 3. `source: null` marks data from a different instrument.

Snapshots written before the DataForSEO migration have `source: null` and came
from SerpAPI. The two providers sample Google differently — most keywords move a
place or two across that boundary — so **a position change spanning it is a
change of measurement, not of ranking.**

`GET /stats/{project_id}` returns `latest_from_serpapi`: how many keywords'
newest snapshot is still on the old side. If that number is above zero, say so
when comparing positions over time.

### 4. `top_domains` is the SERP, not us.

It is the top ten domains on that search result page, stored even when our own
target was nowhere in it. Reading it as "our rankings" inverts the meaning
entirely. Our position is the `position` field; `top_domains` is who we are
competing with.

### 5. `fs_present: null` is not `false`.

Null means the row predates featured-snippet detection, so we do not know. False
means we checked and there was no snippet. Do not merge them.

---

## Which endpoint answers which question

| If asked… | Call |
|---|---|
| "what can you see?" | `GET /whoami` |
| "how is <domain> doing?" | `GET /stats/{project_id}` first, then `/projects` for context |
| "which keywords rank well / badly?" | `GET /keywords?project_id=…&position_max=10` or `&ranking=false` |
| "how has <keyword> moved?" | `GET /keywords?q=<text>` to find the id, then `GET /keywords/{id}` |
| "what changed recently?" | `GET /alerts?project_id=…` |
| "give me everything since <date>" | `GET /rankings?since=<ISO>` and page forward |
| "who are the competitors?" | `GET /keywords/{id}` and read `top_domains` across history |

**Always call `/stats/{project_id}` before characterising a project.** It is the
endpoint that tells you how much of the rest to trust: coverage today, the
ranking/not-ranking split, and how much of the data is still pre-migration.

---

## Endpoints

All parameters are optional unless marked required.

**`GET /`** — endpoint map. No key needed; use it to check the service is up
before debugging auth.

**`GET /whoami`** — `key{id,name,prefix}`, `created_by`, `scope`,
`project_ids`, `read_only`, `requests_served`.

**`GET /projects`** — per project: `id`, `name`, `domain`, `location`,
`keywords`, `ranking`, `avg_position`, `top3`, `top10`, `visibility_pct`,
`last_checked`, `created_at`.

**`GET /keywords`** — `project_id`, `q` (substring), `position_max`,
`ranking` (bool), `updated_since` (ISO), `limit` (100, max 500), `offset`.
Returns `{total, limit, offset, rows[]}` ordered **best position first**, nulls
last. Row: `id`, `keyword`, `target_url`, `location`, `project_id`, `domain`,
`position`, `ranking_url`, `fs_holder_domain`, `fs_present`, `top_domains`,
`source`, `checked_at`, `created_at`.

**`GET /keywords/{tracking_id}`** — required path id; `history_days` (90, max
365). Returns `{keyword, history[], history_days}`; history is **oldest first**
and adds `cost`.

**`GET /rankings`** — `project_id`, `since` (ISO), `limit` (200, max 1000),
`offset`. Returns rows **oldest first** — the sync endpoint.

**`GET /stats/{project_id}`** — required path id. Returns `keywords`,
`ranking`, `not_ranking`, `top3`, `top10`, `avg_position`, `visibility_pct`,
`checked_today`, `coverage_today_pct`, `latest_from_serpapi`, `last_checked`,
`note`.

**`GET /alerts`** — `project_id`, `limit` (100, max 500). Newest first.
`alert_type` ∈ `position_drop`, `position_gain`, `started_ranking`,
`lost_ranking`, `fs_changed`. `severity` ∈ `critical`, `warning`, `info`.

---

## Paging and sync

`limit` caps at 500 (1000 on `/rankings`). Page with `offset` until you have
`total` rows.

For repeated pulls, store the newest `checked_at` you have seen and pass it as
`since` (on `/rankings`) or `updated_since` (on `/keywords`). Re-reading the
whole corpus to find a handful of new rows is the common mistake here;
`/rankings` is ordered oldest-first precisely so you can walk forward from a
high-water mark.

---

## Errors

| Status | What it means | What to do |
|---|---|---|
| `401` | Missing, malformed, unknown or revoked key. Deliberately indistinguishable. | Stop. Ask for a valid key. Do not retry or guess. |
| `403 project_not_in_scope` | Real project, outside this key's scope. | Stop. Report the limit; do not try other ids. |
| `404 not_found` | No such row or endpoint. | Check the id came from a previous response. |
| `405 read_only` | You used a non-GET method. | The API cannot write. See below. |
| `503` | Database or key store unavailable. | Transient. Retry once after a short pause. |

## You cannot write anything

The API is read-only and enforces it before authentication. If asked to add a
keyword, re-run a check, change a target URL or acknowledge an alert, **say that
plainly** — those are done in the console at
`https://ai-workflow-kappa-one.vercel.app`, not through this API. Do not
construct a POST and report success.

## Quoting data back

- Use `keyword` text and `domain` when writing for a person; `id` is a UUID and
  means nothing to them. Keep the id only to make further calls.
- Give `checked_at` whenever you quote a position. The data is at most daily,
  and a position without its date invites someone to treat a week-old number as
  live.
- When you rank or average anything, state how many rows were excluded for
  having no position.
