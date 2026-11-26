import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

/**
 * 根布局：只放 <html>/<body> 与全局 meta，不引入任何 CSS。
 *
 * 刻意保持「两层页面」的分离（对齐原架构）：
 *   - 内容站 /       → app/page.tsx，自己 import './home.css'
 *   - 应用   /app/*  → app/app/layout.tsx，自己 import src/styles.css
 * 两套样式按路由各自加载，互不串。
 */
export const metadata: Metadata = {
  title: 'Motion Lab · 浏览器端体感游戏实验台',
  description: '一个用于学习的净室复刻项目：摄像头 + MediaPipe WASM + Canvas 2D，画面不出本机。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#87ceeb',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
