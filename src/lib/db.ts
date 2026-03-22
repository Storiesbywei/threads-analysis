// Re-export database functions for use in Astro API routes.
// scripts/db.mjs reads DATABASE_URL from process.env (loaded by Vite from .env).
export { query, transaction, close } from '../../scripts/db.mjs';
