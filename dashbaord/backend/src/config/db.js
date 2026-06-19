import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', false);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 5000
  });
  return mongoose.connection;
}

export function getDb() {
  return mongoose.connection.db;
}

