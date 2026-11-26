import { randomUUID } from 'node:crypto';
import { json, clean, readJson } from '@/lib/http';
import { store } from '@/lib/store';

/**
 * POST /api/auth/guest —— 简化「成人建号」。
 * 原站是 Better Auth 全套，教学版只保留这一条主线，不做任何局数限制。
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (err) {
    return json({ error: String((err as Error).message) }, 400);
  }

  const nickname = clean(body.nickname, 16) || '家长';
  const token = randomUUID();
  const { data, save } = await store();
  data.users[token] = { id: randomUUID(), nickname, plan: 'free', createdAt: Date.now() };
  save();

  return json({ token, user: data.users[token] });
}
