import { useEffect, useRef } from 'react';
import type { Scene, VisualType } from '../../../src/shared/types';
import { fmtTime } from '../../../src/shared/timing';
import { Icon } from '../icons';
import type { EditorCtx } from './Editor';

export const VTYPES: { id: VisualType; name: string }[] = [
  { id: 'title', name: '제목' }, { id: 'media', name: '사진, 영상' }, { id: 'stat', name: '숫자' }, { id: 'bars', name: '막대 그래프' },
  { id: 'table', name: '표' }, { id: 'quote', name: '인용' }, { id: 'list', name: '목록' }, { id: 'compare', name: '비교' },
  { id: 'timeline', name: '타임라인' }, { id: 'text', name: '글' }, { id: 'chapter', name: '장 표지' },
];
const TYPE_NAME = Object.fromEntries(VTYPES.map((v) => [v.id, v.name]));
const newId = () => Math.random().toString(36).slice(2, 10);
const blank = (): Scene => ({ id: newId(), text: '', visual: { type: 'text', heading: '' } });

export function SceneList({ ctx, onOpen }: { ctx: EditorCtx; onOpen?: () => void }) {
  const { project: p, update, current, timing } = ctx;
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [current]);

  const setScenes = (fn: (s: Scene[]) => Scene[], snap?: string) => update((q) => ({ ...q, scenes: fn(q.scenes) }), snap);
  const add = () => { setScenes((l) => { const n = [...l]; n.splice(l.length ? current + 1 : 0, 0, blank()); return n; }); ctx.seek(p.scenes.length ? current + 1 : 0); onOpen?.(); };
  const dup = () => setScenes((l) => { const n = [...l]; n.splice(current + 1, 0, { ...structuredClone(l[current]), id: newId() }); return n; });
  const move = (d: number) => { const j = current + d; if (j < 0 || j >= p.scenes.length) return; setScenes((l) => { const n = [...l]; [n[current], n[j]] = [n[j], n[current]]; return n; }); ctx.seek(j); };
  const del = () => { setScenes((l) => l.filter((_, i) => i !== current), '장면 삭제'); ctx.seek(Math.max(0, current - 1)); };
  const none = !p.scenes.length;

  return (
    <div className="sl">
      <div className="sl-tools">
        <span className="dim num">{p.scenes.length}장면 {fmtTime(timing.totalFrames, timing.fps)}</span>
        <button className="btn ghost icon" title="장면 추가" disabled={ctx.locked} onClick={add}><Icon name="plus" /></button>
        <button className="btn ghost icon" title="복제" disabled={none || ctx.locked} onClick={dup}><Icon name="copy" /></button>
        <button className="btn ghost icon" title="위로" disabled={none || ctx.locked || current === 0} onClick={() => move(-1)}><Icon name="up" /></button>
        <button className="btn ghost icon" title="아래로" disabled={none || ctx.locked || current >= p.scenes.length - 1} onClick={() => move(1)}><Icon name="down" /></button>
        <button className="btn ghost icon" title="삭제" disabled={none || ctx.locked} onClick={del}><Icon name="trash" /></button>
      </div>
      {none ? (
        <div className="empty">
          <p>대본 없음</p>
          <div className="row">
            <button className="btn" onClick={() => ctx.setTab('research')}>조사부터</button>
            <button className="btn" onClick={() => { setScenes(() => [{ id: newId(), text: '', visual: { type: 'title', heading: p.title } }]); onOpen?.(); }}>직접 쓰기</button>
          </div>
        </div>
      ) : (
        <ol className="sl-list" ref={list}>
          {p.scenes.map((s, i) => (
            <li key={s.id} className={i === current ? 'on' : ''} onClick={() => { ctx.seek(i); onOpen?.(); }}>
              <span className="no num">{i + 1}</span>
              <span className="tx">{s.text.replace(/\s*\/\s*/g, ' ') || <i>빈 장면</i>}</span>
              <span className="meta">
                <span>{TYPE_NAME[s.visual.type]}</span>
                <span className="num">{timing.scenes[i] ? fmtTime(timing.scenes[i].start, p.fps) : ''}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
