import { useEffect, useRef, useState } from 'react';
import type { MediaRef } from '../../../src/shared/types';
import { LOCAL, api } from '../api';
import { Icon } from '../icons';

const SOURCES = [
  { id: 'upload', name: LOCAL ? '휴대폰' : '파일' },
  ...(LOCAL ? [] : [{ id: 'mine', name: '내 에셋' }]),
  { id: 'wikimedia', name: '위키미디어' },
  { id: 'pexels', name: 'Pexels' },
  { id: 'pexels-video', name: 'Pexels 영상' },
  { id: 'pixabay', name: 'Pixabay' },
];

interface Hit { id: string; source: string; kind: 'image' | 'video'; thumb: string; url: string; title: string; credit: string; license: string }

export function MediaPicker({ projectId, query, onPick, onClose }: { projectId: string; query: string; onPick: (m: MediaRef) => void; onClose: () => void }) {
  const [src, setSrc] = useState(query ? 'wikimedia' : 'upload');
  const [q, setQ] = useState(query);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const search = async (source = src, text = q) => {
    if (source === 'upload') return;
    setBusy(true); setErr(''); setHits(null);
    try { setHits(await api<Hit[]>(`/api/media/search?source=${source}&q=${encodeURIComponent(text)}`)); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { setHits(null); setErr(''); if (src !== 'upload' && (q || src === 'mine')) void search(src); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const choose = async (h: Hit) => {
    setBusy(true); setErr('');
    try {
      const r = await api<{ src: string }>(`/api/projects/${projectId}/media/fetch`, { body: { url: h.url, hint: q || h.title } });
      onPick({ src: r.src, kind: h.kind, credit: `${h.credit}${h.license && !h.credit.includes(h.license) ? ` / ${h.license}` : ''}` });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const upload = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const r = await api<{ src: string }>(`/api/projects/${projectId}/media?name=${encodeURIComponent(f.name)}`, { method: 'PUT', raw: f });
      onPick({ src: r.src, kind: f.type.startsWith('video') ? 'video' : 'image', credit: '직접 올린 파일' });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="사진, 영상 고르기">
        <div className="modal-head">
          <div className="seg scroll">{SOURCES.map((s) => <button key={s.id} aria-pressed={src === s.id} onClick={() => setSrc(s.id)}>{s.name}</button>)}</div>
          <button className="btn ghost icon" aria-label="닫기" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          {src === 'upload' ? (
            <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}>
              <input ref={file} type="file" accept="image/*,video/*" hidden onChange={(e) => void upload(e.target.files)} />
              <button className="btn" disabled={busy} onClick={() => file.current?.click()}>{busy ? '넣는 중' : '파일 고르기'}</button>
            </div>
          ) : (
            <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); void search(); }}>
              <input className="in grow" placeholder={src === 'mine' ? '파일 이름' : '검색어 (영어)'} value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn" disabled={busy}>찾기</button>
            </form>
          )}
          {err && <p className="msg err">{err}</p>}
          {hits && hits.length === 0 && <p className="msg">결과 없음</p>}
          {hits && hits.length > 0 && (
            <div className="hits">
              {hits.map((h) => (
                <button key={h.id} className="hit" onClick={() => choose(h)} disabled={busy} title={`${h.title}\n${h.credit}`}>
                  {h.kind === 'video' && h.source === 'mine' ? <video src={h.thumb} muted /> : <img src={h.thumb} alt="" loading="lazy" />}
                  <span>{h.license}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
