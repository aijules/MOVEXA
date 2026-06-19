const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  normalizedName: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  modes: { type: [String], default: ['bus'] },
  zone: { type: String, default: 'A' },
  isAccessible: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

stopSchema.index({ location: '2dsphere' });
stopSchema.index({ normalizedName: 'text' });

module.exports = mongoose.model('Stop', stopSchema);
