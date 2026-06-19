const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  affectedLineIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Line' }],
  affectedStopIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Stop' }],
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

alertSchema.index({ isActive: 1, startsAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
