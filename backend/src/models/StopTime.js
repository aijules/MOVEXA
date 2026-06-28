const mongoose = require('mongoose');

const stopTimeSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  stopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stop', required: true },
  stopSequence: { type: Number, required: true },
  arrivalTime: { type: String, required: true },
  departureTime: { type: String, required: true },
  distanceFromStartKm: { type: Number, default: 0 },
  pickupType: { type: String, enum: ['regular', 'none'], default: 'regular' },
  dropoffType: { type: String, enum: ['regular', 'none'], default: 'regular' },
}, { timestamps: false });

stopTimeSchema.index({ tripId: 1, stopSequence: 1 });
stopTimeSchema.index({ stopId: 1, departureTime: 1 });

module.exports = mongoose.model('StopTime', stopTimeSchema);
