// Job discovery from free, public job-board APIs.
//
// Both sources are keyless and legal to read. Verified shapes and quirks:
//  - Remotive   https://remotive.com/api/remote-jobs
//               `?limit=` and `?category=` are IGNORED — always exactly 16 jobs,
//               and only ~11 of those are software roles. Treated as a small
//               remote supplement, not a volume source.
//  - Arbeitnow  https://www.arbeitnow.com/api/job-board-api?page=N
//               326 jobs on page 1, 325 on page 2. ~2.8MB per page. This is
//               the volume source. `url` is a real posting link (325/326).

const { toPromptText } = require('./html');

const UA = 'Mozilla/5.0 (compatible; AIJobFit/1.0)';
const FETCH_TIMEOUT_MS = 12000;
const MAX_DESC_CHARS = 6000;

// Software-ish roles we care about. Without this the Discover view is full of
// "Content Reviewer" and sales roles and looks broken.
const RELEVANCE_RE =
  /software|engineer|developer|programmer|full[ -]?stack|backend|back[ -]?end|frontend|front[ -]?end|web dev|react|angular|node(\.js)?|java|python|c\+\+|golang|rust|devops|sre|cloud|data (engineer|scientist|engineer)|machine learning|ml |ai |mongodb|sql|api|qa|test|dev\b/i;

async function fetchJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function clip(str, max = MAX_DESC_CHARS) {
  const s = String(str || '');
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function normalize(raw, source) {
  return {
    source,
    externalId: raw.externalId,
    title: clip(raw.title, 200) || 'Untitled role',
    company: clip(raw.company, 120) || 'Unknown company',
    description: clip(raw.description),
    url: raw.url || '',
    location: clip(raw.location, 120) || '',
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 12).map((t) => String(t).slice(0, 60)) : [],
    publishedAt: raw.publishedAt || null,
  };
}

async function fetchRemotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs');
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j) =>
    normalize(
      {
        externalId: String(j.id ?? j.url ?? j.title),
        title: j.title,
        company: j.company_name,
        description: toPromptText(j.description),
        url: j.url,
        location: j.candidate_required_location || j.job_type || '',
        tags: j.tags,
        publishedAt: j.publication_date || null,
      },
      'remotive'
    )
  );
}

async function fetchArbeitnow(page = 1) {
  const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
  const jobs = Array.isArray(data?.data) ? data.data : [];
  return jobs.map((j) =>
    normalize(
      {
        externalId: String(j.slug ?? j.url ?? j.title),
        title: j.title,
        company: j.company_name,
        description: toPromptText(j.description),
        url: j.url,
        location: j.location || (j.remote ? 'Remote' : ''),
        tags: j.tags,
        publishedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
      },
      'arbeitnow'
    )
  );
}

function isRelevant(job) {
  return RELEVANCE_RE.test(`${job.title} ${job.tags.join(' ')}`);
}

/** Crude overlap score used only to RANK candidates, never shown as a match % . */
function heuristicScore(job, skills) {
  if (!skills || !skills.length) return 0;
  const haystack = `${job.title} ${job.tags.join(' ')} ${job.description}`.toLowerCase();
  let hits = 0;
  for (const skill of skills) {
    const s = String(skill).toLowerCase().trim();
    if (s.length > 2 && haystack.includes(s)) hits++;
  }
  return Math.min(100, Math.round((hits / Math.max(3, skills.length)) * 100));
}

/**
 * Fetch both sources, filter to relevant roles, rank against the candidate's
 * skills, and return at most `limit` candidates.
 *
 * One dead source never fails the whole call: results are allSettled and the
 * per-source status is returned so the UI can show a degraded-mode banner.
 *
 * @param {{limit?: number, skills?: string[], sources?: string[]}} opts
 */
async function discoverJobs({ limit = 20, skills = [], sources = ['remotive', 'arbeitnow'] } = {}) {
  const started = Date.now();

  const wanted = {
    remotive: async () => {
      const jobs = await fetchRemotive();
      return { jobs, fetched: jobs.length };
    },
    arbeitnow: async () => {
      const first = await fetchArbeitnow(1);
      // Only pull a second page if page 1 alone cannot fill the request.
      if (first.length < limit) return { jobs: first, fetched: first.length };
      const second = await fetchArbeitnow(2);
      return { jobs: first.concat(second), fetched: first.length + second.length };
    },
  };

  const entries = await Promise.allSettled(
    sources.filter((s) => wanted[s]).map(async (s) => [s, await wanted[s]()])
  );

  const status = {};
  let all = [];
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      const [name, { jobs, fetched }] = entry.value;
      status[name] = { ok: true, fetched, kept: 0 };
      all = all.concat(jobs);
    } else {
      const idx = entries.findIndex((e) => e === entry);
      const name = sources.filter((s) => wanted[s])[idx];
      status[name] = { ok: false, error: entry.reason?.message || 'Source unavailable', fetched: 0, kept: 0 };
    }
  }

  // Dedupe across sources on identity, then relevance-filter.
  const seen = new Set();
  let unique = all.filter((j) => {
    const key = `${j.source}:${j.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const relevant = unique.filter(isRelevant);
  // If filtering leaves too little to be useful, fall back to unfiltered.
  const pool = relevant.length >= 5 ? relevant : unique;
  status.kept = Object.fromEntries(Object.entries(status).map(([k, v]) => [k, { ...v, kept: pool.filter((j) => j.source === k).length }]));

  pool.sort((a, b) => heuristicScore(b, skills) - heuristicScore(a, skills));

  return {
    results: pool.slice(0, limit).map((j) => ({ ...j, heuristicScore: heuristicScore(j, skills) })),
    sources: status,
    stats: {
      fetched: all.length,
      unique: unique.length,
      relevant: relevant.length,
      totalAvailable: unique.length,
      tookMs: Date.now() - started,
    },
  };
}

module.exports = { discoverJobs, fetchRemotive, fetchArbeitnow, isRelevant, heuristicScore, stripForPrompt: toPromptText };
