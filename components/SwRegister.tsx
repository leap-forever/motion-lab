'use client';

import { useEffect } from 'react';

/**
 * 生产环境注册 Service Worker（/sw.js），dev 下不注册以免热更新被缓存挡住。
 * 与原 src/main.tsx 的注册逻辑一致；SW 的 fetch handler 已排除 / 与 /content/。
 */
export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('[pwa] SW 注册失败', err));
    }
  }, []);
  return null;
}
