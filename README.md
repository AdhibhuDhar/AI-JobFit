# AI JobFit

A MEAN-stack job-fit analyzer. Upload a resume, discover real openings, and get a
match score, the gaps in your profile, and a preparation plan with concrete
LeetCode problems to work on.

## Stack

| Layer | Tech |
|---|---|
| Database | MongoDB (Mongoose) |
| Server | Express 5, CommonJS, Node 24 |
| Client | Angular 22 (standalone components, signals, router) |
| AI | Google Gemini (`gemini-3.6-flash`) via `@google/genai` |

No UI framework and no build-tooling changes — plain component CSS driven by a
small set of custom properties in `frontend/src/styles.css`.

## Running it

MongoDB must be running. Then two terminals:

```bash
cd backend  && npm install && npm run dev   # http://localhost:5000
cd frontend && npm install && npx ng serve  # http://localhost:4200
```

Open <http://localhost:4200>. It redirects to `/profile`, which is where you
upload a resume.

### The backend port

The client reads its API origin at runtime, in this order:

1. `window.__API_BASE__` (settable in `index.html`, no rebuild needed)
2. `localStorage['apiBase']`
3. `http://localhost:5000/api` (the default, from `src/environments/environment.ts`)

So if something else already holds port 5000, start the backend on another port
and retarget the client from the browser console:

```js
localStorage.setItem('apiBase', 'http://localhost:5050/api'); location.reload();
```

## The flow

1. **Upload a resume** (PDF or .docx, ≤ 5 MB). Text is extracted
   (`pdf-parse` v2 / `mammoth`), sent to Gemini, and stored as a `Profile`
   document — skills, experience, projects, education.
2. **Find openings** — `POST /api/jobs/discover` pulls from Arbeitnow and
   Remotive, keeps the software roles, ranks them against your skills, and
   de-duplicates on `{source, externalId}` so re-running never doubles up.
   Scoring is capped at 15 jobs, 3 at a time.
3. **Or paste a posting** — a URL (fetched server-side, SSRF-guarded) or the raw
   description text.
4. **Analyze** — the score, strengths, gaps, suggestions, and a day-by-day prep
   plan. Each task resolves to a study link plus 2–3 named LeetCode problems
   from `backend/resources.js`, so links are always valid — the model picks a
   topic, never a URL.

Every score is stamped with the profile version it was computed from, so
replacing your resume marks the old scores stale and `/analyze-batch` refreshes
exactly those.

## Layout

```
backend/
  server.js                     mounts /api/jobs and /api/profile, /api/health
  profile.js                    hardcoded fallback profile (display only)
  resources.js                  32 topics -> study link + named LeetCode problems
  models/Job.js                 + source/externalId, unique index, analysis stamp
  routes/jobRoutes.js           discover / from-url / from-text / analyze-batch
  routes/profileRoutes.js       resume upload + parse
  services/ai.js                Gemini client, retry-with-backoff, output validation
  services/analysisService.js   the single analysis pipeline (reads Profile from Mongo)
  services/jobSources.js        Arbeitnow + Remotive, relevance ranking
  services/urlGuard.js          SSRF guard (private-IP + DNS + per-hop redirects)
  services/html.js              HTML -> prompt text

frontend/src/app/
  job.ts                        JobService + the app's types
  app.ts / app.html             shell: nav, health badge, router-outlet
  profile-view/                 resume upload, extracted skills, re-score
  discover-view/                search job boards / paste a posting
  jobs-view/                    scores, gaps, suggestions, prep plan
  job-form/ job-list/ profile-upload/    superseded, unreferenced, safe to delete
```

## Deploying to Vercel

The repo is configured for a single Vercel project serving both halves:
`vercel.json` builds the Angular app to static output and rewrites `/api/*` to
the serverless function at `backend/api/index.js`.

```bash
npm i -g vercel
vercel            # from the repo root
```

Set these as environment variables in the Vercel dashboard (or `vercel env add`):

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | **yes** | MongoDB Atlas SRV string. The app will not work without it. |
| `GEMINI_API_KEY` | **yes** | Resume parsing and all analysis fail without it. |
| `CORS_ORIGIN` | no | Comma-separated allowed origins. Omit locally to reflect any origin. |
| `PORT` | no | Set by Vercel. Leave unset. |

`PORT` and `NODE_ENV` are supplied by the platform. `backend/.env` is gitignored
and never deployed — every secret must be added to the dashboard.

### Things that change when deployed

- **The API base becomes relative.** `environment.prod.ts` (swapped in by
  `fileReplacements`) sets `apiBase: '/api'` so calls are same-origin. The dev
  build keeps `http://localhost:5000/api`.
- **`app.listen()` does not run.** `server.js` only starts a listener when it is
  the entry module (`require.main === module`); Vercel imports it and calls it
  as a handler. Mongo connects lazily on the first `/api` request, cached on
  `globalThis` so warm invocations reuse one pool instead of reconnecting.
- **Cold starts are real.** The first request pays for the connection, and each
  function has a time limit (`maxDuration: 60`). A first load may be slow.

### Known deployment limits

- **No authentication.** Single-profile, single-user by design. Do not expose
  it publicly as-is.
- **Resume uploads are 5 MB**, in memory, per invocation — fine at this scale,
  not for real traffic.
- **Scoring is rate-limited by Gemini**, not by Vercel. Bulk `/analyze-batch`
  over many jobs can exceed the function timeout; the cap and per-job error
  handling keep it from failing wholesale.
- **Vercel's Hobby plan caps serverless duration**, so long discovery-plus-scoring
  runs may be cut off. The 15-job scoring cap exists partly for this.

## Notes and limitations

- **Gemini rate-limits.** `services/ai.js` retries with backoff on 429/503;
  sustained exhaustion surfaces as a real error rather than an empty analysis.
  Scoring a lot of jobs at once will hit the quota — the cap exists for that.
- **A failed score is a visible failure.** Empty analyses used to be persisted
  as hollow shells that looked successful. `assertUsable()` rejects them now, so
  a card with no score says so.
- **SSRF.** `urlGuard.js` resolves the host and rejects private, loopback,
  link-local, CGNAT, and IPv6-mapped addresses, re-checking on every redirect
  hop. Residual DNS-rebinding risk is inherent to resolve-then-fetch — this is a
  guard, not a proof.
- **JS-rendered pages yield no text** to a server-side fetch. `from-url` says so
  and points at the paste-description path instead of creating an empty job.
- **No authentication.** Single-profile, single-user, local-dev scope. Do not
  expose it publicly as-is.
