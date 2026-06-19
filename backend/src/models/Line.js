const mongoose = require('mongoose');

const lineSchema = new mongoose.Schema({
  shortName: { type: String, required: true, unique: true },
  longName: { type: String },
  mode: { type: String, enum: ['bus', 'tram', 'metro', 'rail', 'trolleybus'], default: 'bus' },
  color: { type: String, default: '#0EA5A3' },
  textColor: { type: String, default: '#FFFFFF' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Line', lineSchema);
