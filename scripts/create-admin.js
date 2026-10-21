/* ==========================================================================
   Creates a login for the admin panel (/admin), or gives an existing admin a
   new password:
     npm run create-admin -- <admin-id>
   Prints a new random password once. Uses the same storage as the server:
   the DATABASE_URL database if set (in .env or the shell), else data/.
   ========================================================================== */
import { randomInt } from 'node:crypto';
import { hashPassword } from '../server/admin/auth.js';
import { closeStore, getAdmin, saveAdmin, storeName } from '../server/store.js';

const username = (process.argv[2] || '').trim().toLowerCase();
if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
  console.error('Usage: npm run create-admin -- <admin-id>   (3–40 characters: letters, digits, . _ -)');
  process.exit(1);
}

// Four groups of five characters without look-alikes (no 0/O, 1/l/I): about 115 bits.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const password = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')).join('-');

try {
  const existed = Boolean(await getAdmin(username));
  await saveAdmin({ username, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() });
  console.log(`${existed ? 'New password set for' : 'Created'} admin "${username}" (${storeName}).`);
  console.log(`  Admin ID: ${username}`);
  console.log(`  Password: ${password}`);
  console.log('Sign in at /admin. This password is not shown again; run this command again to replace it.');
} finally {
  await closeStore();
}
