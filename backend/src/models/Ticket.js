const mongoose = require('mongoose');
const crypto = require('crypto');

const fareProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  currency: { type: String, default: 'RWF' },
  validityMinutes: { type: Number, default: 60 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const ticketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fareProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'FareProduct' },
  status: { type: String, enum: ['pending', 'active', 'used', 'expired', 'cancelled'], default: 'active' },
  qrTokenHash: { type: String },
  qrPayload: { type: String },
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  activatedAt: { type: Date },
  paymentMethod: { type: String, default: 'mock' },
  amount: { type: Number },
  currency: { type: String, default: 'RWF' },
}, { timestamps: true });

ticketSchema.pre('save', function (next) {
  if (!this.qrTokenHash) {
    const token = crypto.randomBytes(32).toString('hex');
    this.qrPayload = token;
    this.qrTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  }
  next();
});

ticketSchema.index({ userId: 1, createdAt: -1 });
ticketSchema.index({ status: 1, validUntil: 1 });
ticketSchema.index({ qrTokenHash: 1 }, { unique: true });

const FareProduct = mongoose.model('FareProduct', fareProductSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = { FareProduct, Ticket };
