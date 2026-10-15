import { DataSource } from 'typeorm';

const TEST_DB = 'pos_test'; // keep in sync with vitest.config.e2e.ts

/** Creates the e2e database once, so tests never truncate the dev data. */
export default async function setup() {
  process.loadEnvFile('.env');
  const server = await new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  }).initialize();
  const rows: unknown[] = await server.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DB],
  );
  if (!rows.length) await server.query(`CREATE DATABASE ${TEST_DB}`);
  await server.destroy();
}
