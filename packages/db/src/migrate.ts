import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { defaultLogger } from '@openagent/core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  defaultLogger.info('Starting database migrations...');
  const migrationClient = postgres(url, { max: 1, ssl: url.includes('sslmode=require') ? 'require' : false });
  const db = drizzle(migrationClient);

  try {
    // Ensure pgvector extension exists
    defaultLogger.info('Ensuring pgvector extension is present...');
    await migrationClient`CREATE EXTENSION IF NOT EXISTS vector;`;

    const migrationsFolder = path.resolve(__dirname, '../drizzle');
    defaultLogger.info(`Applying migrations from: ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    defaultLogger.info('Migrations applied successfully.');
  } catch (error) {
    defaultLogger.error('Failed to apply database migrations', error);
    throw error;
  } finally {
    await migrationClient.end();
  }
}

// Allow direct CLI execution: tsx src/migrate.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
