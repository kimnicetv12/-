import { useEffect, useState } from 'react';
import { LOCAL, NATIVE, api, exportPack, relTime, saveVideo, shareUri, useJob } from '../api';
import { Icon } from '../icons';
import type { EditorCtx } from './Editor';
import { JobView } from './JobView';

interface Info { exports: { final: string | null; finalRef?: string | null; premiere: string | null }; versions: { file: string; at: string; label: string }[] }

export function ExportPanel({ ctx }: { ctx: EditorCtx }) {
  const { project: p, update } = ctx;
  const [info, setInfo] = useState<Info | null>(null);
  const [visual, setVisual] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState<{ uri: string; mime: string } | null>(null);
  const load = () => api<Info>(`/api/projects/${p.id}`).then(setInfo).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (j: { status: string }) => { if (j.status === 'done') { void load(); void ctx.reload(true); } };
  const render = useJob(done);
  const premiere = useJob(done);
  const up = p.upload || { title: p.title, description: '', tags: [] };
  const setUp = (patch: Partial<typeof up>) => update((q) => ({ ...q, upload: { ...up, ...patch } }));
  const flash = (t: string) => { setNote(t); window.setTimeout(() => setNote(''), 2000); };
  const copy = async (text: string) => { await navigator.clipboard.writeText(text); flash('복사됨'); };
  const attempt = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } };
  const open = (path: string) => attempt(() => api('/api/open-folder', { body: { path } }));

  const credits = Array.from(new Set(p.scenes.flatMap((s) => {
    const v = s.visual as any;
    return [v.media, v.left?.media, v.right?.media].filter((m) => m?.credit && m.credit !== '직접 올린 파일' && m.credit !== '내 파일').map((m) => m.credit as string);
  })));
  const sources = (p.research?.sources || []).slice(0, 12);
  const final = info?.exports.final;
  const ext = info?.exports.finalRef?.split('.').pop() || 'mp4';
  const fileName = `${p.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'video'}.${ext}`;

  return (
    <div className="insp">
      {err && <p className="msg err">{err}</p>}
      {note && <p className="msg ok" role="status">{note}</p>}

      <h4 className="first">영상</h4>
      {LOCAL && <label className="opt"><span>자막 포함</span><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /></label>}
      <div className="row">
        <button className="btn rec" disabled={render.busy || ctx.locked || !p.scenes.length} onClick={async () => { await ctx.reload(); setSaved(null); void render.start(`/api/projects/${p.id}/render`, { captions }); }}>{final ? '다시 만들기' : '영상 만들기'}</button>
        {final && !LOCAL && <button className="btn" onClick={() => open(`/files/projects/${p.id}/exports`)}><Icon name="folder" />폴더</button>}
        {final && LOCAL && <button className="btn" onClick={() => attempt(async () => { const uri = await saveVideo(info!.exports.finalRef!, fileName); if (uri) setSaved({ uri, mime: `video/${ext}` }); flash(NATIVE ? '갤러리에 저장됨' : '내려받음'); })}><Icon name="download" />{NATIVE ? '갤러리에 저장' : '내려받기'}</button>}
        {saved && NATIVE && <button className="btn" onClick={() => attempt(() => shareUri(saved.uri, saved.mime, p.title))}><Icon name="share" />공유</button>}
      </div>
      <JobView job={render.job} />
      {final && <video className="final" src={final} controls playsInline />}

      {!LOCAL && (
        <>
          <h4>프리미어 프로</h4>
          <label className="opt"><span>투명 영상 포함 (ProRes 4444)</span><input type="checkbox" checked={visual} onChange={(e) => setVisual(e.target.checked)} /></label>
          <div className="row">
            <button className="btn" disabled={premiere.busy || ctx.locked || !p.scenes.length} onClick={async () => { await ctx.reload(); void premiere.start(`/api/projects/${p.id}/premiere`, { visual }); }}>프리미어용 내보내기</button>
            {info?.exports.premiere && <button className="btn" onClick={() => open(info.exports.premiere!)}><Icon name="folder" />폴더</button>}
          </div>
          <JobView job={premiere.job} />
        </>
      )}

      <h4>프로젝트 파일</h4>
      <div className="row">
        <button className="btn" onClick={() => attempt(async () => { await ctx.reload(); const r = await exportPack(p.id); if (r?.uri) { setSaved(null); flash('다운로드 폴더에 저장됨'); await shareUri(r.uri, 'application/octet-stream', r.name); } })}><Icon name="download" />{LOCAL ? 'PC 로 보내기 (.infocut)' : '휴대폰으로 보내기 (.infocut)'}</button>
      </div>

      <h4>업로드 글</h4>
      <label>제목
        <div className="row nowrap"><input className="in grow" value={up.title} onChange={(e) => setUp({ title: e.target.value })} /><button className="btn ghost icon" aria-label="제목 복사" onClick={() => copy(up.title)}><Icon name="copy" /></button></div>
      </label>
      <label>설명
        <textarea className="in" rows={5} value={up.description} onChange={(e) => setUp({ description: e.target.value })} />
      </label>
      <div className="row">
        <button className="btn sm" onClick={() => copy(up.description)}>설명 복사</button>
        {(sources.length > 0 || credits.length > 0) && (
          <button className="btn ghost sm" onClick={() => setUp({ description: `${up.description.trim()}\n\n참고 자료\n${sources.map((s) => `- ${s.title} ${s.url}`).join('\n')}${credits.length ? `\n\n사진 출처\n${credits.map((c) => `- ${c}`).join('\n')}` : ''}`.trim() })}>출처 붙이기</button>
        )}
      </div>
      <label>태그
        <div className="row nowrap"><input className="in grow" value={up.tags.join(', ')} onChange={(e) => setUp({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /><button className="btn ghost icon" aria-label="태그 복사" onClick={() => copy(up.tags.join(', '))}><Icon name="copy" /></button></div>
      </label>

      <h4>기록</h4>
      {info?.versions.length ? (
        <ul className="versions">
          {info.versions.slice(0, 20).map((v) => (
            <li key={v.file}>
              <span>{v.label || '저장'}</span><span className="dim">{relTime(v.at)}</span>
              <button className="btn ghost sm" onClick={async () => { if (!confirm('이 기록으로 되돌립니다. 지금 상태도 기록에 남습니다.')) return; await api(`/api/projects/${p.id}/restore`, { body: { file: v.file } }); await ctx.reload(); void load(); }}>되돌리기</button>
            </li>
          ))}
        </ul>
      ) : <p className="msg">기록 없음</p>}
    </div>
  );
}
