// The single analysis pipeline.
//
// Both per-job analyze and bulk scoring call this. Critically it reads the
// profile from Mongo (Profile.findOne) and falls back to profile.js only when
// none exists. The old code did the opposite — jobRoutes.js did a static
// `require('../profile')`, so an uploaded resume was never used for scoring.
const { generateJson } = require('./ai');
const resources = require('../resources');
const Profile = require('../models/Profile');
const fallbackProfile = require('../profile');

// Every topic the model is allowed to return. Anything else is resolved to
// 'dbms' below rather than rendering an undefined resourceLabel.
const TOPICS = Object.keys(resources);

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    matchScore: { type: 'integer' },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'string' },
          topic: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['topic', 'why'],
      },
    },
    preparationPlan: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, topic: { type: 'string' } },
              required: ['text', 'topic'],
            },
          },
        },
        required: ['day', 'tasks'],
      },
    },
  },
  required: ['matchScore', 'strengths', 'weaknesses', 'suggestions', 'preparationPlan'],
};

const asArray = (v) => (Array.isArray(v) ? v : []);
const asString = (v) => (typeof v === 'string' ? v.trim() : '');

/** Mongo profile if one was uploaded, else the hardcoded fallback. */
async function getProfile() {
  try {
    const doc = await Profile.findOne().sort({ updatedAt: -1 });
    if (doc && asArray(doc.skills).length) {
      return { ...doc.toObject(), _id: doc._id, source: 'resume' };
    }
  } catch (err) {
    // A DB hiccup must not silently fall back to the wrong profile — a
    // confident wrong score is worse than a visible error.
    const e = new Error(`Could not read your profile: ${err.message}`);
    e.status = 503;
    e.code = 'PROFILE_READ_FAILED';
    throw e;
  }
  return { ...fallbackProfile, source: 'fallback' };
}

function describeProfile(profile) {
  const parts = [`Skills: ${asArray(profile.skills).join(', ') || '(none found)'}`];
  const years = Number(profile.totalExperienceYears);
  if (Number.isFinite(years) && years > 0) parts.push(`Experience: ${years} year(s)`);
  if (asString(profile.experience)) parts.push(`Background: ${asString(profile.experience)}`);
  const projects = asArray(profile.projects).slice(0, 6);
  if (projects.length) parts.push(`Projects: ${projects.join('; ')}`);
  const edu = asArray(profile.education).slice(0, 4);
  if (edu.length) parts.push(`Education: ${edu.join('; ')}`);
  return parts.join('\n');
}

/**
 * @param {'quick'|'full'} mode  quick = bulk scoring (shorter prompt, fewer items)
 */
function buildPrompt(profile, job, mode = 'full') {
  const quick = mode === 'quick';
  const maxDesc = quick ? 2500 : 6000;
  const days = quick ? 3 : 7;
  const maxTasks = quick ? 3 : 4;

  return `You are a technical recruiter comparing a candidate to a job posting.

CANDIDATE
${describeProfile(profile)}

JOB
Title: ${asString(job.role) || asString(job.title) || 'Untitled'}
Company: ${asString(job.company) || 'Unknown'}
Description:
"""
${asString(job.description).slice(0, maxDesc)}
"""

Score how well the candidate fits, being honest rather than generous.

Rules:
- matchScore is an integer 0-100.
- weaknesses must list concrete skills the posting asks for that the candidate lacks.
- Every "topic" value MUST be exactly one of these keys:
${TOPICS.join(', ')}
- preparationPlan has ${days} days; each day has at most ${maxTasks} tasks.
- Each task's topic is a study topic chosen to close a listed weakness.

Return JSON only, no prose, no markdown fences.`;
}

/** Attach real study links + named problems, and clamp anything untrustworthy. */
function normalizeAnalysis(raw) {
  const score = Number(raw.matchScore);
  const resolve = (topic) => {
    const key = resources.resolveTopic(topic);
    return { topic: key, label: resources[key].label, url: resources[key].url };
  };

  const plan = asArray(raw.preparationPlan).map((day, i) => {
    const tasks = asArray(day && day.tasks).slice(0, 4).map((task) => {
      const { topic, label, url } = resolve(asString(task && task.topic));
      return {
        text: asString(task && task.text),
        topic,
        resourceLabel: label,
        resourceUrl: url,
        problems: asArray(resources[topic].problems).slice(0, 3),
      };
    });
    return { day: Number.isFinite(Number(day && day.day)) ? Number(day.day) : i + 1, tasks };
  });

  return {
    matchScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    strengths: asArray(raw.strengths).map(asString).filter(Boolean).slice(0, 10),
    weaknesses: asArray(raw.weaknesses).map(asString).filter(Boolean).slice(0, 10),
    suggestions: asArray(raw.suggestions)
      .map((s) => {
        const { topic, label, url } = resolve(asString(s && s.topic));
        return {
          priority: asString(s && s.priority) || 'medium',
          topic,
          why: asString(s && s.why),
          resourceLabel: label,
          resourceUrl: url,
        };
      })
      .filter((s) => s.why)
      .slice(0, 8),
    preparationPlan: plan,
  };
}

/**
 * Reject hollow responses.
 *
 * This is the direct fix for the 8 jobs sitting in the live DB with empty arrays
 * and no matchScore: a failure must raise, never persist a shell that looks
 * like a success.
 */
function assertUsable(analysis) {
  if (!analysis.matchScore && !analysis.strengths.length && !analysis.weaknesses.length) {
    const e = new Error('The AI returned an empty analysis. Try again.');
    e.status = 502;
    e.code = 'AI_EMPTY_ANALYSIS';
    throw e;
  }
  if (!analysis.preparationPlan.length) {
    const e = new Error('The AI returned no preparation plan. Try again.');
    e.status = 502;
    e.code = 'AI_NO_PLAN';
    throw e;
  }
  return analysis;
}

/**
 * Analyze one job document against the profile, then save.
 * Throws a real status rather than saving a hollow analysis.
 */
async function analyzeJobDoc(job, { mode = 'full', profile } = {}) {
  const p = profile || (await getProfile());

  if (asString(job.description).trim().length < 40) {
    const e = new Error('That job description is too short to analyze. Paste the full posting.');
    e.status = 422;
    e.code = 'DESCRIPTION_TOO_SHORT';
    throw e;
  }

  const raw = await generateJson({
    prompt: buildPrompt(p, job, mode),
    schema: ANALYSIS_SCHEMA,
    thinkingLevel: mode === 'quick' ? 'low' : undefined,
  });

  job.analysis = assertUsable(normalizeAnalysis(raw));
  job.analyzedAt = new Date();
  job.analyzedProfileUpdatedAt = p.updatedAt ? new Date(p.updatedAt) : null;
  await job.save();
  return job;
}

/** Map with bounded concurrency — Gemini rate-limits if you fire 15 at once. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (err) {
        // One failure must not sink the batch: the job stays tracked, just unscored.
        results[i] = { ok: false, error: err.message, code: err.code || 'ANALYZE_FAILED' };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

module.exports = {
  getProfile,
  buildPrompt,
  normalizeAnalysis,
  analyzeJobDoc,
  mapWithConcurrency,
  TOPICS,
  ANALYSIS_SCHEMA,
};
