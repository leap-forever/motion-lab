import { NextResponse, type NextRequest } from 'next/server';

/**
 * 给 /api/* 统一加 CORS（保留原 server 的跨域支持）。
 * Next dev / start 下应用与 API 同源，本不需要 CORS；但旧版客户端 / 外部脚本
 * 可能仍会请求，这里保留无害。OPTIONS 预检直接回 204。
 *
 * Next.js 16 把 middleware 改名为 proxy（功能不变）。
 */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

export function proxy(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
