import pg from 'pg';

const TEST_DB = 'pos_test'; // keep in sync with vitest.config.e2e.ts

/** Creates the e2e database once, so tests never truncate the dev data. */
export default async function setup() {
  process.loadEnvFile('.env');
  const client = new pg.Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DB],
  );
  if (!rowCount) await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();
}
