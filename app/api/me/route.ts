import { json, clean } from '@/lib/http';
import { store } from '@/lib/store';

/** GET /api/me?token= —— 取账号信息 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = clean(url.searchParams.get('token'), 64);
  const { data } = await store();
  const user = data.users[token];
  if (!user) return json({ error: 'NO_SESSION' }, 401);
  return json({ user });
}
