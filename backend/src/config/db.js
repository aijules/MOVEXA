const mongoose = require('mongoose');
const { MONGODB_URI } = require('./env');

async function connectDB() {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

module.exports = { connectDB };
