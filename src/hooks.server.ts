import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { SESSION_COOKIE, sessionUser } from '$lib/server/auth';

/** Attach the signed-in user (if any) to every request. PLANORA_AUTH=off skips accounts (automated tests). */
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.authEnabled = env.PLANORA_AUTH !== 'off';
  event.locals.user = event.locals.authEnabled ? sessionUser(event.cookies.get(SESSION_COOKIE)) : null;
  return resolve(event);
};
