import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { database } from './db';

export interface SessionUser { id: string; name: string; email: string }

export const SESSION_COOKIE = 'planora_session';
const SESSION_DAYS = 30;

/** scrypt with a per-user salt; stored as "salt:hash" (hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createUser(name: string, email: string, password: string): SessionUser {
  const user = { id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase() };
  database().prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, user.name, user.email, hashPassword(password), new Date().toISOString());
  return user;
}

export function findUserByCredentials(email: string, password: string): SessionUser | null {
  const row = database().prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
    { id: string; name: string; email: string; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, name: row.name, email: row.email };
}

/** Start a session: only a hash of the token is stored, the token lives in an httpOnly cookie. */
export function startSession(cookies: Cookies, userId: string, secure: boolean) {
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  database().prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, expires);
  cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_DAYS * 86_400 });
}

export function sessionUser(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const db = database();
  const row = db.prepare(`SELECT u.id, u.name, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`)
    .get(tokenHash(token)) as { id: string; name: string; email: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token)); return null; }
  return { id: row.id, name: row.name, email: row.email };
}

export function endSession(cookies: Cookies) {
  const token = cookies.get(SESSION_COOKIE);
  if (token) database().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  cookies.delete(SESSION_COOKIE, { path: '/' });
}
