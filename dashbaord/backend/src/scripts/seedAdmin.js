import { env } from '../config/env.js';

console.log('Seed skipped intentionally.');
console.log(`This build is configured to use existing MongoDB data read-only: ${env.mongoUri}`);
console.log('Development login is provided from environment variables without writing to the database.');

