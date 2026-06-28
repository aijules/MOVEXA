const mongoose = require('mongoose');

const occupancyStatSchema = new mongoose.Schema({
  plate: { type: String, required: true },
  institution: { type: String },
  date: { type: Date },
  standardBoardingPiece: { type: Number, default: 60 },
  passengers: { type: Number, default: 0 },
  occupancyRate: { type: Number, default: 0 },
  occupancyLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CROWDED'], default: 'LOW' },
}, { timestamps: true });

occupancyStatSchema.index({ plate: 1, date: 1 });

module.exports = mongoose.model('OccupancyStat', occupancyStatSchema);
