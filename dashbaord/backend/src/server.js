import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';

try {
  await connectDatabase();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Movexa Admin API running on http://localhost:${env.port}`);
    console.log(`MongoDB source: ${env.mongoUri}`);
    console.log(`Read-only database mode: ${env.readOnlyDatabase}`);
  });
} catch (error) {
  console.error('Failed to start admin API:', error.message);
  process.exit(1);
}
