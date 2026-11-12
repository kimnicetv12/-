import { useEffect, useRef, useState } from 'react';
import { api, relTime } from '../api';
import { Icon } from '../icons';
import { go } from '../main';
import { PRESETS } from '../../../src/video/theme';

interface Item { id: string; title: string; format: 'shorts' | 'long'; scenes: number; updatedAt: string; rendered: boolean; preset: string }

export function Home({ mobile }: { mobile: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const load = () => api<any>('/api/state').then((s) => {
    setItems(s.projects);
    setNoKey(!['anthropic', 'gemini', 'openai'].some((k) => s.settings.hasKey[k]));
  }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, []);

  const create = async (format: 'shorts' | 'long', sample = false) => {
    try { go(`p/${(await api<any>('/api/projects', { body: { format, sample } })).id}`); }
    catch (e) { setErr((e as Error).message); }
  };
  const importPack = async (f?: File) => {
    if (!f) return;
    setErr('');
    try { go(`p/${(await api<any>('/api/import', { raw: f })).id}`); }
    catch (e) { setErr((e as Error).message); }
  };
  const remove = async (p: Item) => {
    if (!confirm(`"${p.title}" 삭제`)) return;
    await api(`/api/projects/${p.id}`, { method: 'DELETE' });
    void load();
  };

  return (
    <>
      <div className="head">
        <h1>프로젝트</h1>
        <div className="row">
          <button className="btn" onClick={() => create('shorts')}><Icon name="plus" />쇼츠</button>
          <button className="btn" onClick={() => create('long')}><Icon name="plus" />롱폼</button>
          <button className="btn" onClick={() => file.current?.click()}><Icon name="folder" />가져오기</button>
          <input ref={file} type="file" accept=".infocut,application/zip,application/octet-stream" hidden onChange={(e) => { void importPack(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
      {err && <p className="msg err">{err}</p>}
      {noKey && <p className="msg">AI 키 없음. <a href="#settings">설정</a>에서 넣으면 조사와 대본 쓰기를 쓸 수 있습니다.</p>}
      {items === null ? null : items.length === 0 ? (
        <div className="empty">
          <p>프로젝트 없음</p>
          <div className="row">
            <button className="btn ghost" onClick={() => create('shorts', true)}>예시 쇼츠</button>
            <button className="btn ghost" onClick={() => create('long', true)}>예시 롱폼</button>
          </div>
        </div>
      ) : mobile ? (
        <ul className="plist-m">
          {items.map((p) => (
            <li key={p.id} onClick={() => go(`p/${p.id}`)}>
              <div className="t">{p.title}</div>
              <div className="d">{p.format === 'shorts' ? '쇼츠' : '롱폼'}<span>장면 {p.scenes}</span><span>{relTime(p.updatedAt)}</span>{p.rendered && <span>렌더됨</span>}</div>
              <button className="btn ghost icon" aria-label="삭제" onClick={(e) => { e.stopPropagation(); void remove(p); }}><Icon name="trash" /></button>
            </li>
          ))}
        </ul>
      ) : (
        <table className="plist">
          <thead><tr><th>제목</th><th>형식</th><th>장면</th><th>디자인</th><th>렌더</th><th>수정</th><th /></tr></thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} onClick={() => go(`p/${p.id}`)}>
                <td className="t">{p.title}</td>
                <td>{p.format === 'shorts' ? '쇼츠' : '롱폼'}</td>
                <td>{p.scenes}</td>
                <td>{(PRESETS as any)[p.preset]?.name || p.preset}</td>
                <td>{p.rendered ? '있음' : ''}</td>
                <td>{relTime(p.updatedAt)}</td>
                <td className="act">
                  <button className="btn ghost icon" title="복제" onClick={async (e) => { e.stopPropagation(); await api(`/api/projects/${p.id}/duplicate`, { body: {} }); void load(); }}><Icon name="copy" /></button>
                  <button className="btn ghost icon" title="삭제" onClick={(e) => { e.stopPropagation(); void remove(p); }}><Icon name="trash" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
