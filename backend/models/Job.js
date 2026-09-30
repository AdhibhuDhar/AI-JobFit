const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  // Manually-tracked jobs default to source 'manual' and have no externalId;
  // discovered jobs carry both, so the unique index below can de-duplicate a
  // re-run of discover without ever colliding two manual jobs.
  source: { type: String, default: 'manual', index: true },
  externalId: { type: String, index: true },
  company: { type: String, required: true },
  role: { type: String, required: true },
  ctc: { type: String },
  description: { type: String, required: true },
  url: { type: String },
  location: { type: String },
  tags: [String],
  publishedAt: { type: Date },
  status: { type: String, default: 'applied' },
  createdAt: { type: Date, default: Date.now },
  analysis: {
    matchScore: Number,
    strengths: [String],
    weaknesses: [String],
    suggestions: [{
      priority: String,
      topic: String,
      why: String,
      resourceLabel: String,
      resourceUrl: String,
    }],
    preparationPlan: [{
      day: Number,
      tasks: [{
        text: String,
        topic: String,
        resourceLabel: String,
        resourceUrl: String,
        problems: [{ title: String, difficulty: String, url: String }],
      }],
    }],
  },
  // When this analysis ran, and against WHICH version of the profile. A new
  // resume changes the answers, so this pair is what lets the UI tell the user
  // that a card on screen was scored against a resume they have since replaced.
  analyzedAt: { type: Date },
  analyzedProfileUpdatedAt: { type: Date },
});

// Partial (not sparse) on externalId: a sparse index would still try to index the
// missing field, and requiring externalId to be a string keeps every manual job
// out of the constraint entirely.
jobSchema.index(
  { source: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalId: { $type: 'string' } },
    name: 'source_externalId_unique',
  }
);

module.exports = mongoose.model('Job', jobSchema);
