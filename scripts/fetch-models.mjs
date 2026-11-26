/**
 * 把运行所需的 MediaPipe ESM / WASM / 姿态模型**全部**落到 public/，实现真正离线。
 *
 * 为什么是这些文件（对着 vision_bundle.mjs 里 FilesetResolver 的实现数出来的）：
 *   forVisionTasks(base, module=false)
 *     → `${base}/vision_wasm[?_module][?_nosimd]_internal.js`
 *     → `${base}/vision_wasm[?_module][?_nosimd]_internal.wasm`
 *   SIMD 支持    → vision_wasm_internal.{js,wasm}
 *   SIMD 不支持  → vision_wasm_nosimd_internal.{js,wasm}
 *   module 模式  → vision_wasm_module_internal.{js,wasm}（本包没提供 nosimd 版）
 * 本项目只创建 PoseLandmarker，所以不需要 hand/face/segmentation 模型；
 * 但设置面板能切 lite/full/heavy 三档，三份 .task 都得在，否则离线切档 404。
 *
 * 下载用 curl 子进程（Node fetch 不读 HTTPS_PROXY，本机代理下会超时），
 * 4 路并发，逐文件校验体积与文件头，防「CDN 把 404 页面当成模型返回」。
 *
 * 来源：@mediapipe/tasks-vision@1.1.1（jsdelivr 上的 npm 包内容，Apache-2.0）
 *       Google MediaPipe 官方 pose_landmarker 模型（授权见模型页）
 * 两者都不是 dongdongpark.com 的自有资产；本项目仅作教学用途。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
const MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const WASM_SETS = [
  'vision_wasm_internal',            // SIMD 版（默认路径）
  'vision_wasm_nosimd_internal',     // 无 SIMD 的兜底
  'vision_wasm_module_internal',     // ESM module 模式备用
];
const POSE_MODELS = ['lite', 'full', 'heavy'];

/** [远程 URL, public/ 下相对路径, 最小可接受字节数, 校验类型] */
const FILES = [
  [`${VISION}/vision_bundle.mjs`, 'public/mediapipe/vision_bundle.mjs', 100_000, 'mjs'],
  [`${VISION}/vision_bundle.mjs.map`, 'public/mediapipe/vision_bundle.mjs.map', 100_000, 'json'],
  ...WASM_SETS.flatMap((name) => [
    [`${VISION}/wasm/${name}.js`, `public/mediapipe/wasm/${name}.js`, 200_000, 'js'],
    [`${VISION}/wasm/${name}.wasm`, `public/mediapipe/wasm/${name}.wasm`, 10_000_000, 'wasm'],
  ]),
  ...POSE_MODELS.map((m) => [
    `${MODEL_BASE}/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`,
    `public/models/pose_landmarker_${m}.task`,
    4_000_000,
    'task',
  ]),
];

function validate(buf, kind) {
  const head = buf.subarray(0, 16);
  const text = buf.subarray(0, 256).toString('utf8').trimStart();
  // 最常见的事故：CDN / 代理把错误页当二进制返回，Content-Type 还是 200
  if (text.startsWith('<')) throw new Error('拿到 HTML 错误页，不是目标文件');
  if (kind === 'wasm' && !(head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d)) {
    throw new Error('缺少 \\0asm 魔数，不是 WASM');
  }
  if (kind === 'mjs' && !buf.includes(Buffer.from('export'))) throw new Error('ESM 里没有 export');
  if (kind === 'json' && head.toString('utf8').trimStart()[0] !== '{') throw new Error('sourcemap 不是 JSON');
  // .task 是 MediaPipe 的模型容器，只校验体积与非 HTML
}

async function ready(dest, minBytes, kind) {
  try {
    const s = await stat(dest);
    if (s.size < minBytes) return false;
    const buf = await readFile(dest);
    validate(buf, kind);
    return true;
  } catch { return false; }
}

async function fetchOne([url, local, minBytes, kind]) {
  const dest = join(ROOT, local);
  if (await ready(dest, minBytes, kind)) {
    console.log(`skip  ${local}`);
    return { local, size: (await stat(dest)).size };
  }
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  try {
    await exec('curl', [
      '-sS', '-L', '--fail', '--ssl-no-revoke', '--retry', '3', '--retry-delay', '2',
      '--max-time', '300', '-A', UA, '-o', tmp, url,
    ], { maxBuffer: 1024 * 1024 });
    const buf = await readFile(tmp);
    if (buf.length < minBytes) throw new Error(`只有 ${buf.length} 字节，疑似截断`);
    validate(buf, kind);
    await rename(tmp, dest);
    console.log(`ok    ${local}  ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
    return { local, size: buf.length };
  } catch (err) {
    await rm(tmp, { force: true });
    const msg = String(err.message || err).slice(0, 180);
    console.error(`FAIL  ${local}: ${msg}`);
    return { local, size: 0, error: msg };
  }
}

// 固定 4 路并发：大文件多，串行容易被本机代理拖到整体超时，全开又容易抢带宽
const queue = [...FILES];
const results = await Promise.all(
  Array.from({ length: 4 }, async () => {
    const out = [];
    while (queue.length) out.push(await fetchOne(queue.shift()));
    return out;
  }),
);
const all = results.flat();
const failed = all.filter((r) => r.error);
const total = all.reduce((n, r) => n + r.size, 0);
console.log(`\npublic/ 离线资源：${all.length - failed.length}/${all.length} 个文件，合计 ${(total / 1024 / 1024).toFixed(1)} MB`);
if (failed.length) {
  console.error(`失败 ${failed.length} 个，重跑本脚本会断点续传（已下好的会 skip）`);
  process.exitCode = 1;
} else {
  console.log('现在执行 npm run build 会自动切换到本地资源，无需设置环境变量。');
  console.log('想强制回 CDN：VITE_LOCAL_MODELS=0 npm run build（Git Bash / macOS / Linux）');
}
