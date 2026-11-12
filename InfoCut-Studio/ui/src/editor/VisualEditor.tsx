import type { MediaRef, Scene, Visual, VisualType } from '../../../src/shared/types';
import { fileUrl } from '../api';
import { Icon } from '../icons';

export function mediaOf(v: Visual): MediaRef | undefined {
  return 'media' in v ? v.media : undefined;
}

const plain = (s: Scene) => s.text.replace(/\s*\/\s*/g, ' ').trim();

/** 화면 종류를 바꿀 때 쓸 수 있는 내용은 이어 받는다 */
export function blankVisual(type: VisualType, s: Scene): Visual {
  const media = mediaOf(s.visual);
  const head = ('heading' in s.visual && s.visual.heading) || ('title' in s.visual && (s.visual as any).title) || plain(s).slice(0, 28);
  switch (type) {
    case 'title': return { type, heading: head, media };
    case 'media': return { type, media };
    case 'stat': return { type, value: '0', label: head, media };
    case 'bars': return { type, title: head, unit: '', items: [{ label: '항목 1', value: 10, highlight: true }, { label: '항목 2', value: 6 }, { label: '항목 3', value: 3 }] };
    case 'table': return { type, title: head, columns: ['항목', '값'], rows: [['A', '1'], ['B', '2']] };
    case 'quote': return { type, text: plain(s), by: '' };
    case 'list': return { type, title: head, items: ['', '', ''] };
    case 'compare': return { type, left: { title: 'A', points: [''] }, right: { title: 'B', points: [''] } };
    case 'timeline': return { type, title: head, items: [{ when: '', what: '' }, { when: '', what: '' }, { when: '', what: '' }] };
    case 'chapter': return { type, index: 1, heading: head };
    case 'text': return { type, heading: head, body: '' };
  }
}

interface Props { visual: Visual; onChange: (v: Visual) => void; onPick: (slot: 'media' | 'left' | 'right') => void }

const lines = (s: string) => s.split('\n');

export function VisualEditor({ visual: v, onChange, onPick }: Props) {
  const set = (patch: Partial<Visual>) => onChange({ ...v, ...patch } as Visual);
  const mediaRow = (m: MediaRef | undefined, slot: 'media' | 'left' | 'right', onClear: () => void) => (
    <div className="media-row">
      {m?.src ? (m.kind === 'video' ? <video className="thumb" src={fileUrl(m.src)} muted onClick={() => onPick(slot)} /> : <img className="thumb" src={fileUrl(m.src)} alt="" onClick={() => onPick(slot)} />) : null}
      <button className="btn sm" onClick={() => onPick(slot)}><Icon name="image" />{m?.src ? '바꾸기' : '사진, 영상 넣기'}</button>
      {m?.src && <button className="btn ghost sm" onClick={onClear}>빼기</button>}
    </div>
  );
  const x = <Icon name="close" size={14} />;

  switch (v.type) {
    case 'title':
      return (<>
        <label>큰 제목<input className="in" value={v.heading} onChange={(e) => set({ heading: e.target.value })} /></label>
        <label>부제<input className="in" value={v.sub || ''} onChange={(e) => set({ sub: e.target.value || undefined })} /></label>
        {mediaRow(v.media, 'media', () => set({ media: undefined }))}
      </>);
    case 'media':
      return (<>
        {mediaRow(v.media, 'media', () => set({ media: undefined }))}
        <div className="vgrid">
          <label>이름표<input className="in" value={v.label || ''} onChange={(e) => set({ label: e.target.value || undefined })} /></label>
          <label>맞춤
            <select className="in" value={v.media?.fit || 'cover'} onChange={(e) => v.media && set({ media: { ...v.media, fit: e.target.value as 'cover' | 'contain' } })}>
              <option value="cover">채우기</option>
              <option value="contain">전체 보이기</option>
            </select>
          </label>
        </div>
        {v.media?.kind === 'video' && <label>시작 위치 (초)<input className="in" type="number" min={0} step={0.1} value={v.media.start || 0} onChange={(e) => set({ media: { ...v.media!, start: Number(e.target.value) } })} /></label>}
      </>);
    case 'stat':
      return (<>
        <div className="vgrid">
          <label>숫자<input className="in" placeholder="43%" value={v.value} onChange={(e) => set({ value: e.target.value })} /></label>
          <label>이전 값<input className="in" placeholder="30명 중 13명" value={v.before || ''} onChange={(e) => set({ before: e.target.value || undefined })} /></label>
        </div>
        <label>설명<input className="in" value={v.label} onChange={(e) => set({ label: e.target.value })} /></label>
      </>);
    case 'bars':
      return (<>
        <div className="vgrid">
          <label>제목<input className="in" value={v.title || ''} onChange={(e) => set({ title: e.target.value })} /></label>
          <label>단위<input className="in" value={v.unit || ''} onChange={(e) => set({ unit: e.target.value })} /></label>
        </div>
        <table className="mini-table">
          <tbody>
            {v.items.map((it, i) => (
              <tr key={i}>
                <td style={{ width: '50%' }}><input value={it.label} aria-label="항목" onChange={(e) => set({ items: v.items.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></td>
                <td><input type="number" value={it.value} aria-label="값" onChange={(e) => set({ items: v.items.map((x, k) => (k === i ? { ...x, value: Number(e.target.value) } : x)) })} /></td>
                <td style={{ width: 80 }}><label className="chk"><input type="checkbox" checked={!!it.highlight} onChange={(e) => set({ items: v.items.map((x, k) => (k === i ? { ...x, highlight: e.target.checked } : x)) })} />강조</label></td>
                <td style={{ width: 30 }}><button className="btn ghost icon" onClick={() => set({ items: v.items.filter((_, k) => k !== i) })}>{x}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div><button className="btn ghost sm" onClick={() => set({ items: [...v.items, { label: '', value: 0 }] })}>항목 추가</button></div>
      </>);
    case 'table':
      return (<>
        <label>제목<input className="in" value={v.title || ''} onChange={(e) => set({ title: e.target.value })} /></label>
        <table className="mini-table">
          <tbody>
            <tr>{v.columns.map((c, ci) => <td key={ci}><input style={{ fontWeight: 700 }} value={c} onChange={(e) => set({ columns: v.columns.map((x, k) => (k === ci ? e.target.value : x)) })} /></td>)}<td style={{ width: 30 }} /></tr>
            {v.rows.map((r, ri) => (
              <tr key={ri}>
                {v.columns.map((_, ci) => <td key={ci}><input value={r[ci] ?? ''} onChange={(e) => set({ rows: v.rows.map((row, k) => (k === ri ? v.columns.map((__, c2) => (c2 === ci ? e.target.value : row[c2] ?? '')) : row)) })} /></td>)}
                <td><button className="btn ghost icon" onClick={() => set({ rows: v.rows.filter((_, k) => k !== ri) })}>{x}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button className="btn ghost sm" onClick={() => set({ rows: [...v.rows, v.columns.map(() => '')] })}>행 추가</button>
          <button className="btn ghost sm" onClick={() => set({ columns: [...v.columns, '새 열'], rows: v.rows.map((r) => [...r, '']) })}>열 추가</button>
          {v.columns.length > 2 && <button className="btn ghost sm" onClick={() => set({ columns: v.columns.slice(0, -1), rows: v.rows.map((r) => r.slice(0, v.columns.length - 1)) })}>열 빼기</button>}
          <label className="inline">강조 행
            <select className="in" style={{ width: 'auto' }} value={v.highlightRow ?? ''} onChange={(e) => set({ highlightRow: e.target.value === '' ? undefined : Number(e.target.value) })}>
              <option value="">없음</option>
              {v.rows.map((r, i) => <option key={i} value={i}>{i + 1}. {r[0]}</option>)}
            </select>
          </label>
        </div>
      </>);
    case 'quote':
      return (<>
        <label>인용문<textarea className="in" rows={3} value={v.text} onChange={(e) => set({ text: e.target.value })} /></label>
        <label>출처<input className="in" value={v.by || ''} onChange={(e) => set({ by: e.target.value })} /></label>
      </>);
    case 'list':
      return (<>
        <label>제목<input className="in" value={v.title || ''} onChange={(e) => set({ title: e.target.value })} /></label>
        <label>항목 (한 줄에 하나)<textarea className="in" rows={4} value={v.items.join('\n')} onChange={(e) => set({ items: lines(e.target.value) })} /></label>
      </>);
    case 'compare':
      return (
        <div className="vgrid">
          {(['left', 'right'] as const).map((side) => (
            <div key={side} style={{ display: 'grid', gap: 8 }}>
              <label>{side === 'left' ? '왼쪽' : '오른쪽'} 제목<input className="in" value={v[side].title} onChange={(e) => set({ [side]: { ...v[side], title: e.target.value } } as any)} /></label>
              <label>특징 (한 줄에 하나)<textarea className="in" rows={3} value={v[side].points.join('\n')} onChange={(e) => set({ [side]: { ...v[side], points: lines(e.target.value) } } as any)} /></label>
              {mediaRow(v[side].media, side, () => set({ [side]: { ...v[side], media: undefined } } as any))}
            </div>
          ))}
        </div>
      );
    case 'timeline':
      return (<>
        <label>제목<input className="in" value={v.title || ''} onChange={(e) => set({ title: e.target.value })} /></label>
        <table className="mini-table">
          <tbody>
            {v.items.map((it, i) => (
              <tr key={i}>
                <td style={{ width: 140 }}><input placeholder="언제" value={it.when} onChange={(e) => set({ items: v.items.map((x, k) => (k === i ? { ...x, when: e.target.value } : x)) })} /></td>
                <td><input placeholder="무슨 일" value={it.what} onChange={(e) => set({ items: v.items.map((x, k) => (k === i ? { ...x, what: e.target.value } : x)) })} /></td>
                <td style={{ width: 30 }}><button className="btn ghost icon" onClick={() => set({ items: v.items.filter((_, k) => k !== i) })}>{x}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div><button className="btn ghost sm" onClick={() => set({ items: [...v.items, { when: '', what: '' }] })}>항목 추가</button></div>
      </>);
    case 'chapter':
      return (
        <div className="vgrid">
          <label>몇 장<input className="in" type="number" min={1} value={v.index} onChange={(e) => set({ index: Number(e.target.value) })} /></label>
          <label>장 제목<input className="in" value={v.heading} onChange={(e) => set({ heading: e.target.value })} /></label>
        </div>
      );
    case 'text':
      return (<>
        <label>큰 글자<input className="in" value={v.heading} onChange={(e) => set({ heading: e.target.value })} /></label>
        <label>보충 설명<textarea className="in" rows={2} value={v.body || ''} onChange={(e) => set({ body: e.target.value || undefined })} /></label>
      </>);
  }
}
