import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCAL, api, fileUrl } from '../api';
import { Icon } from '../icons';

const KIND: Record<string, string> = { sfx: '효과음', bgm: '배경음악', mogrt: 'MOGRT', image: '사진', video: '영상', lut: 'LUT', font: '글꼴', preset: '프리셋' };
const ROLE: Record<string, string> = { count: '숫자', reveal: '정리', chapter: '장 전환', cut: '컷' };

export function AssetsPage() {
  const [data, setData] = useState<{ folders: string[]; assets: any[] } | null>(null);
  const [folders, setFolders] = useState('');
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState<{ a: HTMLAudioElement; id: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = (refresh = false) => api<any>(`/api/assets${refresh ? '?refresh=1' : ''}`).then((d) => { setData(d); setFolders(d.folders.join('\n')); }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); return () => playing?.a.pause(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const a of data?.assets || []) (g[a.kind] ||= []).push(a);
    return g;
  }, [data]);

  const play = (a: any) => {
    playing?.a.pause();
    if (playing?.id === a.id) { setPlaying(null); return; }
    const el = new Audio(fileUrl(a.url));
    el.onended = () => setPlaying(null);
    void el.play();
    setPlaying({ a: el, id: a.id });
  };
  const add = async (files: FileList | null) => {
    setErr('');
    try { for (const f of Array.from(files || [])) await api(`/api/assets?name=${encodeURIComponent(f.name)}`, { method: 'PUT', raw: f }); }
    catch (e) { setErr((e as Error).message); }
    void load();
  };

  return (
    <>
      <div className="head">
        <h1>{LOCAL ? '소리' : '에셋'}</h1>
        {LOCAL && (
          <div className="row">
            <button className="btn" onClick={() => file.current?.click()}><Icon name="plus" />소리 파일 추가</button>
            <input ref={file} type="file" accept="audio/*" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
          </div>
        )}
      </div>
      {err && <p className="msg err">{err}</p>}
      {!LOCAL && (
        <div className="f">
          <label>폴더 (한 줄에 하나)</label>
          <textarea className="in mono" rows={4} value={folders} onChange={(e) => setFolders(e.target.value)} />
          <div className="row">
            <button className="btn" onClick={async () => { await api('/api/settings', { body: { assetFolders: folders.split('\n').map((x) => x.trim()).filter(Boolean) } }); void load(true); }}>저장 후 다시 읽기</button>
            <span className="dim">{data ? `파일 ${data.assets.length}개` : ''}</span>
          </div>
        </div>
      )}
      {LOCAL && <p className="msg">25초가 넘는 파일은 배경음악으로 분류됩니다.</p>}
      {Object.keys(KIND).filter((k) => groups[k]?.length).map((k) => (
        <section key={k}>
          <h2>{KIND[k]} <span className="dim">{groups[k].length}</span></h2>
          <ul className="alist">
            {groups[k].slice(0, 300).map((a) => (
              <li key={a.id}>
                {(k === 'sfx' || k === 'bgm') ? <button className="btn ghost icon" aria-label="듣기" onClick={() => play(a)}><Icon name={playing?.id === a.id ? 'stop' : 'play'} /></button> : <span className="sp" />}
                <span className="n" title={a.path}>{a.name}</span>
                {a.roles?.length ? <span className="dim">{a.roles.map((r: string) => ROLE[r]).join(', ')}</span> : null}
                <span className="dim num">{a.seconds ? `${a.seconds.toFixed(1)}초` : a.size ? `${Math.round(a.size / 1024)}KB` : ''}</span>
                {a.removable && <button className="btn ghost icon" aria-label="삭제" onClick={async () => { await api(`/api/assets?ref=${encodeURIComponent(a.url)}`, { method: 'DELETE' }); void load(); }}><Icon name="trash" /></button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
