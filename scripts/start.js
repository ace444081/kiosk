/**
 * Production start: NODE_ENV=production + server entry. Requires the built
 * web app (npm run build) and a production-grade .env (see .env.example).
 */
process.env.NODE_ENV = 'production';
await import('../apps/server/src/index.js');
