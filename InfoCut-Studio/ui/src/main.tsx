import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { LOCAL, useMobile } from './api';
import { Icon } from './icons';
import { Home } from './pages/Home';
import { SettingsPage } from './pages/Settings';
import { AssetsPage } from './pages/Assets';
import { Editor } from './editor/Editor';
import { setSrcResolver } from '../../src/video/parts';
import { urlOf } from './local/files';

if (LOCAL) {
  setSrcResolver(urlOf);
  void import('./local/native').then((n) => n.installNativeHttp());
}

type Route = { name: 'home' } | { name: 'settings' } | { name: 'assets' } | { name: 'project'; id: string };

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('p/')) return { name: 'project', id: h.slice(2) };
  if (h === 'settings') return { name: 'settings' };
  if (h === 'assets') return { name: 'assets' };
  return { name: 'home' };
}

export const go = (to: string) => { location.hash = to; };

function App() {
  const [route, setRoute] = useState<Route>(parse);
  const mobile = useMobile();
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('mobile', mobile); }, [mobile]);

  if (route.name === 'project') return <Editor key={route.id} id={route.id} mobile={mobile} />;
  const nav: [Route['name'], string, string][] = [['home', '', '프로젝트'], ['assets', 'assets', LOCAL ? '소리' : '에셋'], ['settings', 'settings', '설정']];
  return (
    <div className="app">
      <header className="bar">
        <span className="brand">InfoCut</span>
        <nav className="nav">
          {nav.map(([name, to, label]) => <button key={name} aria-current={route.name === name ? 'page' : undefined} onClick={() => go(to)}>{label}</button>)}
        </nav>
      </header>
      <main className="page">
        {route.name === 'home' && <Home mobile={mobile} />}
        {route.name === 'settings' && <SettingsPage />}
        {route.name === 'assets' && <AssetsPage />}
      </main>
    </div>
  );
}

export { Icon };
createRoot(document.getElementById('root')!).render(<App />);
