const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['bug', 'route_issue', 'ticket_issue', 'suggestion', 'general'], default: 'general' },
  message: { type: String, required: true },
  status: { type: String, enum: ['open', 'reviewing', 'resolved'], default: 'open' },
  email: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
