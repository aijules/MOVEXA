import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/movexa',
  jwtSecret: process.env.JWT_SECRET || 'dev_movexa_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminSeedName: process.env.ADMIN_SEED_NAME || 'System Admin',
  adminSeedEmail: process.env.ADMIN_SEED_EMAIL || 'admin@example.com',
  adminSeedPassword: process.env.ADMIN_SEED_PASSWORD || 'ChangeMe123!',
  frontendOrigins: [
    process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    process.env.ADMIN_FRONTEND_ORIGIN || 'http://localhost:5173'
  ],
  maxImportFileSizeMb: Number(process.env.MAX_IMPORT_FILE_SIZE_MB || 25),
  readOnlyDatabase: process.env.READ_ONLY_DATABASE !== 'false'
};
