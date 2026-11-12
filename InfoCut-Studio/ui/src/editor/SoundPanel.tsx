import { useEffect, useRef, useState } from 'react';
import type { Narration, SfxRole } from '../../../src/shared/types';
import { SFX_ROLES } from '../../../src/shared/sfx';
import { LOCAL, api, fileUrl } from '../api';
import { Icon } from '../icons';
import type { EditorCtx } from './Editor';
import { JobView } from './JobView';

const ENGINES: { id: Narration['engine']; name: string }[] = LOCAL
  ? [{ id: 'device', name: '기본' }, { id: 'openai', name: 'OpenAI' }, { id: 'elevenlabs', name: 'ElevenLabs' }]
  : [{ id: 'edge', name: 'edge' }, { id: 'openai', name: 'OpenAI' }, { id: 'elevenlabs', name: 'ElevenLabs' }];

export function SoundPanel({ ctx }: { ctx: EditorCtx }) {
  const { project: p, update } = ctx;
  const n = p.narration;
  const [voices, setVoices] = useState<Record<string, { id: string; name: string }[]>>({});
  const [assets, setAssets] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const loadAssets = () => api<any>('/api/assets').then((d) => setAssets(d.assets)).catch(() => undefined);

  useEffect(() => {
    api<any>('/api/voices').then(setVoices).catch(() => undefined);
    void loadAssets();
    return () => audio.current?.pause();
  }, []);
  const setN = (patch: Partial<Narration>) => update((q) => ({ ...q, narration: { ...q.narration, ...patch } }));
  const setA = (patch: Partial<typeof p.audio>) => update((q) => ({ ...q, audio: { ...q.audio, ...patch } }));
  const play = (url?: string | null) => { audio.current?.pause(); if (!url) return; audio.current = new Audio(fileUrl(url)); void audio.current.play(); };
  const sfx = assets.filter((a) => a.kind === 'sfx');
  const bgm = assets.filter((a) => a.kind === 'bgm');
  const isEdge = n.engine === 'edge';
  const rateNum = isEdge ? parseInt(n.rate, 10) || 0 : Number(n.rate) || 1;
  const engineVoices = voices[n.engine] || [];
  const foreign = !ENGINES.some((e) => e.id === n.engine);
  const add = async (files: FileList | null) => {
    setErr('');
    try { for (const f of Array.from(files || [])) await api(`/api/assets?name=${encodeURIComponent(f.name)}`, { method: 'PUT', raw: f }); }
    catch (e) { setErr((e as Error).message); }
    void loadAssets();
  };

  return (
    <div className="insp">
      <h4 className="first">나레이션</h4>
      <label className="opt"><span>목소리 넣기</span><input type="checkbox" checked={n.enabled} onChange={(e) => setN({ enabled: e.target.checked })} /></label>
      {n.enabled && (
        <>
          <div className="opt"><span>엔진</span>
            <div className="seg">{ENGINES.map((e) => <button key={e.id} aria-pressed={n.engine === e.id} onClick={() => setN({ engine: e.id, voice: voices[e.id]?.[0]?.id || (e.id === 'edge' ? 'ko-KR-InJoonNeural' : e.id === 'openai' ? 'nova' : ''), rate: e.id === 'edge' ? '+8%' : '1.05' })}>{e.name}</button>)}</div>
          </div>
          {foreign && <p className="msg">{n.engine === 'edge' ? 'PC 에서 만든 목소리입니다. 대본을 고치면 엔진을 바꿔야 합니다.' : '휴대폰에서 만든 목소리입니다. 대본을 고치면 엔진을 바꿔야 합니다.'}</p>}
          <label className="opt"><span>목소리</span>
            {engineVoices.length ? (
              <select className="in" value={n.voice} onChange={(e) => setN({ voice: e.target.value })}>
                {!engineVoices.find((v) => v.id === n.voice) && <option value={n.voice}>{n.voice || '기본값'}</option>}
                {engineVoices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            ) : <input className="in" placeholder={n.engine === 'device' ? '기본값' : '목소리 ID'} value={n.voice} onChange={(e) => setN({ voice: e.target.value })} />}
          </label>
          <label className="opt"><span>빠르기 <i className="num">{isEdge ? `${rateNum >= 0 ? '+' : ''}${rateNum}%` : `${rateNum.toFixed(2)}x`}</i></span>
            <input type="range" min={isEdge ? -10 : 0.8} max={isEdge ? 35 : 1.3} step={isEdge ? 1 : 0.05} value={rateNum}
              onChange={(e) => setN({ rate: isEdge ? `${Number(e.target.value) >= 0 ? '+' : ''}${e.target.value}%` : e.target.value })} />
          </label>
          <div className="row">
            <button className="btn" disabled={ctx.voice.busy || ctx.locked || !p.scenes.length} onClick={ctx.voice.start}>목소리 만들기</button>
            <span className="dim">{ctx.timingFresh ? '반영됨' : '미반영'}</span>
          </div>
          <JobView job={ctx.voice.job} />
        </>
      )}

      <h4>효과음</h4>
      <label className="opt"><span>효과음 넣기</span><input type="checkbox" checked={p.audio.sfx} onChange={(e) => setA({ sfx: e.target.checked })} /></label>
      {p.audio.sfx && (
        <>
          <label className="opt"><span>크기 <i className="num">{Math.round(p.audio.sfxVolume * 100)}%</i></span><input type="range" min={0.1} max={1} step={0.05} value={p.audio.sfxVolume} onChange={(e) => setA({ sfxVolume: Number(e.target.value) })} /></label>
          {SFX_ROLES.map((r) => {
            const cur = p.audio.sfxMap[r.id];
            return (
              <div key={r.id} className="opt">
                <span title={r.when}>{r.name}</span>
                <div className="row nowrap">
                  <select className="in" value={cur || ''} onChange={(e) => setA({ sfxMap: { ...p.audio.sfxMap, [r.id]: e.target.value || undefined } as Record<SfxRole, string> })}>
                    <option value="">없음</option>
                    {cur && !sfx.find((a) => a.url === cur) && <option value={cur}>지정한 파일</option>}
                    {[...sfx].sort((a, b) => Number(!!b.roles?.includes(r.id)) - Number(!!a.roles?.includes(r.id))).map((a) => <option key={a.id} value={a.url}>{a.name}</option>)}
                  </select>
                  <button className="btn ghost icon" aria-label="듣기" disabled={!cur} onClick={() => play(cur)}><Icon name="play" /></button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <h4>배경음악</h4>
      <div className="opt"><span>음악</span>
        <div className="row nowrap">
          <select className="in" value={p.audio.bgm || ''} onChange={(e) => setA({ bgm: e.target.value || null })}>
            <option value="">없음</option>
            {p.audio.bgm && !bgm.find((a) => a.url === p.audio.bgm) && <option value={p.audio.bgm}>지정한 파일</option>}
            {bgm.map((a) => <option key={a.id} value={a.url}>{a.name}</option>)}
          </select>
          <button className="btn ghost icon" aria-label="듣기" disabled={!p.audio.bgm} onClick={() => play(p.audio.bgm)}><Icon name="play" /></button>
        </div>
      </div>
      {p.audio.bgm && <label className="opt"><span>크기 <i className="num">{Math.round(p.audio.bgmVolume * 100)}%</i></span><input type="range" min={0.02} max={0.4} step={0.01} value={p.audio.bgmVolume} onChange={(e) => setA({ bgmVolume: Number(e.target.value) })} /></label>}
      <div className="row">
        {LOCAL ? (
          <>
            <button className="btn sm" onClick={() => file.current?.click()}>소리 파일 추가</button>
            <input ref={file} type="file" accept="audio/*" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
          </>
        ) : <a className="btn sm" href="#assets">에셋 폴더</a>}
        <button className="btn ghost icon" aria-label="소리 멈추기" onClick={() => audio.current?.pause()}><Icon name="stop" /></button>
      </div>
      {err && <p className="msg err">{err}</p>}
    </div>
  );
}
