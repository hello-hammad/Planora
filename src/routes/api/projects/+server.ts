import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { database } from '$lib/server/db';

/** GET /api/projects — the signed-in user's projects. ?thumbnails=1 returns { id: dataUrl }. */
export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user) error(401, 'Log in first.');
  if (url.searchParams.get('thumbnails')) {
    const rows = database().prepare('SELECT id, thumbnail FROM projects WHERE user_id = ? AND thumbnail IS NOT NULL').all(locals.user.id) as { id: string; thumbnail: string }[];
    return json(Object.fromEntries(rows.map(r => [r.id, r.thumbnail])));
  }
  const rows = database().prepare('SELECT id, name, updated_at AS updatedAt FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(locals.user.id);
  return json(rows);
};
