import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { database } from '$lib/server/db';

/** One project of the signed-in user. Rows are always scoped by user_id, so accounts never see each other's work. */
export const GET: RequestHandler = ({ locals, params }) => {
  if (!locals.user) error(401, 'Log in first.');
  const row = database().prepare('SELECT data FROM projects WHERE user_id = ? AND id = ?').get(locals.user.id, params.id) as { data: string } | undefined;
  if (!row) error(404, 'Project not found.');
  return new Response(row.data, { headers: { 'content-type': 'application/json' } });
};

export const PUT: RequestHandler = async ({ locals, params, request, url }) => {
  if (!locals.user) error(401, 'Log in first.');
  const raw = await request.text();
  let project: { id?: string; name?: string; updatedAt?: string };
  try { project = JSON.parse(raw); } catch { error(400, 'Invalid project data.'); }
  if (project.id !== params.id) error(400, 'Project id mismatch.');
  const db = database();
  if (url.searchParams.get('thumbnail')) {
    db.prepare('UPDATE projects SET thumbnail = ? WHERE user_id = ? AND id = ?').run(String((project as { dataUrl?: string }).dataUrl ?? ''), locals.user.id, params.id);
    return json({ ok: true });
  }
  db.prepare(`INSERT INTO projects (id, user_id, name, data, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`)
    .run(params.id, locals.user.id, String(project.name || 'Untitled Project'), raw, new Date().toISOString());
  return json({ ok: true });
};

export const DELETE: RequestHandler = ({ locals, params }) => {
  if (!locals.user) error(401, 'Log in first.');
  database().prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').run(locals.user.id, params.id);
  return json({ ok: true });
};
