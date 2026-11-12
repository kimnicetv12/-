import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Scene, Timing } from '../../../src/shared/types';
import { buildTiming, timingSignature } from '../../../src/shared/timing';
import { api, useJob, type JobState } from '../api';
import { Icon } from '../icons';
import { go } from '../main';
import { Preview, type PreviewHandle } from './Preview';
import { SceneList } from './SceneList';
import { Inspector } from './Inspector';
import { ResearchPanel } from './ResearchPanel';
import { DesignPanel } from './DesignPanel';
import { SoundPanel } from './SoundPanel';
import { ExportPanel } from './ExportPanel';
import { JobView } from './JobView';

export type Tab = 'research' | 'scene' | 'design' | 'sound' | 'export';

export interface EditorCtx {
  project: Project;
  timing: Timing;
  /** 목소리가 지금 대본과 맞는지 */
  timingFresh: boolean;
  mobile: boolean;
  update: (fn: (p: Project) => Project, snapshot?: string) => void;
  patchScene: (id: string, fn: (s: Scene) => Scene) => void;
  /** 저장한 뒤 서버 상태를 다시 읽는다 */
  reload: (onlyTiming?: boolean) => Promise<void>;
  setTab: (t: Tab) => void;
  current: number;
  seek: (sceneIndex: number) => void;
  /** AI 가 프로젝트를 고치는 동안 편집을 막는다 */
  locked: boolean;
  lock: (on: boolean) => void;
  voice: { job: JobState | null; busy: boolean; start: () => void };
}

const SAVE = { saved: '저장됨', saving: '저장 중', dirty: '', error: '저장 실패' };

export function Editor({ id, mobile }: { id: string; mobile: boolean }) {
  const [project, setProject] = useState<Project | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('scene');
  const [saved, setSaved] = useState<keyof typeof SAVE>('saved');
  const [current, setCurrent] = useState(0);
  const [locked, setLocked] = useState(false);
  const [sheet, setSheet] = useState(false);
  const pending = useRef<{ p: Project; snap?: string } | null>(null);
  const timer = useRef<number | null>(null);
  const preview = useRef<PreviewHandle>(null);

  const flush = useCallback(async () => {
    if (!pending.current) return;
    const { p, snap } = pending.current;
    pending.current = null;
    setSaved('saving');
    try {
      await api(`/api/projects/${p.id}`, { method: 'PUT', body: { project: p, snapshot: snap } });
      setSaved(pending.current ? 'dirty' : 'saved');
    } catch { setSaved('error'); }
  }, []);

  const load = useCallback(async (onlyTiming = false) => {
    const r = await api<any>(`/api/projects/${id}`);
    if (onlyTiming) setProject((p) => (p ? { ...p, timing: r.project.timing } : r.project));
    else setProject(r.project);
    return r.project as Project;
  }, [id]);

  useEffect(() => {
    load().then((p) => setTab(p.scenes.length ? 'scene' : 'research')).catch((e) => setErr(e.message));
    const beforeUnload = () => { if (pending.current) void flush(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); void flush(); };
  }, [load, flush]);

  const update = useCallback((fn: (p: Project) => Project, snapshot?: string) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      pending.current = { p: next, snap: snapshot || pending.current?.snap };
      setSaved('dirty');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), snapshot ? 50 : 700);
      return next;
    });
  }, [flush]);

  const reload = useCallback(async (onlyTiming = false) => {
    if (timer.current) window.clearTimeout(timer.current);
    await flush();
    await load(onlyTiming);
  }, [flush, load]);

  const voiceJob = useJob((j) => { if (j.status === 'done') void reload(true); });
  const timingFresh = !!project?.timing && project.timing.signature === timingSignature(project);
  const timing = useMemo(() => (project ? (timingFresh ? project.timing! : buildTiming(project)) : null), [project, timingFresh]);

  if (err) return <div className="app"><main className="page"><p className="msg err">{err}</p><a href="#">프로젝트 목록</a></main></div>;
  if (!project || !timing) return null;

  const ctx: EditorCtx = {
    project, timing, timingFresh, mobile, update, reload, setTab, current, locked,
    patchScene: (sid, fn) => update((p) => ({ ...p, scenes: p.scenes.map((s) => (s.id === sid ? fn(s) : s)) })),
    seek: (i) => { setCurrent(i); preview.current?.seekScene(i); },
    lock: (on) => { setLocked(on); if (!on) void reload(); },
    voice: { job: voiceJob.job, busy: voiceJob.busy, start: () => { void reload().then(() => voiceJob.start(`/api/projects/${project.id}/voice`)); } },
  };
  const scene = project.scenes[current];
  const voiceLine = project.narration.enabled && !timingFresh && project.scenes.length > 0 && (
    <div className="voice-line">
      {voiceJob.busy || voiceJob.job?.status === 'error' ? <JobView job={voiceJob.job} /> : <span>목소리 미반영, 길이는 추정값</span>}
      <button className="btn sm" disabled={voiceJob.busy || locked} onClick={ctx.voice.start}>목소리 만들기</button>
    </div>
  );
  const title = <input className="title" value={project.title} aria-label="제목" onChange={(e) => update((p) => ({ ...p, title: e.target.value }))} />;
  const panel = (t: Tab) => (
    t === 'research' ? <ResearchPanel ctx={ctx} />
      : t === 'design' ? <DesignPanel ctx={ctx} />
        : t === 'sound' ? <SoundPanel ctx={ctx} />
          : t === 'export' ? <ExportPanel ctx={ctx} />
            : scene ? <Inspector ctx={ctx} scene={scene} index={current} /> : <p className="msg">장면 없음</p>
  );

  if (mobile) {
    const tabs: [Tab, string][] = [['research', '조사'], ['scene', '편집'], ['design', '디자인'], ['sound', '소리'], ['export', '내보내기']];
    return (
      <div className={`med ${project.format}`}>
        <header className="bar">
          <button className="btn ghost icon" aria-label="목록" onClick={() => go('')}><Icon name="back" size={18} /></button>
          {title}
          <span className="save">{SAVE[saved]}</span>
        </header>
        <div className="med-pv">
          <Preview ref={preview} project={project} timing={timing} onScene={setCurrent} compact />
        </div>
        {voiceLine}
        <div className="med-panel">
          {tab === 'scene' ? <SceneList ctx={ctx} onOpen={() => setSheet(true)} /> : panel(tab)}
        </div>
        <nav className="med-tabs">
          {tabs.map(([t, n]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{n}</button>)}
        </nav>
        {sheet && scene && (
          <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
            <div className="sheet" role="dialog" aria-label="장면 편집">
              <div className="sheet-head"><b>장면 {current + 1}</b><button className="btn ghost icon" aria-label="닫기" onClick={() => setSheet(false)}><Icon name="close" size={18} /></button></div>
              <div className="sheet-body"><Inspector ctx={ctx} scene={scene} index={current} /></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const tabs: [Tab, string][] = [['scene', '장면'], ['research', '조사'], ['design', '디자인'], ['sound', '소리'], ['export', '내보내기']];
  return (
    <div className="ed">
      <header className="bar">
        <button className="btn ghost icon" title="프로젝트 목록" onClick={() => go('')}><Icon name="back" /></button>
        {title}
        <span className="fmt">{project.format === 'shorts' ? '쇼츠 1080×1920' : '롱폼 1920×1080'}</span>
        <span className="save">{SAVE[saved]}</span>
        <button className="btn rec" disabled={!project.scenes.length} onClick={() => setTab('export')}>내보내기</button>
      </header>
      <div className="ed-body">
        <aside className="ed-left"><SceneList ctx={ctx} /></aside>
        <section className="ed-center">
          <div className="ed-stage"><Preview ref={preview} project={project} timing={timing} onScene={setCurrent} /></div>
          {voiceLine}
          <div className="tl" aria-label="타임라인">
            {timing.scenes.map((t, i) => (
              <button key={t.id} className={i === current ? 'on' : ''} style={{ flexGrow: t.frames }} title={project.scenes[i]?.text} onClick={() => ctx.seek(i)}>{i + 1}</button>
            ))}
          </div>
        </section>
        <aside className="ed-right">
          <nav className="tabs">{tabs.map(([t, n]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{n}</button>)}</nav>
          <div className="ed-panel">{panel(tab)}</div>
        </aside>
      </div>
    </div>
  );
}
