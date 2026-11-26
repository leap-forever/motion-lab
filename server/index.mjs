import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openStore } from './store.mjs';

/**
 * 单进程、零第三方依赖的后端。
 *
 * 刻意复刻原站「一个域名、两层页面、一个独立 API 命名空间」的形态：
 *   /                   → content/index.html   预生成静态内容站（SEO 层）
 *   /app, /app/*        → dist/index.html      React PWA 外壳
 *   /assets/*           → dist/assets/*        JS/CSS 与图片素材
 *   /models/, /mediapipe/, /voice/ → 可选本地化的大文件
 *   /api/*              → JSON API
 *
 * 真实站点把这些拆成了 dongdongpark.com / api.dongdongpark.com /
 * img.dongdongpark.com 三个域 + Cloudflare；这里收进一个进程，方便本地学习。
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');
const CONTENT = join(ROOT, 'content');
const PORT = Number(process.env.PORT || 8787);
const BUILD = 'lab-0.1.0';
const TRIAL_LIMIT = 2;
const FREE_DAILY_LIMIT = 10;

const store = await openStore(join(ROOT, 'data', 'db.json'));

const GAMES = [
  {
    id: 'fruit-slash', name: '切水果', nameEn: 'Fruit Slash', age: [6, 14],
    type: 'hands', energy: 'moderate', duration: 45, stars: [6, 12, 20],
    shot: '/assets/shots/fruit-slash.jpg',
    desc: '挥手切开飞起来的水果，别碰到炸弹。', playable: true,
  },
  {
    id: 'jump-rope', name: '跳绳冠军', nameEn: 'Jump Rope Champ', age: [6, 14],
    type: 'legs', energy: 'high', duration: 60, stars: [10, 20, 35],
    shot: '/assets/shots/jump-rope.jpg',
    desc: '绳子扫到脚下时起跳，连击越长节奏越快。', playable: false,
  },
  {
    id: 'soccer-kick', name: '足球射门', nameEn: 'Soccer Shootout', age: [4, 10],
    type: 'legs', energy: 'high', duration: 45, stars: [4, 8, 14],
    shot: '/assets/shots/soccer-kick.jpg',
    desc: '用脚、膝盖和头把球顶进球门，不能用手。', playable: false,
  },
  {
    id: 'bubble-pop', name: '戳泡泡', nameEn: 'Bubble Pop', age: [3, 7],
    type: 'hands', energy: 'light', duration: 45, stars: [8, 15, 24],
    shot: '/assets/shots/bubble-pop.jpg',
    desc: '伸手戳破小青蛙吹出来的泡泡。', playable: false,
  },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.bin': 'application/octet-stream',
};

const clean = (s, max = 24) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

const day = () => new Date().toISOString().slice(0, 10);
const trialKey = (id) => `${day()}:${id}`;

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('BAD_JSON');
  }
}

function starsFor(game, score) {
  const [one, two, three] = game.stars;
  return score >= three ? 3 : score >= two ? 2 : score >= one ? 1 : 0;
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, build: BUILD, now: Date.now(), games: GAMES.length });
  }

  if (pathname === '/api/games') {
    return sendJson(res, 200, { games: GAMES });
  }

  // 榜单：只回昵称/成绩/星级，绝不回设备标识 —— 和原站「只显示昵称和头像」一个口径
  if (pathname === '/api/leaderboard') {
    const gameId = clean(url.searchParams.get('game') || 'fruit-slash', 40);
    const period = url.searchParams.get('period') === 'all' ? 'all' : 'week';
    const since = period === 'week' ? Date.now() - 7 * 86400_000 : 0;
    const rows = store.data.scores
      .filter((r) => r.game === gameId && r.at >= since)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, 20)
      .map(({ nickname, score, stars, at, game }) => ({ nickname, score, stars, at, game }));
    return sendJson(res, 200, { game: gameId, period, rows });
  }

  if (pathname === '/api/trial' && method === 'GET') {
    const deviceId = clean(url.searchParams.get('deviceId'), 64);
    if (!deviceId) return sendJson(res, 400, { error: 'DEVICE_REQUIRED' });
    const used = store.data.trials[trialKey(deviceId)] || 0;
    return sendJson(res, 200, { limit: TRIAL_LIMIT, used, remaining: Math.max(0, TRIAL_LIMIT - used) });
  }

  if (pathname === '/api/trial/consume' && method === 'POST') {
    const body = await readBody(req);
    const deviceId = clean(body.deviceId, 64);
    if (!deviceId) return sendJson(res, 400, { error: 'DEVICE_REQUIRED' });
    const key = trialKey(deviceId);
    const used = store.data.trials[key] || 0;
    if (used >= TRIAL_LIMIT) {
      return sendJson(res, 403, { error: 'TRIAL_EXHAUSTED', remaining: 0 });
    }
    store.data.trials[key] = used + 1;
    store.save();
    return sendJson(res, 200, { allowed: true, remaining: TRIAL_LIMIT - used - 1 });
  }

  if (pathname === '/api/scores' && method === 'POST') {
    const body = await readBody(req);
    const game = GAMES.find((g) => g.id === body.game);
    if (!game) return sendJson(res, 400, { error: 'UNKNOWN_GAME' });
    const nickname = clean(body.nickname, 16) || '小玩家';
    const score = Math.max(0, Math.min(9999, Math.round(Number(body.score) || 0)));
    const record = {
      id: store.data.seq++,
      game: game.id,
      nickname,
      score,
      stars: starsFor(game, score),
      durationMs: Math.max(0, Math.min(3600_000, Math.round(Number(body.durationMs) || 0))),
      at: Date.now(),
      // deviceId 只留在服务端，用于统计每日局数；绝不下发到榜单
      deviceId: clean(body.deviceId, 64),
    };
    store.data.scores.push(record);
    if (store.data.scores.length > 5000) store.data.scores.splice(0, store.data.scores.length - 5000);
    store.save();
    const rank = store.data.scores
      .filter((r) => r.game === game.id && r.score > score)
      .length + 1;
    return sendJson(res, 201, { ok: true, id: record.id, stars: record.stars, rank });
  }

  // 简化账号：原站是 Better Auth（邮箱 OTP / 手机验证码 / Google one-tap / session），
  // 教学版只保留「成人建号 → 每日局数上限」这条主线
  if (pathname === '/api/auth/guest' && method === 'POST') {
    const body = await readBody(req);
    const nickname = clean(body.nickname, 16) || '家长';
    const token = randomUUID();
    store.data.users[token] = { id: randomUUID(), nickname, plan: 'free', createdAt: Date.now() };
    store.save();
    return sendJson(res, 200, { token, user: store.data.users[token] });
  }

  if (pathname === '/api/me') {
    const token = clean(url.searchParams.get('token'), 64);
    const user = store.data.users[token];
    if (!user) return sendJson(res, 401, { error: 'NO_SESSION' });
    const used = store.data.scores.filter(
      (r) => r.deviceId === token && r.at >= Date.now() - 86400_000
    ).length;
    return sendJson(res, 200, { user, dailyLimit: FREE_DAILY_LIMIT, dailyUsed: used, dailyRemaining: Math.max(0, FREE_DAILY_LIMIT - used) });
  }

  return sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
}

/** 把 URL 映射到磁盘文件；返回 null 表示不是静态资源 */
function staticFile(pathname) {
  if (pathname === '/') return join(CONTENT, 'index.html');
  // SPA 外壳：任意 /app/* 都回同一个 index.html，前端自己按 pathname 切页
  if (pathname === '/app' || pathname === '/app.html' || pathname.startsWith('/app/')) {
    return join(DIST, 'index.html');
  }
  if (/^\/(favicon\.svg|sw\.js|manifest\.webmanifest|icon-\d+\.png)$/.test(pathname)) {
    return join(DIST, pathname.slice(1));
  }
  if (/^\/(assets|models|mediapipe|voice)\//.test(pathname)) {
    return join(DIST, pathname.slice(1));
  }
  if (pathname.startsWith('/content/')) return join(ROOT, pathname.slice(1));
  return null;
}

async function serveStatic(res, pathname) {
  const file = staticFile(pathname);
  if (!file) return false;
  const abs = resolve(file);
  // 防目录穿越：所有静态文件必须落在项目根内
  if (!abs.startsWith(resolve(ROOT))) {
    res.writeHead(403); res.end('Forbidden'); return true;
  }
  try {
    const buf = await readFile(abs);
    const ext = extname(abs);
    const immutable = pathname.startsWith('/assets/') && /-[A-Za-z0-9_-]{6,}\./.test(pathname);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : pathname.endsWith('.html') || pathname === '/'
          ? 'no-cache'
          : 'public, max-age=600',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      });
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (await serveStatic(res, url.pathname)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (err) {
    console.error('[server]', err);
    sendJson(res, err.message === 'BAD_JSON' ? 400 : 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[motion-lab] http://127.0.0.1:${PORT}/          内容站（静态页）`);
  console.log(`[motion-lab] http://127.0.0.1:${PORT}/app        应用（React PWA）`);
  console.log(`[motion-lab] http://127.0.0.1:${PORT}/api/health  API`);
});
