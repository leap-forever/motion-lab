/**
 * 教学版 Service Worker —— 把原站 sw.js 里最值得学的四条策略写清楚。
 *
 * 原站由 vite.config.ts 在构建时注入 BUILD / PRECACHE / RUNTIME_FILES：
 *  1. 应用外壳 app.html：网络与缓存「赛跑」，超时/断网/5xx 用缓存，不让人干等；
 *  2. 内容站页面不经过 SW，直接走网络（避免把 /games 的静态内容串到 /start 闪屏）；
 *  3. 游戏代码、字体、图标构建时全部预缓存，文件名带 hash；
 *  4. 识别模型 / WASM / 语音包首次用到才缓存，URL 带 ?v=内容hash；
 *     activate 时把旧版本文件按 SHA-256 比对后迁移，内容不同才删。
 *
 * 教学版没做「构建时注入 hash 清单」，改成运行时缓存，
 * 但四条策略的形态都保留了。真要上生产，请照原站的做法注入清单。
 */
const BUILD = 'lab-0.1.0';
const APP = `motion-lab-app-${BUILD}`;
const RUNTIME = `motion-lab-runtime-${BUILD}`;
const SHELL_WAIT = 1500;
const PRECACHE = ['/app.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== APP && n !== RUNTIME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** 只存 200：跨域 CDN 若返回 opaque(0)，说明没开 CORS，存了也读不出内容 */
async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request).catch(() => null);
  if (!res) return Response.error();
  if (res.status === 200) cache.put(request, res.clone()).catch(() => {});
  return res;
}

/**
 * 应用页：网络与缓存赛跑。
 * 注意网络响应不写回 —— 内容站和应用的 HTML 长得不一样，
 * 存成外壳会在下次打开别的路由时先闪一下别的页面。
 */
async function appPage(request) {
  const net = fetch(request);
  const cached = await caches.match('/app.html', { cacheName: APP });
  if (!cached) return net.catch(() => Response.error());
  return Promise.race([
    net.then((r) => (r.status >= 500 ? cached : r), () => cached),
    new Promise((resolve) => setTimeout(() => resolve(cached), SHELL_WAIT)),
  ]);
}

/** 正在玩一局的页面：发版前别把它刷新掉（原站也有这条） */
function playingUrl(href) {
  try { return /^\/app\/play\//.test(new URL(href).pathname); } catch { return false; }
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CAN_UPDATE') return;
  const port = event.ports[0];
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const busy = all.some((c) => c.visibilityState === 'visible' && playingUrl(c.url));
      port?.postMessage({ same: true, busy });
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);

  // 跨域：只允许把「模型/WASM 所在的 CDN」放进运行时缓存
  if (url.origin !== self.location.origin) {
    if (/cdn\.jsdelivr\.net|storage\.googleapis\.com|registry\.npmmirror\.com/.test(url.host)) {
      event.respondWith(cacheFirst(req, RUNTIME));
    }
    return;
  }

  const path = url.pathname;
  if (path === '/sw.js' || path.startsWith('/api/') || path.startsWith('/content/') || path === '/') return;

  if (req.mode === 'navigate') {
    event.respondWith(appPage(req));
  } else if (/^\/(models|mediapipe|voice)\//.test(path)) {
    event.respondWith(cacheFirst(req, RUNTIME));
  } else {
    event.respondWith(cacheFirst(req, APP));
  }
});
