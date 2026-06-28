const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  tripCode: { type: String, required: true, unique: true },
  lineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Line', required: true },
  routePatternId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoutePattern', required: true },
  headsign: { type: String },
  direction: { type: Number, enum: [0, 1], default: 0 },
  scheduledStartTime: { type: String, required: true },
  scheduledEndTime: { type: String },
  serviceDate: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

tripSchema.index({ lineId: 1, scheduledStartTime: 1 });
tripSchema.index({ routePatternId: 1 });
tripSchema.index({ serviceDate: 1 });

module.exports = mongoose.model('Trip', tripSchema);
