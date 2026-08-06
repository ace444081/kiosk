/**
 * Create an admin account. Interactive prompts with hidden password input,
 * or non-interactive: npm run admin:create -- --username x --password y
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';
import { runMigrations } from '../apps/server/src/db/migrate.js';
import { AdminRepository } from '../apps/server/src/repositories/admins.js';
import { AdminAuthService } from '../apps/server/src/services/admin-auth.js';
import { randomId } from '../apps/server/src/security/tokens.js';

const args = process.argv.slice(2);
const arg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
};

let username = arg('username');
let password = arg('password');
const role = arg('role') || 'admin';
const roles = ['admin', 'cashier', 'kitchen', 'serving'];

async function askHidden(rl, prompt) {
  // readline promises cannot hide input; use a raw-mode helper.
  return new Promise((resolve) => {
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();
    output.write(prompt);
    let value = '';
    const onData = (chunk) => {
      const chars = [...chunk];
      for (const c of chars) {
        if (c === 3) {
          // Ctrl+C
          input.setRawMode(false);
          process.exit(130);
        } else if (c === 13 || c === 10) {
          output.write('\n');
          input.setRawMode(wasRaw);
          input.pause();
          input.off('data', onData);
          resolve(value);
          return;
        } else if (c === 127 || c === 8) {
          value = value.slice(0, -1);
        } else {
          value += c;
        }
      }
    };
    input.on('data', onData);
  });
}

if (!username) {
  const rl = readline.createInterface({ input, output });
  username = (await rl.question('Username: ')).trim();
  rl.close();
}
if (!password) {
  const rl = readline.createInterface({ input, output });
  password = await askHidden(rl, 'Password (input hidden): ');
  rl.close();
}
if (!username || !password) {
  console.error('Username and password are required.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
if (!roles.includes(role)) {
  console.error(`Role must be one of: ${roles.join(', ')}.`);
  process.exit(1);
}

const env = loadEnv();
const db = openDb(env.dbPath);
runMigrations(db);
const repo = new AdminRepository(db);
if (repo.findByUsername(username)) {
  console.error(`Admin "${username}" already exists.`);
  db.close();
  process.exit(1);
}
const admin = repo.create({
  id: randomId(),
  username,
  passwordHash: AdminAuthService.hashPassword(password),
  role,
});
console.log(`Staff account created: ${admin.username} [${admin.role}] (id: ${admin.id})`);
db.close();
