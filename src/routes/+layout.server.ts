import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/** Pages that need an account. Logged-out visitors go to login and come back afterwards. */
const PROTECTED = ['/dashboard', '/editor', '/ai'];

export const load: LayoutServerLoad = ({ locals, url }) => {
  if (locals.authEnabled && !locals.user && PROTECTED.some(p => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    redirect(303, `/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return { user: locals.user, authEnabled: locals.authEnabled };
};
