/* ==========================================================================
   Admin logins. Accounts live in the database (admin_users), created with
   `npm run create-admin -- <username>`. Passwords are stored as scrypt hashes.
   A login is a signed cookie: username + expiry, signed with that admin's
   password hash, so changing the password signs everyone out.
   ========================================================================== */
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getAdmin } from '../store.js';

const scrypt = promisify(scryptCallback);
const COOKIE = 'eterna_admin';
const SESSION_HOURS = 12;
const COST = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

async function passwordMatches(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

// Checked when the username doesn't exist, so a wrong username takes as long as a wrong password.
let decoy = null;

/** The admin's username if the login is right, else null. */
export async function checkLogin(username, password) {
  const admin = await getAdmin(String(username || '').trim().toLowerCase());
  decoy ??= hashPassword(randomBytes(16).toString('hex'));
  const ok = await passwordMatches(String(password || ''), admin ? admin.passwordHash : await decoy);
  return ok && admin ? admin.username : null;
}

const sign = (passwordHash, payload) => createHmac('sha256', passwordHash).update(payload).digest('base64url');

function readCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return value.join('=');
  }
  return '';
}

function cookie(req, value, maxAge) {
  const secure = req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function signIn(req, res, username) {
  const admin = await getAdmin(username);
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${Buffer.from(admin.username).toString('base64url')}.${expires}`;
  res.append('Set-Cookie', cookie(req, `${payload}.${sign(admin.passwordHash, payload)}`, SESSION_HOURS * 3600));
}

export function signOut(req, res) {
  res.append('Set-Cookie', cookie(req, '', 0));
}

/** The signed-in admin's username, or null. */
export async function currentAdmin(req) {
  const [user, expires, signature] = readCookie(req).split('.');
  if (!user || !signature || !(Number(expires) > Date.now())) return null;
  const admin = await getAdmin(Buffer.from(user, 'base64url').toString());
  if (!admin) return null;
  const expected = Buffer.from(sign(admin.passwordHash, `${user}.${expires}`));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? admin.username : null;
}

/** Lets signed-in admins through. Pages go to the login form; /admin/api/* gets a 401. */
export async function requireAdmin(req, res, next) {
  const username = await currentAdmin(req);
  if (username) {
    req.admin = { username };
    return next();
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in again.' });
  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}
