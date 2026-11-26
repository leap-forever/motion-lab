import { json } from '@/lib/http';

/** POST /api/trial/consume —— 兼容端点：恒返回 allowed:true */
export async function POST() {
  return json({ allowed: true, unlimited: true, remaining: 2 });
}
