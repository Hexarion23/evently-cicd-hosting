const { Pool } = require('pg');

// Load .env in development for convenience (do NOT commit .env to source control)
if (process.env.NODE_ENV !== 'production') {
 // eslint-disable-next-line no-unused-vars
  require('dotenv').config();
}

// Primary source for DB connection string
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Helpful error when running locally without a DATABASE_URL.
  // You must set DATABASE_URL to the Postgres connection string from Supabase (Project → Settings → Database → Connection string).
  throw new Error(
    'Missing DATABASE_URL environment variable. Set DATABASE_URL to your Postgres connection string (Supabase → Project Settings → Database → Connection string).'
  );
}

// Enable SSL when in production (typical for connecting to Supabase Postgres)
const useSSL = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected idle client error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};