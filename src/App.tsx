/**
 * 极简路由：不装 react-router，直接看 pathname。
 * 原站用 TanStack Router 做文件路由 + 每个页面一个 lazy chunk；
 * 教学版只有三页，直白地写反而更能看清「内容站 / 应用」是怎么分开的。
 */
import Home from './pages/Home';
import Check from './pages/Check';
import Play from './pages/Play';

function currentPage(): 'home' | 'check' | 'play' {
  const p = window.location.pathname;
  if (p.startsWith('/app/check')) return 'check';
  if (p.startsWith('/app/play')) return 'play';
  return 'home';
}

export default function App() {
  const page = currentPage();
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-dot" />
          Motion Lab
          <small>体感实验台</small>
        </a>
        <nav>
          <a href="/" className={page === 'home' ? 'active' : ''}>内容站</a>
          <a href="/app" className={page === 'home' ? 'active' : ''}>游戏大厅</a>
          <a href="/app/check" className={page === 'check' ? 'active' : ''}>设备检测</a>
        </nav>
        <span className="badge">净室教学复刻 · 仅供本地学习</span>
      </header>

      <main>
        {page === 'play' ? <Play /> : page === 'check' ? <Check /> : <Home />}
      </main>

      <footer className="foot">
        摄像头画面只在本机处理，不上传 · 项目为架构学习用途，素材来自 dongdongpark.com
      </footer>
    </div>
  );
}
