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

开发模式（前端热更新，API 由 Vite 代理到 8787）：

```bash
npm run api      # 终端 A：后端 8787
npm run dev      # 终端 B：Vite 5173 → http://127.0.0.1:5173/app
```

可选：把 WASM 与模型落到本地，体验**真离线**（约 31MB，第一次几分钟）：

```bash
npm run models
VITE_LOCAL_MODELS=1 npm run build && npm run start
# Windows PowerShell: $env:VITE_LOCAL_MODELS='1'; npm run build; npm run start
```

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
| GET | `/api/trial?deviceId=` | 查询免登录剩余局数（每天 2 局） |
| POST | `/api/trial/consume` | 消耗一次试玩 |
| POST | `/api/scores` | 上报成绩，服务端算星级与排名 |
| POST | `/api/auth/guest` | 简化「成人建号」 |
| GET | `/api/me?token=` | 账号与每日局数 |

数据落在 `data/db.json`；`deviceId` 只留在服务端做计数，**绝不下发到榜单**。

---

## 已实现 / 未实现

| 已实现 | 未实现（刻意留白） |
|---|---|
| 混合双层页面、PWA manifest、离线 SW | 11 语言、`llms.txt` 内容矩阵、249 个 SEO 页 |
| 摄像头采集、帧率测量、帧节流 | 200+ 个 lazy chunk 与构建时 hash 清单注入 |
| MediaPipe WASM + 三档模型切换 + 双兜底 | hand / face landmarker、双人分屏对战 |
| 光照与站位自检、设备检测页 | 语音包（原站私有 `.bin` 容器）与 TTS |
| 一个完整可玩的切水果 + 成绩/榜单闭环 | 其余 119 个游戏、会员/Stripe、社交、云相册 |
| 最小账号与试玩限额 | Better Auth 全套（OTP / 手机验证码 / Google one-tap） |

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
| 4 张游戏截图 | `https://dongdongpark.com/shots/en/*.jpg` | 站点公开素材，**仅本地学习**，脚本 `npm run assets` |
| 原始 favicon | `https://dongdongpark.com/favicon.svg` | 存为 `public/assets/origin-favicon.svg` 作样本；项目图标另自绘 |
| tasks-vision 1.1.1 / WASM | `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1` | Apache-2.0，运行时 CDN 或 `npm run models` 本地化 |
| `pose_landmarker_lite.task` | Google `storage.googleapis.com/mediapipe-models` | MediaPipe 官方模型 |

**已知限制**：项目只做了静态源码与构建验证，没有在真实浏览器里跑完一局（本机无摄像头交互环境）。因此推理实际帧率、GPU delegate 是否真正生效、CDN 模型的浏览器 CORS 表现，需要你在本机打开 `/app/play/fruit-slash` 实测。若 GPU 创建失败，代码会自动回落 CPU 并在 HUD 里显示。
