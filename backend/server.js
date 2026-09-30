require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// CORS: allow the deployed Angular origin when one is configured, otherwise
// reflect any origin (local development, where the client runs on :4200).
const allowed = process.env.CORS_ORIGIN;
app.use(cors({ origin: allowed ? allowed.split(',').map((s) => s.trim()) : true }));
// Default is 100kb, which 413s on bulk payloads (a 200kb body was measured
// failing). Discovery/track bodies carry multiple job descriptions.
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * Connect once per container and reuse.
 *
 * On Vercel the module is re-evaluated per cold start but kept warm across
 * invocations, so a module-scoped promise both avoids a connect-per-request and
 * stops concurrent invocations from racing to open several pools. The cache is
 * deliberately kept on `globalThis`: bundlers may evaluate this module more than
 * once, and a plain `let` would then hand out a second connection.
 */
function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    // Fail loudly at request time rather than hanging on a 30s driver timeout.
    return Promise.reject(
      Object.assign(new Error('MONGO_URI is not set.'), { status: 503, code: 'NO_MONGO_URI' })
    );
  }

  if (!globalThis.__mongoConnectPromise) {
    globalThis.__mongoConnectPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000 })
      .then((m) => {
        console.log('MongoDB connected');
        return m;
      })
      .catch((err) => {
        // Clear the cache so the next request retries instead of replaying
        // this rejection forever.
        globalThis.__mongoConnectPromise = null;
        throw err;
      });
  }
  return globalThis.__mongoConnectPromise;
}

/** Wait for Mongo before handling any /api request. */
app.use('/api', async (req, res, next) => {
  try {
    await connectMongo();
    next();
  } catch (err) {
    res.status(err.status || 503).json({
      error: `Database unavailable: ${err.message}`,
      code: err.code || 'MONGO_UNAVAILABLE',
    });
  }
});

app.use('/api/health', require('./routes/healthRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes'));
// This mount was missing entirely, so the resume-upload endpoint did not exist.
app.use('/api/profile', require('./routes/profileRoutes'));

// Multer raises LIMIT_FILE_SIZE outside the route handler, so without this the
// client gets Express's default HTML error page instead of JSON it can display.
app.use((err, req, res, next) => {
  if (err) {
    const isSize = err.code === 'LIMIT_FILE_SIZE';
    return res.status(isSize ? 413 : err.status || 500).json({
      error: isSize
        ? 'That file is too large. The limit is 5 MB.'
        : err.message || 'Unexpected server error',
      code: isSize ? 'FILE_TOO_LARGE' : err.code || 'SERVER_ERROR',
    });
  }
  next();
});

// Serverless hosts (Vercel) import this module and want the app itself.
// Locally there is nothing listening yet, so start a server.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectMongo().catch((err) => console.error('MongoDB error:', err.message));
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
