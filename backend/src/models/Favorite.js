const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['stop', 'line', 'journey'], required: true },
  stopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stop' },
  lineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Line' },
  journeySnapshot: { type: Object },
  label: { type: String },
}, { timestamps: true });

favoriteSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model('Favorite', favoriteSchema);
