import { json } from '@/lib/http';

/**
 * GET /api/trial —— 兼容端点：恒返回「不限制」。
 * 新版前端已不再调用试玩接口，但旧版 JS 可能还被 Service Worker / 浏览器缓存着。
 * 不计数、不落盘、不返回 403。等客户端都刷到新版后可删。
 */
export async function GET() {
  return json({ unlimited: true, limit: null, used: 0, remaining: 2 });
}
