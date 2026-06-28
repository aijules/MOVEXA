const mongoose = require('mongoose');

const routeStopSchema = new mongoose.Schema({
  stopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stop', required: true },
  sequence: { type: Number, required: true },
  distanceFromStartKm: { type: Number, default: 0 },
}, { _id: false });

const routePatternSchema = new mongoose.Schema({
  routeId: { type: String, required: true, unique: true },
  lineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Line' },
  directionName: { type: String },
  headsign: { type: String },
  stops: [routeStopSchema],
  polyline: {
    type: { type: String, enum: ['LineString'], default: 'LineString' },
    coordinates: { type: [[Number]], default: [] },
  },
  usedFallbackPath: { type: Boolean, default: false },
  distanceKm: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

routePatternSchema.index({ lineId: 1 });
routePatternSchema.index({ 'stops.stopId': 1 });

module.exports = mongoose.model('RoutePattern', routePatternSchema);
