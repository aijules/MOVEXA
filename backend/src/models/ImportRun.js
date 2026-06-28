const mongoose = require('mongoose');

const importRunSchema = new mongoose.Schema({
  type: { type: String, enum: ['routes-stops', 'route-paths', 'ecofleet', 'schedules', 'all'], required: true },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  stats: {
    routesImported: { type: Number, default: 0 },
    stopsImported: { type: Number, default: 0 },
    pathsImported: { type: Number, default: 0 },
    vehiclesImported: { type: Number, default: 0 },
    tripsGenerated: { type: Number, default: 0 },
    stopTimesGenerated: { type: Number, default: 0 },
  },
  warnings: [{ type: String }],
  importErrors: [{ type: String }],
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('ImportRun', importRunSchema);
