const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const { discoverJobs } = require('../services/jobSources');
const { fetchHtml } = require('../services/urlGuard');
const { toPromptText } = require('../services/html');
const {
  analyzeJobDoc,
  getProfile,
  mapWithConcurrency,
} = require('../services/analysisService');

// How many discovered jobs to score in one call. Gemini rate-limits on volume,
// and past this point the user is scrolling rather than reading.
const SCORING_CAP = 15;
const SCORING_CONCURRENCY = 3;

const asString = (v) => (typeof v === 'string' ? v.trim() : '');

// CREATE (manual)
router.post('/', async (req, res) => {
  try {
    const job = new Job({ ...req.body, source: 'manual' });
    await job.save();
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'CREATE_FAILED' });
  }
});

// DISCOVER — fetch from public job APIs, persist the new ones, score them.
router.post('/discover', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.body?.limit) || 20));
    const profile = await getProfile();
    // Scoring against the hardcoded fallback would show a confident, wrong
    // number, so with no uploaded resume we return the jobs unscored instead.
    const needsProfile = profile.source !== 'resume';

    const { results, sources, stats } = await discoverJobs({ limit, skills: profile.skills });

    const created = [];
    let skipped = 0;
    for (const r of results) {
      try {
        created.push(
          await Job.create({
            source: r.source,
            externalId: r.externalId,
            company: r.company,
            role: r.title,
            description: r.description,
            url: r.url,
            location: r.location,
            tags: r.tags,
            publishedAt: r.publishedAt ? new Date(r.publishedAt) : undefined,
          })
        );
      } catch (err) {
        // E11000 = the partial unique index already has this job. Re-running
        // discover must not duplicate, so a collision is a skip, not a failure.
        if (err.code === 11000) skipped++;
        else throw err;
      }
    }

    const toScore = created.slice(0, SCORING_CAP);
    let scoring = [];
    if (!needsProfile && toScore.length) {
      scoring = await mapWithConcurrency(toScore, SCORING_CONCURRENCY, (job) =>
        analyzeJobDoc(job, { mode: 'quick', profile })
      );
    }

    res.json({
      created: created.length,
      skipped,
      needsProfile,
      scoredSucceeded: scoring.filter((r) => r.ok).length,
      scoredFailed: scoring.filter((r) => !r.ok).length,
      scoringCapped: created.length > toScore.length,
      // A job that failed to score is still returned, so the UI can list it and
      // offer a retry rather than silently dropping it.
      jobs: await Job.find().sort({ createdAt: -1 }).limit(50),
      sources,
      stats,
    });
  } catch (err) {
    console.error('discover failed:', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'DISCOVER_FAILED' });
  }
});

// CREATE from a pasted URL. SSRF-guarded on every redirect hop.
router.post('/from-url', async (req, res) => {
  try {
    const url = asString(req.body?.url);
    if (!url) {
      return res.status(400).json({ error: 'Paste a link to the job posting.', code: 'NO_URL' });
    }

    const html = await fetchHtml(url);
    const text = toPromptText(html);

    // A JS-rendered SPA yields no text server-side. Say so, and point at the
    // paste-a-description path rather than creating a useless empty job.
    if (text.trim().length < 200) {
      return res.status(422).json({
        error:
          'That page did not contain a readable job description (it may be rendered with JavaScript). Paste the description text instead.',
        code: 'NO_TEXT_FOUND',
      });
    }

    const job = await Job.create({
      source: 'url',
      company: asString(req.body.company) || new URL(url).hostname.replace(/^www\./, ''),
      role: asString(req.body.role) || 'Untitled role',
      description: text,
      url,
    });

    let analyzeError = null;
    try {
      await analyzeJobDoc(job);
    } catch (err) {
      // The job is still valid and tracked even if scoring failed.
      analyzeError = { error: err.message, code: err.code || 'ANALYZE_FAILED' };
    }

    res.status(201).json({ job, analyzeError });
  } catch (err) {
    console.error('from-url failed:', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'FROM_URL_FAILED' });
  }
});

// CREATE from pasted description text.
router.post('/from-text', async (req, res) => {
  try {
    const description = asString(req.body?.description);
    if (description.length < 40) {
      return res.status(422).json({
        error: 'Paste the full job description (at least a few sentences).',
        code: 'DESCRIPTION_TOO_SHORT',
      });
    }

    const job = await Job.create({
      source: 'pasted',
      company: asString(req.body.company) || 'Unknown company',
      role: asString(req.body.role) || 'Untitled role',
      description,
      location: asString(req.body.location) || undefined,
    });

    let analyzeError = null;
    try {
      await analyzeJobDoc(job);
    } catch (err) {
      analyzeError = { error: err.message, code: err.code || 'ANALYZE_FAILED' };
    }

    res.status(201).json({ job, analyzeError });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'FROM_TEXT_FAILED' });
  }
});

// RE-ANALYZE jobs against the current profile.
router.post('/analyze-batch', async (req, res) => {
  try {
    const onlyStale = req.body?.onlyStale !== false;
    const profile = await getProfile();
    const jobs = await Job.find().sort({ createdAt: -1 }).limit(50);
    const profileStamp = profile.updatedAt ? new Date(profile.updatedAt).getTime() : 0;

    // Stale means: never scored, or scored against a different version of the
    // profile — which is exactly the case after a resume re-upload.
    const targets = onlyStale
      ? jobs.filter(
          (j) =>
            !j.analyzedAt ||
            !j.analyzedProfileUpdatedAt ||
            j.analyzedProfileUpdatedAt.getTime() !== profileStamp
        )
      : jobs;

    const results = await mapWithConcurrency(targets, SCORING_CONCURRENCY, (job) =>
      analyzeJobDoc(job, { mode: 'quick', profile })
    );

    res.json({
      attempted: targets.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results: results.map((r, i) => ({ ...r, id: String(targets[i]._id) })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'BATCH_FAILED' });
  }
});

// READ all
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ANALYZE one (AI). Delegates to the service so the uploaded profile is used.
router.post('/:id/analyze', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found', code: 'NOT_FOUND' });
    await analyzeJobDoc(job, { mode: req.body?.mode === 'quick' ? 'quick' : 'full' });
    res.json(job);
  } catch (err) {
    console.error('analyze failed:', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'ANALYZE_FAILED' });
  }
});

// READ one
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    // Whitelisted: a blanket findByIdAndUpdate(req.body) would let a client
    // overwrite the analysis, or the source/externalId pair the index uses.
    const allowed = ['company', 'role', 'ctc', 'description', 'status', 'location', 'url'];
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => allowed.includes(k))
    );
    const job = await Job.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'UPDATE_FAILED' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
