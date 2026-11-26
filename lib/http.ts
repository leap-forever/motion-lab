/**
 * Route Handlers 的小工具：JSON 响应、请求体解析、字段清洗。
 * CORS 头由 middleware.ts 统一加，这里不再重复。
 */

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** 去掉控制字符并截断，防止榜单/昵称里塞乱码或超长串 */
export function clean(s: unknown, max = 24): string {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 64 * 1024) throw new Error('BODY_TOO_LARGE');
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('BAD_JSON');
  }
}
