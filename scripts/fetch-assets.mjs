/**
 * 把站点公开图片素材落到本地，供 content/ 与游戏卡片使用。
 *
 * 这里用 curl 子进程而不是 Node fetch：本机网络走 HTTP 代理，
 * Node 的 fetch 默认不读 HTTPS_PROXY，直连会超时；curl 会自己走代理。
 *
 * 素材版权归原站所有，本项目仅用于本地学习，请勿再分发或商用。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
const exec = promisify(execFile);
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://dongdongpark.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FILES = [
  ['/shots/en/fruit-slash.jpg', 'public/assets/shots/fruit-slash.jpg'],
  ['/shots/en/jump-rope.jpg', 'public/assets/shots/jump-rope.jpg'],
  ['/shots/en/soccer-kick.jpg', 'public/assets/shots/soccer-kick.jpg'],
  ['/shots/en/bubble-pop.jpg', 'public/assets/shots/bubble-pop.jpg'],
  ['/favicon.svg', 'public/assets/origin-favicon.svg'],
];

async function already(path) {
  try { return (await stat(path)).size > 100; } catch { return false; }
}

// 并行下载：串行 5 个请求在本机代理环境下容易整体超时
await Promise.all(FILES.map(async ([remote, local]) => {
  const dest = join(ROOT, local);
  if (await already(dest)) { console.log(`skip  ${local}`); return; }
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  const url = ORIGIN + remote;
  try {
    await exec('curl', [
      '-sS', '-L', '--fail', '--max-time', '40', '--retry', '2', '--retry-delay', '1',
      '-A', UA, '-o', tmp, url,
    ]);
    const head = (await readFile(tmp)).subarray(0, 4);
    // 防「CDN 把 404 页面当图片返回」
    if (remote.endsWith('.jpg') && !(head[0] === 0xff && head[1] === 0xd8)) {
      throw new Error('不是 JPEG（可能拿到了错误页）');
    }
    await rename(tmp, dest);
    const size = (await stat(dest)).size;
    console.log(`ok    ${local}  ${(size / 1024).toFixed(0)} KB  ← ${remote}`);
  } catch (err) {
    console.error(`FAIL  ${local}: ${String(err.message || err).slice(0, 160)}`);
  }
}));
console.log('素材来源：https://dongdongpark.com —— 仅限本地学习使用');
