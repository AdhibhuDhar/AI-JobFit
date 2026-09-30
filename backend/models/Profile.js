const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  skills: [String],
  experience: String,
  projects: [String],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Profile', profileSchema);