import { useMemo, useState } from 'react';
import { Thumbnail } from '@remotion/player';
import type { Design, Preset, Project, VideoProps } from '../../../src/shared/types';
import { DIMENSIONS } from '../../../src/shared/types';
import { buildTiming } from '../../../src/shared/timing';
import { ACCENTS, PRESETS, normalizeDesign } from '../../../src/video/theme';
import { InfoVideo } from '../../../src/video/Video';
import { api, fileUrl } from '../api';
import type { EditorCtx } from './Editor';

function PresetThumb({ project, preset, sceneIndex }: { project: Project; preset: Preset; sceneIndex: number }) {
  const props = useMemo<VideoProps>(() => {
    const accent = preset === project.design.preset ? project.design.accent : PRESETS[preset].defaultAccent;
    const p: Project = { ...project, design: { ...project.design, preset, accent }, narration: { ...project.narration, enabled: false } };
    return { project: p, timing: buildTiming(p), layer: 'all', base: window.location.origin };
  }, [project, preset]);
  const dim = DIMENSIONS[project.format];
  const t = props.timing.scenes[sceneIndex] || props.timing.scenes[0];
  return (
    <Thumbnail
      component={InfoVideo as any}
      inputProps={props}
      compositionWidth={dim.width}
      compositionHeight={dim.height}
      durationInFrames={Math.max(1, props.timing.totalFrames)}
      fps={props.timing.fps}
      frameToDisplay={t ? t.start + Math.min(t.frames - 1, 45) : 0}
      style={{ width: '100%' }}
    />
  );
}

export function DesignPanel({ ctx }: { ctx: EditorCtx }) {
  const { project: p, update } = ctx;
  const d = normalizeDesign(p.design);
  const set = (patch: Partial<Design>) => update((q) => ({ ...q, design: { ...normalizeDesign(q.design), ...patch } }));
  const [err, setErr] = useState('');
  const shorts = p.format === 'shorts';

  const uploadMascot = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    try {
      const r = await api<{ src: string }>(`/api/projects/${p.id}/media?name=${encodeURIComponent(f.name)}`, { method: 'PUT', raw: f });
      set({ mascot: r.src });
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="insp">
      <div className={`presets ${p.format}`} role="radiogroup">
        {(Object.keys(PRESETS) as Preset[]).map((k) => (
          <button key={k} role="radio" aria-checked={d.preset === k} onClick={() => set({ preset: k, accent: d.preset === k ? d.accent : PRESETS[k].defaultAccent })}>
            <div className="pthumb" style={{ aspectRatio: shorts ? '9/16' : '16/9' }}>{p.scenes.length > 0 && <PresetThumb project={p} preset={k} sceneIndex={ctx.current} />}</div>
            <span>{PRESETS[k].name}</span>
          </button>
        ))}
      </div>

      <div className="opt"><span>강조색</span>
        <div className="swatches" role="radiogroup">
          {ACCENTS.map((a) => <button key={a.hex} role="radio" aria-checked={d.accent.toLowerCase() === a.hex.toLowerCase()} aria-label={a.name} title={a.name} style={{ background: a.hex }} onClick={() => set({ accent: a.hex })} />)}
          <input type="color" aria-label="직접 고르기" value={d.accent} onChange={(e) => set({ accent: e.target.value })} />
        </div>
      </div>

      {shorts && (
        <>
          <label className="opt"><span>위쪽 제목</span><input type="checkbox" checked={d.headline} onChange={(e) => set({ headline: e.target.checked })} /></label>
          {d.headline && (
            <div className="vgrid">
              <label>1줄<input className="in" value={p.headline.line1} onChange={(e) => update((q) => ({ ...q, headline: { ...q.headline, line1: e.target.value } }))} /></label>
              <label>2줄<input className="in" value={p.headline.line2 || ''} onChange={(e) => update((q) => ({ ...q, headline: { ...q.headline, line2: e.target.value || undefined } }))} /></label>
            </div>
          )}
        </>
      )}
      <div className="opt"><span>자막 크기</span><div className="seg">{([[0.85, '작게'], [1, '보통'], [1.15, '크게']] as const).map(([v, n]) => <button key={v} aria-pressed={d.captionScale === v} onClick={() => set({ captionScale: v })}>{n}</button>)}</div></div>
      <div className="opt"><span>자막 모양</span><div className="seg"><button aria-pressed={d.captionStyle === 'outline'} onClick={() => set({ captionStyle: 'outline' })}>외곽선</button><button aria-pressed={d.captionStyle === 'box'} onClick={() => set({ captionStyle: 'box' })}>검은 상자</button></div></div>
      {!shorts && <label className="opt"><span>장 라벨</span><input type="checkbox" checked={d.chapterLabel} onChange={(e) => set({ chapterLabel: e.target.checked })} /></label>}
      <label className="opt"><span>출처 표시</span><input type="checkbox" checked={d.showSource} onChange={(e) => set({ showSource: e.target.checked })} /></label>
      <div className="opt"><span>장면 전환</span><div className="seg"><button aria-pressed={d.transition === 'cut'} onClick={() => set({ transition: 'cut' })}>컷</button><button aria-pressed={d.transition === 'fade'} onClick={() => set({ transition: 'fade' })}>페이드</button></div></div>
      <label className="opt"><span>사진 천천히 확대</span><input type="checkbox" checked={d.drift} onChange={(e) => set({ drift: e.target.checked })} /></label>
      <div className="opt"><span>캐릭터 PNG</span>
        <div className="row">
          {d.mascot && <img src={fileUrl(d.mascot)} alt="" style={{ height: 32 }} />}
          <label className="btn sm">{d.mascot ? '바꾸기' : '넣기'}<input type="file" accept="image/png,image/webp" hidden onChange={(e) => void uploadMascot(e.target.files)} /></label>
          {d.mascot && <button className="btn ghost sm" onClick={() => set({ mascot: null })}>빼기</button>}
        </div>
      </div>
      {d.mascot && <div className="opt"><span>캐릭터 위치</span><div className="seg"><button aria-pressed={d.mascotSide === 'left'} onClick={() => set({ mascotSide: 'left' })}>왼쪽</button><button aria-pressed={d.mascotSide === 'right'} onClick={() => set({ mascotSide: 'right' })}>오른쪽</button></div></div>}
      {err && <p className="msg err">{err}</p>}
    </div>
  );
}
