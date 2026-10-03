import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createUser, endSession, findUserByCredentials, startSession } from '$lib/server/auth';

/** POST /api/auth/signup | login | logout */
export const POST: RequestHandler = async ({ params, request, cookies, url }) => {
  const secure = url.protocol === 'https:';
  if (params.action === 'logout') { endSession(cookies); return json({ ok: true }); }

  const body = await request.json().catch(() => ({})) as { name?: string; email?: string; password?: string };
  const email = String(body.email ?? '').trim(), password = String(body.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400, 'Enter a valid email address.');

  if (params.action === 'signup') {
    const name = String(body.name ?? '').trim();
    if (name.length < 2) error(400, 'Enter your name.');
    if (password.length < 8) error(400, 'Choose a password with at least 8 characters.');
    let user;
    try { user = createUser(name, email, password); }
    catch { error(409, 'An account already exists for this email.'); }
    startSession(cookies, user.id, secure);
    return json({ user });
  }

  if (params.action === 'login') {
    const user = findUserByCredentials(email, password);
    if (!user) error(401, 'Email or password is incorrect.');
    startSession(cookies, user.id, secure);
    return json({ user });
  }

  error(404, 'Unknown action.');
};
