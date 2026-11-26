import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// 原站用 Service Worker 预缓存应用外壳 + 按需缓存模型，做到「装过一次就能离线玩」。
// 这里只在生产构建后注册；dev 下不注册，避免热更新被缓存挡住。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[pwa] SW 注册失败', err));
  });
}
