import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: String,
  email: { type: String, lowercase: true, index: true, unique: true },
  passwordHash: String,
  role: String,
  status: { type: String, default: 'active' },
  lastLoginAt: Date
}, { timestamps: true, strict: false });

export const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', schema);

