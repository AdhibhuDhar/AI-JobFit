const express = require('express');
const router = express.Router();
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const { generateJson } = require('../services/ai');
const Profile = require('../models/Profile');
const fallbackProfile = require('../profile');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    skills: { type: 'array', items: { type: 'string' } },
    experience: { type: 'string' },
    projects: { type: 'array', items: { type: 'string' } },
    totalExperienceYears: { type: 'number' },
    education: { type: 'array', items: { type: 'string' } },
  },
  required: ['skills'],
};

const asArray = (v) => (Array.isArray(v) ? v : []);
const asString = (v) => (typeof v === 'string' ? v.trim() : '');

/** Extract plain text from an uploaded resume buffer. */
async function extractText(file) {
  const name = file.originalname.toLowerCase();

  if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') {
    // pdf-parse v2 exports a namespace, not a function — the old
    // `await pdfParse(buffer)` call threw "pdfParse is not a function".
    const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      await parser.destroy();
    }
  }

  if (name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || '';
  }

  const err = new Error('Only .pdf and .docx resumes are supported.');
  err.status = 415;
  err.code = 'UNSUPPORTED_TYPE';
  throw err;
}

// GET current profile (Mongo if it exists, else the hardcoded fallback)
router.get('/', async (req, res) => {
  try {
    const profile = await Profile.findOne().sort({ updatedAt: -1 });
    if (profile && asArray(profile.skills).length) {
      return res.json({ ...profile.toObject(), source: 'resume' });
    }
    return res.json({ ...fallbackProfile, source: 'fallback' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPLOAD resume -> extract text -> AI structures it -> save as the profile
router.post('/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
    }

    let rawText = '';
    try {
      rawText = await extractText(req.file);
    } catch (err) {
      if (err.status) throw err;
      const e = new Error(`Could not read that file: ${err.message}`);
      e.status = 422;
      e.code = 'EXTRACTION_FAILED';
      throw e;
    }

    if (!rawText || !rawText.trim()) {
      return res.status(422).json({
        error:
          'No text could be extracted from that file. If it is a scanned image, try a text-based PDF or a .docx.',
        code: 'EMPTY_EXTRACTION',
      });
    }

    const prompt = `
Extract a structured profile from this resume text. Return ONLY valid JSON, no prose, no markdown fences.

Resume text:
"""
${rawText.slice(0, 12000)}
"""

Return JSON in exactly this shape:
{
  "skills": [<string>],
  "experience": <string, 1-3 sentence summary of their background>,
  "projects": [<string>],
  "totalExperienceYears": <number or null>,
  "education": [<string>]
}
`;

    const extracted = await generateJson({
      prompt,
      schema: PROFILE_SCHEMA,
      validate: (parsed) => {
        if (!parsed || !asArray(parsed.skills).length) {
          const e = new Error('The AI could not find any skills in that resume.');
          e.status = 502;
          e.code = 'AI_BAD_SHAPE';
          throw e;
        }
      },
    });

    const profile = {
      skills: asArray(extracted.skills).map(asString).filter(Boolean).slice(0, 40),
      experience: asString(extracted.experience),
      projects: asArray(extracted.projects).map(asString).filter(Boolean).slice(0, 20),
      totalExperienceYears: Number.isFinite(Number(extracted.totalExperienceYears))
        ? Number(extracted.totalExperienceYears)
        : undefined,
      education: asArray(extracted.education).map(asString).filter(Boolean).slice(0, 10),
      rawText: rawText.slice(0, 20000),
      resumeFileName: req.file.originalname,
      source: 'resume',
    };

    // Upsert: replace the single profile document with this new one
    await Profile.deleteMany({});
    const saved = new Profile(profile);
    await saved.save();

    res.json(saved);
  } catch (err) {
    console.error('Resume upload failed:', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'UPLOAD_FAILED' });
  }
});

// Re-score every job against the current profile. This is the payoff of storing
// analyzedProfileUpdatedAt: after a new resume, stale cards are known exactly.
router.post('/analyze-all', async (req, res) => {
  try {
    const Job = require('../models/Job');
    const { analyzeJobDoc, getProfile, mapWithConcurrency } = require('../services/analysisService');

    const profile = await getProfile();
    const onlyStale = req.body?.onlyStale !== false;
    const jobs = await Job.find().sort({ createdAt: -1 }).limit(50);

    const targets = onlyStale
      ? jobs.filter((j) => !j.analyzedAt || !j.analyzedProfileUpdatedAt)
      : jobs;

    const results = await mapWithConcurrency(targets, 3, (job) => analyzeJobDoc(job, { mode: 'quick', profile }));

    res.json({
      attempted: targets.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    console.error('analyze-all failed:', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'ANALYZE_ALL_FAILED' });
  }
});

module.exports = router;