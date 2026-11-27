import type { Metadata } from 'next';
import './home.css';

/**
 * 内容站首页（对应原 content/index.html，路由 /）。
 *
 * 这一层刻意保持「静态、给搜索引擎和 AI 读」的形态：JSON-LD、speculationrules、
 * 卡片图片都直接写在 JSX 里，不依赖客户端 JS 即可呈现内容。
 * 点击「打开应用」才进入 /app/* 的 React PWA 层。
 */
export const metadata: Metadata = {
  title: 'Motion Lab · 浏览器端体感游戏实验台',
  description: '一个用于学习的净室复刻项目：摄像头 + MediaPipe WASM + Canvas 2D，画面不出本机。',
  robots: { index: true, follow: true },
};

const WEB_APP_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Motion Lab',
  description: '教学用浏览器端体感游戏实验台',
  url: '/',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Chrome / Edge',
  offers: { '@type': 'Offer', price: '0' },
};

const FAQ_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '摄像头画面会上传吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '不会。视频流只进入本机 video 元素与 canvas，姿态识别在浏览器 WASM 中完成，服务端只收到成绩数字。',
      },
    },
    {
      '@type': 'Question',
      name: '需要安装什么？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '不用安装。首次打开会下载 MediaPipe WASM 与姿态模型，之后由 Service Worker 缓存，可离线运行。',
      },
    },
  ],
};

const SPECULATION = {
  prefetch: [
    { where: { href_matches: ['/app', '/app/check', '/app/play/*'] }, eagerness: 'moderate' },
  ],
};

export default function HomePage() {
  return (
    <>
      {/* 结构化数据：内容站给搜索引擎与 AI 读，两层 JSON-LD + speculationrules */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEB_APP_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }}
      />
      <script
        type="speculationrules"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SPECULATION) }}
      />
      <link rel="preload" as="image" href="/assets/shots/fruit-slash.jpg" />

      <header>
        <a className="brand" href="/"><i />Motion Lab</a>
        <nav>
          <a href="/app">游戏大厅</a>
          <a href="/app/check">设备检测</a>
          <a href="/app/play/fruit-slash">直接开玩</a>
        </nav>
      </header>

      <div className="wrap">
        <h1>用摄像头玩的体感游戏，<br />全部推理都在你的浏览器里</h1>
        <p className="lead">
          这是一个<strong>用于学习的净室复刻项目</strong>：把公开可观察的架构设计重新实现一遍 ——
          静态内容站 + React PWA、MediaPipe WASM 姿态识别、帧节流、Canvas 2D 游戏、离线缓存与最小后端。代码全部自写并带注释。
        </p>
        <a className="cta" href="/app">打开应用 →</a>
        <a className="cta sec" href="/app/check">先检测设备</a>

        <h2>示例游戏</h2>
        <div className="grid">
          <a className="card" href="/app/play/fruit-slash"><img src="/assets/shots/fruit-slash.jpg" alt="切水果" /><div><h3>切水果</h3><p>挥手切开飞起的水果，别碰炸弹 · 已实现</p></div></a>
          <a className="card" href="/app/play/jump-rope"><img src="/assets/shots/jump-rope.jpg" alt="跳绳冠军" /><div><h3>跳绳冠军</h3><p>脚部动作与节奏判定 · 已实现</p></div></a>
          <a className="card" href="/app/play/soccer-kick"><img src="/assets/shots/soccer-kick.jpg" alt="足球射门" /><div><h3>足球射门</h3><p>下肢关键点判定 · 已实现</p></div></a>
          <a className="card" href="/app/play/bubble-pop"><img src="/assets/shots/bubble-pop.jpg" alt="戳泡泡" /><div><h3>戳泡泡</h3><p>手部关键点判定 · 已实现</p></div></a>
        </div>

        <h2>这一层为什么是纯静态 HTML</h2>
        <div className="note">
          <p>
            原站把站点分成两层：<strong>内容页</strong>（首页、游戏介绍、指南、文章，共 249 个 URL、11 种语言）是
            <strong>构建时预生成的静态 HTML</strong>，专门给搜索引擎和 AI 读，几乎不加载 JS；<strong>应用页</strong>
            （<code>/start</code>、<code>/check</code>、<code>/play/*</code>）才是由框架打包的 React PWA。
          </p>
          <p>
            本项目的内容站首页就是前一层的缩小版：上面两段 JSON-LD、<code>speculationrules</code>
            预取、卡片图片全部是写死在 JSX 里的，服务端直接渲染返回，<strong>不经过 Service Worker</strong>。点击「打开应用」才进入后一层。
          </p>
          <p>好处：内容页首屏极快、可被完整索引；应用页独立发版、可以整包预缓存做离线。代价是两套页面要各自维护导航与多语言。</p>
        </div>

        <h2>隐私</h2>
        <p>
          摄像头画面只进入本机 <code>&lt;video&gt;</code> 与 <code>canvas</code>，<code>audio:false</code>；
          姿态识别在浏览器 WASM 中完成。服务端只保存成绩数字、昵称与星级，不接收图像。
        </p>
      </div>

      <footer>教学项目 · 图片素材来自 dongdongpark.com，仅限本地学习使用，请勿再分发或商用</footer>
    </>
  );
}
