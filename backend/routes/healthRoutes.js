const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Mongo readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting
router.get('/', (req, res) => {
  res.json({
    ok: mongoose.connection.readyState === 1,
    mongo: mongoose.connection.readyState,
    geminiKey: Boolean(process.env.GEMINI_API_KEY),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

module.exports = router;
