const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  plate: { type: String, required: true, unique: true },
  institution: { type: String },
  mode: { type: String, enum: ['bus', 'tram', 'metro', 'rail'], default: 'bus' },
  capacity: { type: Number, default: 60 },
  isActive: { type: Boolean, default: true },
  currentTripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
  currentRoutePatternId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoutePattern' },
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [30.0619, -1.9441] },
  },
  bearing: { type: Number, default: 0 },
  speedKph: { type: Number, default: 0 },
  delaySeconds: { type: Number, default: 0 },
  occupancy: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CROWDED', 'UNKNOWN'], default: 'UNKNOWN' },
  lastSeenAt: { type: Date },
}, { timestamps: true });

vehicleSchema.index({ currentLocation: '2dsphere' });

module.exports = mongoose.model('Vehicle', vehicleSchema);
