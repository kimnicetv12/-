import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { urlOf } from './local/files';

/** 서버 없이 기기 안에서 다 처리하는 모드 (안드로이드 앱) */
export const LOCAL = import.meta.env.VITE_LOCAL === '1' || Capacitor.isNativePlatform();
export const NATIVE = Capacitor.isNativePlatform();

const local = () => import('./local/router');

export async function api<T = any>(url: string, opts: { method?: string; body?: unknown; raw?: Blob | File } = {}): Promise<T> {
  const method = opts.method || (opts.body || opts.raw ? 'POST' : 'GET');
  if (LOCAL) return (await local()).handle(method, url, opts.body, opts.raw) as Promise<T>;
  const init: RequestInit = { method };
  if (opts.raw) init.body = opts.raw;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  let r: Response;
  try { r = await fetch(url, init); } catch { throw new Error('서버에 연결할 수 없어요. 검은 창이 켜져 있는지 확인하세요.'); }
  const j = await r.json().catch(() => ({ error: `서버 응답 오류 (${r.status})` }));
  if (!r.ok || j?.error) throw new Error(j.error || `오류 ${r.status}`);
  return j as T;
}

/** 프로젝트에 적힌 파일 주소 → 화면에서 쓸 주소 */
export const fileUrl = (src?: string | null) => (!src ? '' : LOCAL ? urlOf(src) ?? src : src);

/** 프로젝트를 .infocut 파일로 내보낸다 */
export async function exportPack(id: string) {
  if (!LOCAL) { window.location.href = `/api/projects/${id}/pack`; return null; }
  const { packLocal } = await local();
  const { saveToDevice } = await import('./local/native');
  const { blob: zip, name } = await packLocal(id);
  // 확장자(.infocut)가 바뀌지 않게 일반 파일로 저장한다
  const blob = new Blob([zip], { type: 'application/octet-stream' });
  return { uri: await saveToDevice(blob, name, 'downloads'), name };
}

export async function saveVideo(ref: string, name: string) {
  const { fileBlob } = await local();
  const { saveToDevice } = await import('./local/native');
  const blob = await fileBlob(ref);
  if (!blob) throw new Error('영상 파일이 없어요.');
  return saveToDevice(blob, name, 'movies');
}

export async function shareUri(uri: string, mime: string, title: string) {
  const { InfoCut } = await import('./local/native');
  await InfoCut.share({ uri, mime, title });
}

export interface JobState { id: string; kind: string; status: 'running' | 'done' | 'error'; progress: number; message: string; log: string[]; result?: any; error?: string }

/** 오래 걸리는 작업 시작 + 진행 상황 따라가기 */
export function useJob(onDone?: (j: JobState) => void) {
  const [job, setJob] = useState<JobState | null>(null);
  const timer = useRef<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const stop = () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  const follow = useCallback((id: string) => {
    stop();
    const tick = async () => {
      try {
        const j = await api<JobState>(`/api/jobs/${id}`);
        setJob(j);
        if (j.status !== 'running') { stop(); doneRef.current?.(j); }
      } catch (e) {
        stop();
        const failed: JobState = { id, kind: '', status: 'error', progress: 0, message: '', log: [], error: (e as Error).message };
        setJob(failed);
        doneRef.current?.(failed);
      }
    };
    void tick();
    timer.current = window.setInterval(tick, LOCAL ? 400 : 1000);
  }, []);
  const start = useCallback(async (url: string, body: unknown = {}) => {
    setJob({ id: '', kind: '', status: 'running', progress: 0, message: '시작하는 중', log: [] });
    try {
      const r = await api<{ job: string }>(url, { body });
      follow(r.job);
    } catch (e) {
      const failed: JobState = { id: '', kind: '', status: 'error', progress: 0, message: '', log: [], error: (e as Error).message };
      setJob(failed);
      doneRef.current?.(failed);
    }
  }, [follow]);
  return { job, start, follow, clear: () => setJob(null), busy: job?.status === 'running' };
}

export function useMobile() {
  const q = '(max-width: 860px)';
  const [m, setM] = useState(() => LOCAL || window.matchMedia(q).matches);
  useEffect(() => {
    if (LOCAL) return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return '방금';
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  const t = new Date(iso);
  return `${t.getMonth() + 1}/${t.getDate()}`;
};
