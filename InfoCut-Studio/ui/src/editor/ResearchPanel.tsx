import { useState } from 'react';
import type { Research } from '../../../src/shared/types';
import { useJob } from '../api';
import type { EditorCtx } from './Editor';
import { JobView } from './JobView';

const LENGTHS = {
  shorts: [{ s: 30, n: '30초' }, { s: 45, n: '45초' }, { s: 60, n: '60초' }],
  long: [{ s: 180, n: '3분' }, { s: 300, n: '5분' }, { s: 480, n: '8분' }, { s: 720, n: '12분' }],
};

export function ResearchPanel({ ctx }: { ctx: EditorCtx }) {
  const { project: p, update } = ctx;
  const r = p.research;
  const [topic, setTopic] = useState(r?.topic || '');
  const [angle, setAngle] = useState(r?.angleHint || '');
  const [memo, setMemo] = useState(r?.memo || '');
  const [urls, setUrls] = useState('');
  const [seconds, setSeconds] = useState(p.format === 'shorts' ? 45 : 300);
  const [tone, setTone] = useState('');
  const research = useJob(() => ctx.lock(false));
  const script = useJob((j) => { ctx.lock(false); if (j.status === 'done') ctx.setTab('scene'); });
  const busy = research.busy || script.busy;
  const setR = (fn: (r: Research) => Research) => update((q) => ({ ...q, research: fn(q.research!) }));

  const startResearch = async () => {
    await ctx.reload();
    ctx.lock(true);
    void research.start(`/api/projects/${p.id}/research`, { topic, angleHint: angle, memo, urls: urls.split(/\s+/).filter((u) => /^https?:\/\//.test(u)) });
  };
  const startScript = async () => {
    if (p.scenes.length && !confirm('지금 대본을 새 대본으로 바꿉니다. 이전 대본은 기록에 남습니다.')) return;
    await ctx.reload();
    ctx.lock(true);
    void script.start(`/api/projects/${p.id}/script`, { seconds, tone });
  };

  return (
    <fieldset className="insp" disabled={busy}>
      <label>주제<input className="in" value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
      <label>방향<input className="in" value={angle} onChange={(e) => setAngle(e.target.value)} /></label>
      <label>참고 링크<input className="in" placeholder="https://" value={urls} onChange={(e) => setUrls(e.target.value)} /></label>
      <label>메모<textarea className="in" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      <div className="row"><button className="btn" disabled={!topic.trim() || busy} onClick={startResearch}>{r ? '다시 조사' : '조사 시작'}</button></div>
      <JobView job={research.job} />

      {r && (
        <>
          <h4>요약</h4>
          <p className="body">{r.summary}</p>

          <h4>사실 <span className="dim">{r.facts.filter((f) => f.use).length}/{r.facts.length} 사용</span></h4>
          <ul className="facts">
            {r.facts.map((f, i) => (
              <li key={i} className={f.use ? '' : 'off'}>
                <input type="checkbox" checked={f.use} aria-label="대본에 쓰기" onChange={(e) => setR((x) => ({ ...x, facts: x.facts.map((y, k) => (k === i ? { ...y, use: e.target.checked } : y)) }))} />
                <div>
                  <textarea className="fact" rows={Math.max(1, Math.ceil(f.text.length / (ctx.mobile ? 24 : 30)))} value={f.text} onChange={(e) => setR((x) => ({ ...x, facts: x.facts.map((y, k) => (k === i ? { ...y, text: e.target.value } : y)) }))} />
                  {(f.source || f.url) && <div className="src">{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.source || f.url}</a> : f.source}</div>}
                </div>
              </li>
            ))}
          </ul>
          <div className="row"><button className="btn ghost sm" onClick={() => setR((x) => ({ ...x, facts: [...x.facts, { text: '', use: true }] }))}>사실 추가</button></div>

          {r.numbers.length > 0 && (
            <>
              <h4>숫자</h4>
              <table className="kv"><tbody>{r.numbers.map((n, i) => <tr key={i}><td>{n.label}</td><td className="num">{n.value}</td></tr>)}</tbody></table>
            </>
          )}

          <h4>방향</h4>
          <div className="angles" role="radiogroup">
            {r.angles.map((a, i) => (
              <button key={i} role="radio" aria-checked={(r.chosenAngle ?? 0) === i} onClick={() => setR((x) => ({ ...x, chosenAngle: i }))}>
                <b>{a.title}</b>
                <span>{a.hook}</span>
              </button>
            ))}
          </div>

          <h4>대본</h4>
          <div className="opt"><span>길이</span><div className="seg">{LENGTHS[p.format].map((l) => <button key={l.s} aria-pressed={seconds === l.s} onClick={() => setSeconds(l.s)}>{l.n}</button>)}</div></div>
          <label className="opt"><span>나레이션</span><input type="checkbox" checked={p.narration.enabled} onChange={(e) => update((q) => ({ ...q, narration: { ...q.narration, enabled: e.target.checked } }))} /></label>
          <label>말투<input className="in" placeholder="예: 담담하게" value={tone} onChange={(e) => setTone(e.target.value)} /></label>
          <div className="row"><button className="btn" disabled={busy || !r.facts.some((f) => f.use)} onClick={startScript}>대본 쓰기</button></div>
          <JobView job={script.job} />

          {r.sources.length > 0 && (
            <>
              <h4>자료</h4>
              <ol className="links">{r.sources.slice(0, 30).map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ol>
            </>
          )}
        </>
      )}
    </fieldset>
  );
}
