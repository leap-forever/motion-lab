# Motion Lab · 浏览器端体感游戏实验台

> 一个**用于学习**的净室复刻项目：把 dongdongpark.com 公开可观察的架构设计，用自己写的代码重新实现一遍。

## 先说边界

| 项 | 说明 |
|---|---|
| 做法 | **净室重写（clean-room reimplementation）**：只参考公开 HTML/JS 资源里体现的设计思路，代码全部自写、带中文注释 |
| 没做 | 没有反编译 / 反混淆 / 复制原站压缩后的业务代码；没有复制品牌、文案与私有语音包格式 |
| 用途 | **仅限本地学习 / 私有仓库存档**。本仓库设为 **private**；图片素材取自原站，版权归原站所有，请勿转为公开仓库、再分发、上线或商用 |
| 模型 | MediaPipe Tasks Vision 与 `.task` 模型来自 Google / npm，非原站自有资产，授权见各自仓库 |

---

## 快速开始

环境：Node ≥ 20、Chrome / Edge（摄像头需要 `localhost` 或 HTTPS）。

```bash
# 1) 装依赖（若腾讯镜像 403，换源）
npm install --registry=https://registry.npmmirror.com

# 2) 取图片素材（站点公开 jpg，约 450KB）
npm run assets

# 3) 生产模式：构建后由 Node 后端单端口托管
npm run build
npm run start
# → http://127.0.0.1:8787/        静态内容站
# → http://127.0.0.1:8787/app     React PWA
# → http://127.0.0.1:8787/api/health
```

> `npm run start` 与 `npm run api` 是同一条命令（`node server/index.mjs`），**同一端口只能起一个**。
> 重复启动会报 `EADDRINUSE: 127.0.0.1:8787`：到原终端 Ctrl+C，或换端口
> `PORT=8788 npm run api`（PowerShell：`$env:PORT='8788'; npm run api`）。
> 想确认是不是本项目的服务：`curl http://127.0.0.1:8787/api/health`。

开发模式（前端热更新，API 由 Vite 代理到 8787）：

```bash
npm run api      # 终端 A：后端 8787
npm run dev      # 终端 B：Vite 5173 → http://127.0.0.1:5173/app
```

### 完全离线（推荐，一键）

```bash
npm ci              # 先装依赖；离线脚本只用 Node 内置模块，但不装它 tsc/vite 会报 not found
npm run offline     # = offline:fetch + build：下载全套资源后构建，约 83 MB
npm run start
# → http://127.0.0.1:8787/content/offline-check.html   离线自检页
```

> clone 后或删掉 `node_modules` 后直接跑 `npm run offline`，前半段下载会成功、后半段
> `tsc --noEmit` 会报 `sh: 1: tsc: not found` —— 这是依赖没装，补一次 `npm ci` 即可。

`vite.config.ts` 在**构建时**探测 `public/models` 与 `public/mediapipe`，关键文件齐全就注入
`__LOCAL_MODELS__=true`，`src/lib/config.ts` 随即把 WASM / 模型 URL 从 CDN 切到同源路径 ——
**不用记环境变量**。删掉这些文件重新 build 会自动回 CDN；想临时强制回 CDN：
`VITE_LOCAL_MODELS=0 npm run build`（PowerShell：`$env:VITE_LOCAL_MODELS='0'; npm run build`）。

拆开跑也行：`npm run assets`（5 个站点素材）、`npm run models`（11 个 WASM / 模型文件）。
两个脚本都幂等，已下好的会 `skip`，失败的重跑会断点续传。

> **注意**：`public/models/` 与 `public/mediapipe/` 这 83 MB 已在 `.gitignore` 里，
> **不进 GitHub 仓库**（避免仓库膨胀）。clone 之后执行一次 `npm run offline` 即可复原。

---

## 架构对照

| 层 | 原站（实测） | 本项目 |
|---|---|---|
| 内容站 | 构建时预生成静态 HTML，249 URL / 11 语言 / 6 类 JSON-LD / Speculation Rules / `llms.txt` | `content/index.html`，纯静态，2 类 JSON-LD + 预取规则 |
| 应用 | Vite + React + TanStack Router/Query，上百个带 hash 的 lazy chunk | Vite + React + TS，**故意不拆 chunk**（教学可读性优先），按 `pathname` 手写路由 |
| 摄像头 | `getUserMedia` 1280×720@30、`audio:false`、`requestVideoFrameCallback` 测帧率 | 同（`src/lib/camera.ts`） |
| 推理调度 | `vision-*.js` 内的帧节流器，按真实帧率决定是否推理 | `src/lib/frameGate.ts`，逐行注释版 |
| 姿态识别 | MediaPipe Tasks Vision 1.1.1 WASM，pose lite/full/heavy + hand + face `.task` | 同，含 GPU→CPU、SIMD→nosimd 双兜底（只接 pose） |
| 特征层 | 关键点索引表、姿势角度模板、位移归一化 | `landmarks.ts` / `features.ts`，含指数平滑 |
| 环境自检 | 亮度直方图 + 关键点几何 → 逆光/太近/脚没进画面 | `framing.ts`（`check` 页可视化） |
| 渲染 | 自研 Canvas 2D，DPR≤2、16:9 letterbox、离屏精灵缓存 | `stage.ts` / `draw.ts`，逻辑坐标固定 1280×720 |
| 离线 | `sw.js` 构建时注入 PRECACHE/RUNTIME_FILES；外壳网络缓存竞速；`?v=hash`；SHA-256 迁移旧模型 | `public/sw.js` 保留四条策略形态，改为运行时缓存 |
| 后端 | `api.dongdongpark.com` + Better Auth(`/api/auth/*`) + Stripe | Node 原生 `http`，零依赖，JSON 文件持久化 |
| 素材 CDN | `img.dongdongpark.com` | `public/assets/shots/`（本地） |

---

## 核心链路

```
getUserMedia(1280×720@30, audio:false)
   │  requestVideoFrameCallback 记录帧号与到达时间
   ▼
FrameGate.due(now, targetFps)          ← 没有新帧就跳过，不重复推理
   ▼
PoseLandmarker.detectForVideo(video, 单调递增时间戳)
   │  GPU delegate 失败 → CPU；SIMD 不支持 → nosimd WASM
   ▼
33 关键点 → 镜像 → 除以躯干长度归一化 → MotionTracker 指数平滑
   ▼
slashHits() / checkFraming() / analyseLighting()
   ▼
FruitSlash.update(dt) → Stage.begin() → Canvas 2D → Stage.end()
   ▼
结算 → POST /api/scores → 榜单（只回昵称）
```

**最值得读的三个文件**：`src/lib/frameGate.ts`（采集时钟 ≠ 渲染时钟 ≠ 推理时钟）、`src/lib/features.ts`（为什么所有位移都要除以躯干长度）、`public/sw.js`（离线策略）。

---

## 后端 API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/games` | 游戏清单（含素材路径、星级阈值） |
| GET | `/api/leaderboard?game=&period=week` | 榜单，只回昵称/分数/星级 |
| POST | `/api/scores` | 上报成绩，服务端算星级与排名 |
| POST | `/api/auth/guest` | 简化「成人建号」 |
| GET | `/api/me?token=` | 账号信息 |
| GET | `/api/trial?deviceId=` | **兼容端点**：恒返回「不限制」 |
| POST | `/api/trial/consume` | **兼容端点**：恒返回 `allowed: true` |

数据落在 `data/db.json`；`deviceId` 只留在服务端做成绩归因，**绝不下发到榜单**。
免登录游玩不限局数、不按天重置，前端与后端都不再有任何局数拦截。

两个 `/api/trial*` 只是给旧客户端的兼容层：新版前端已不再调用，但旧版 JS 可能仍被
Service Worker / 浏览器缓存着。它们不计数、不落盘、不返回 403，等客户端都刷到新版后可删。

> **发版后记得硬刷新**：`/app` 外壳由 SW 预缓存，改完前端要 `npm run build`，
> 再到浏览器 Ctrl+F5（或关掉标签重开）。若看到「后端没连上：NOT_FOUND」，
> 就是旧页面还在请求已经删掉的接口；兼容端点会让它照常能玩。

---

## 已实现 / 未实现

| 已实现 | 未实现（刻意留白） |
|---|---|
| 混合双层页面、PWA manifest、离线 SW | 11 语言、`llms.txt` 内容矩阵、249 个 SEO 页 |
| 摄像头采集、帧率测量、帧节流 | 200+ 个 lazy chunk 与构建时 hash 清单注入 |
| MediaPipe WASM + 三档模型切换 + 双兜底 | hand / face landmarker、双人分屏对战 |
| 光照与站位自检、设备检测页 | 语音包（原站私有 `.bin` 容器）与 TTS |
| 一个完整可玩的切水果 + 成绩/榜单闭环 | 其余 119 个游戏、会员/Stripe、社交、云相册 |
| 最小账号（无试玩限额） | Better Auth 全套（OTP / 手机验证码 / Google one-tap） |

---

## 建议阅读顺序

1. `content/index.html` → 看「内容站」为什么完全不依赖 JS
2. `server/index.mjs` → 看一个域名怎么分出两层页面 + `/api`
3. `src/lib/camera.ts` → `frameGate.ts` → `vision.ts`（采集与推理是怎么解耦的）
4. `src/lib/landmarks.ts` → `features.ts` → `framing.ts`（从坐标到「动作」）
5. `src/lib/controller.ts` → rAF 主循环怎么把上面全串起来
6. `src/games/fruitSlash.ts` → `stage.ts` / `draw.ts`（纯 Canvas 2D 游戏）
7. `public/sw.js` → 离线与版本迁移

---

## 素材与模型来源

| 资源 | 来源 | 备注 |
|---|---|---|
| 4 张游戏截图 | `https://dongdongpark.com/shots/en/*.jpg` | 站点公开素材，**仅本地学习**，脚本 `npm run assets`，合计 450 KB |
| 原始 favicon | `https://dongdongpark.com/favicon.svg` | 存为 `public/assets/origin-favicon.svg` 作样本；项目图标另自绘 |
| `vision_bundle.mjs` + sourcemap | `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1` | Apache-2.0，156 KB + 392 KB |
| WASM 3 套（`js` + `wasm`） | 同上 `wasm/` 目录 | 39.7 MB；SIMD / nosimd / module，`FilesetResolver` 按浏览器能力自动选 |
| `pose_landmarker_{lite,full,heavy}.task` | Google `storage.googleapis.com/mediapipe-models` | 5.5 / 9.0 / 29.2 MB，对应设置面板三档，授权见官方模型页 |

## 离线资源清单（`public/`）

`npm run offline:fetch` 之后 `public/` 一共 16 个二进制/ESM 资源 + 若干代码文件，合计约 **83 MB**：

| 路径 | 文件 | 作用 |
|---|---|---|
| `public/assets/shots/` | 4 张 `.jpg` | 内容站与游戏大厅卡片图 |
| `public/assets/` | `origin-favicon.svg` | 原站图标样本（不使用） |
| `public/mediapipe/` | `vision_bundle.mjs` (+`.map`) | Tasks Vision 的 ESM 入口与 sourcemap |
| `public/mediapipe/wasm/` | `vision_wasm_internal.{js,wasm}` | **默认路径**：浏览器支持 SIMD 时选这套 |
| | `vision_wasm_nosimd_internal.{js,wasm}` | 无 SIMD 的兜底 |
| | `vision_wasm_module_internal.{js,wasm}` | ESM module 模式备用（本项目未启用，备齐供实验） |
| `public/models/` | `pose_landmarker_lite/full/heavy.task` | 设置面板三档模型，离线切档不会 404 |

命名规则不是猜的：`vision_bundle.mjs` 里 `FilesetResolver.forVisionTasks(base)` 会拼出
`${base}/vision_wasm[?_module][?_nosimd]_internal.{js,wasm}`。本项目只创建 `PoseLandmarker`，
所以不需要 hand / face / segmentation 模型。

**自检**：`content/offline-check.html` 会 HEAD 全部 11 个大文件、动态 import 本地 ESM、
创建 `PoseLandmarker(CPU, lite)`，并断言整轮没有跨域请求。实测（Chrome headless，禁代理 +
DNS 屏蔽外网）结果：11 个资源全部 200、15 个请求 100% 同源、外网 probe BLOCKED、`RESULT: PASS`。

**已知限制**：已验证浏览器端**推理器能完整初始化**，但本机没有可交互的摄像头环境，
没有真正跑完一局。因此推理帧率、GPU delegate 是否生效、动作判定手感，仍需你在
`/app/play/fruit-slash` 实测；GPU 创建失败会自动回落 CPU 并在 HUD 显示。
