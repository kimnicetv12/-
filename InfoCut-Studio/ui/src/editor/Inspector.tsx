import { useLayoutEffect, useRef, useState } from 'react';
import type { Scene, SfxRole, Visual, VisualType } from '../../../src/shared/types';
import { SFX_ROLES } from '../../../src/shared/sfx';
import { useJob } from '../api';
import type { EditorCtx } from './Editor';
import { JobView } from './JobView';
import { MediaPicker } from './MediaPicker';
import { VTYPES } from './SceneList';
import { VisualEditor, blankVisual } from './VisualEditor';

function AutoText({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(56, el.scrollHeight + 2)}px`;
  }, [value]);
  return <textarea ref={ref} className="in script" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Inspector({ ctx, scene: s, index }: { ctx: EditorCtx; scene: Scene; index: number }) {
  const { project: p } = ctx;
  const [picker, setPicker] = useState<null | 'media' | 'left' | 'right'>(null);
  const [ask, setAsk] = useState('');
  const [scope, setScope] = useState<'scene' | 'all'>('scene');
  const revise = useJob((j) => { ctx.lock(false); if (j.status === 'done') setAsk(''); });
  const patch = (fn: (s: Scene) => Scene) => ctx.patchScene(s.id, fn);
  const opt = (v: string) => v || undefined;

  const run = async () => {
    await ctx.reload();
    ctx.lock(true);
    void revise.start(`/api/projects/${p.id}/revise`, { instruction: ask, sceneIds: scope === 'scene' ? [s.id] : undefined });
  };

  return (
    <fieldset className="insp" disabled={ctx.locked}>
      {!ctx.mobile && <h3>장면 {index + 1}</h3>}
      <label>문장 (자막)
        <AutoText value={s.text} onChange={(v) => patch((x) => ({ ...x, text: v }))} placeholder="/ 를 넣은 자리에서 자막이 끊깁니다" />
      </label>
      <label>화면
        <select className="in" value={s.visual.type} onChange={(e) => patch((x) => ({ ...x, visual: blankVisual(e.target.value as VisualType, x) }))}>
          {VTYPES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      <div className="vedit">
        <VisualEditor visual={s.visual} onChange={(v) => patch((x) => ({ ...x, visual: v }))} onPick={setPicker} />
      </div>

      <h4>세부</h4>
      <div className="vgrid">
        <label>출처 표시<input className="in" value={s.source || ''} onChange={(e) => patch((x) => ({ ...x, source: opt(e.target.value) }))} /></label>
        <label>사진 검색어<input className="in" value={s.query || ''} onChange={(e) => patch((x) => ({ ...x, query: opt(e.target.value) }))} /></label>
      </div>
      <label>발음 (목소리가 대신 읽을 문장)<input className="in" value={s.say || ''} onChange={(e) => patch((x) => ({ ...x, say: opt(e.target.value) }))} /></label>
      <div className="vgrid">
        <label>길이 (초)<input className="in" type="number" min={0.5} step={0.1} placeholder="자동" value={s.duration ?? ''} onChange={(e) => patch((x) => ({ ...x, duration: e.target.value ? Number(e.target.value) : undefined }))} /></label>
        <label>끝 여백 (초)<input className="in" type="number" min={0} step={0.05} placeholder="0.25" value={s.hold ?? ''} onChange={(e) => patch((x) => ({ ...x, hold: e.target.value === '' ? undefined : Number(e.target.value) }))} /></label>
      </div>
      <div className="vgrid">
        <label>효과음
          <select className="in" value={s.sfx === undefined ? 'auto' : s.sfx === null ? 'none' : s.sfx} onChange={(e) => patch((x) => ({ ...x, sfx: e.target.value === 'auto' ? undefined : e.target.value === 'none' ? null : (e.target.value as SfxRole) }))}>
            <option value="auto">자동</option>
            <option value="none">없음</option>
            {SFX_ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="chk end"><input type="checkbox" checked={!!s.mute} onChange={(e) => patch((x) => ({ ...x, mute: e.target.checked || undefined }))} />목소리 끄기</label>
      </div>
      <label>메모<input className="in" value={s.note || ''} onChange={(e) => patch((x) => ({ ...x, note: opt(e.target.value) }))} /></label>

      <h4>AI 수정</h4>
      <textarea className="in" rows={2} placeholder="예: 더 짧게, 표로 바꾸기" value={ask} onChange={(e) => setAsk(e.target.value)} />
      <div className="row">
        <div className="seg"><button aria-pressed={scope === 'scene'} onClick={() => setScope('scene')}>이 장면</button><button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>대본 전체</button></div>
        <button className="btn" disabled={!ask.trim() || revise.busy} onClick={run}>고치기</button>
      </div>
      <JobView job={revise.job} />

      {picker && (
        <MediaPicker
          projectId={p.id}
          query={s.query || ''}
          onClose={() => setPicker(null)}
          onPick={(m) => {
            patch((x) => {
              const v: any = structuredClone(x.visual);
              if (picker === 'left' || picker === 'right') v[picker] = { ...v[picker], media: m };
              else v.media = m;
              return { ...x, visual: v as Visual };
            });
            setPicker(null);
          }}
        />
      )}
    </fieldset>
  );
}
