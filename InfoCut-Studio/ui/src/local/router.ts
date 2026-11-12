// 휴대폰 단독 엔진: PC 서버(server/index.ts)와 같은 주소를 기기 안에서 처리한다
import type { Format, Project } from '../../../src/shared/types';
import { newProject, sampleProject, uid } from '../../../src/shared/sample';
import { buildTiming, timingSignature } from '../../../src/shared/timing';
import { defaultSettings, mergeSettings, publicSettings, type Provider, type Settings } from '../../../src/shared/settings';
import { listModels } from '../../../src/shared/ai/llm';
import { researchTopic, reviseScript, suggestVisual, writeScript } from '../../../src/shared/ai/writer';
import { searchRemoteMedia } from '../../../src/shared/ai/media';
import { http } from '../../../src/shared/ai/net';
import { packProject, unpackProject } from '../../../src/shared/pack';
import { db } from './db';
import { LIB, getFile, listFiles, prime, putFile, refOf, removeFiles, safeName, urlOf } from './files';
import { getJob, runningJobs, startJob } from './jobs';
import { OPENAI_VOICES, audioSeconds, deviceVoices, elevenVoices, voiceProject } from './voice';
import { InfoCut, isNative } from './native';

const BUILTIN = ['count', 'reveal', 'chapter', 'cut'] as const;
const builtinUrl = (name: string) => `/sfx/${name}`;

/* ---------- 설정 · 프로젝트 저장 ---------- */

async function settings(): Promise<Settings> {
  const base = defaultSettings();
  base.defaults.voice = '';
  base.defaults.rate = '1.05';
  return mergeSettings(base, await db.get('kv', 'settings'));
}

async function readProject(id: string): Promise<Project> {
  const p = await db.get<Project>('projects', id);
  if (!p) throw new Error('프로젝트를 찾을 수 없어요.');
  return p;
}

async function writeProject(p: Project, snapshot?: string) {
  if (snapshot) {
    const old = await db.get<Project>('projects', p.id);
    if (old) {
      await db.put('versions', `${p.id}/${new Date().toISOString()}__${snapshot.replace(/[/_]/g, ' ').slice(0, 30)}`, old);
      const keys = await db.keys('versions', `${p.id}/`);
      for (const k of keys.slice(0, Math.max(0, keys.length - 40))) await db.del('versions', k);
    }
  }
  p.updatedAt = new Date().toISOString();
  await db.put('projects', p.id, p);
}

async function listProjects() {
  const all = await db.all<Project>('projects');
  const out = [];
  for (const p of all) out.push({ id: p.id, title: p.title, format: p.format, scenes: p.scenes.length, updatedAt: p.updatedAt, rendered: !!(await finalOf(p.id)), preset: p.design.preset });
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

async function listVersions(id: string) {
  const keys = await db.keys('versions', `${id}/`);
  return keys.reverse().map((k) => {
    const [at, label] = k.slice(id.length + 1).split('__');
    return { file: k, at, label: label || '' };
  });
}

async function finalOf(id: string) {
  for (const ext of ['mp4', 'webm']) {
    const ref = refOf(id, 'export', `final.${ext}`);
    if (await getFile(ref)) return ref;
  }
  return null;
}

async function exportsOf(id: string) {
  const ref = await finalOf(id);
  return { final: ref ? urlOf(ref) : null, finalRef: ref, premiere: null };
}

const newId = () => `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${uid()}`;

/* ---------- 목소리 · 렌더 ---------- */

async function ensureTiming(id: string, step: (m: string, p?: number) => void) {
  const p = await readProject(id);
  if (p.timing && p.timing.signature === timingSignature(p)) return { p, timing: p.timing };
  const timing = p.narration.enabled ? await voiceProject(await settings(), p, step) : buildTiming(p);
  const q = await readProject(id);
  q.timing = timing;
  await writeProject(q);
  return { p: q, timing };
}

/* ---------- 내 소리 보관함 ---------- */

async function assets() {
  const list: any[] = BUILTIN.map((r) => ({ id: `builtin_${r}`, kind: 'sfx', name: `기본 ${({ count: '숫자', reveal: '정리', chapter: '장 전환', cut: '컷' })[r]}`, path: '', folder: '내장', seconds: 0.4, size: 0, url: builtinUrl(`builtin_${r}.wav`), roles: [r] }));
  for (const f of await listFiles(`${LIB}/audio/`)) {
    const seconds = f.seconds;
    list.push({ id: f.ref, kind: (seconds || 0) > 25 ? 'bgm' : 'sfx', name: f.name, path: '', folder: '휴대폰', seconds, size: f.blob.size, url: f.ref, removable: true });
  }
  return list;
}

/* ---------- 요청 처리 ---------- */

type Handler = (m: RegExpMatchArray, body: any, query: URLSearchParams, raw?: Blob) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, fn: Handler) => routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), fn]);

on('GET', '/api/state', async () => {
  const s = await settings();
  return { settings: publicSettings(s), projects: await listProjects(), voice: { device: isNative, openai: !!s.keys.openai, elevenlabs: !!s.keys.elevenlabs }, version: '2.0.0', platform: isNative ? 'android' : 'web' };
});

on('POST', '/api/settings', async (_m, body) => {
  const cur = await settings();
  const keys = { ...cur.keys };
  for (const [k, v] of Object.entries(body.keys || {})) if (typeof v === 'string' && !v.includes('••••')) (keys as any)[k] = v.trim();
  const next: Settings = {
    ...cur, ...body, keys,
    ai: { ...cur.ai, ...(body.ai || {}), models: { ...cur.ai.models, ...(body.ai?.models || {}) } },
    defaults: { ...cur.defaults, ...(body.defaults || {}) },
    render: { ...cur.render, ...(body.render || {}) },
  };
  await db.put('kv', 'settings', next);
  return { settings: publicSettings(next) };
});

on('GET', '/api/models/:provider', async (m) => {
  const p = m[1] as Provider;
  return { models: await listModels(p, (await settings()).keys[p]) };
});

on('GET', '/api/voices', async () => ({ device: await deviceVoices(), openai: OPENAI_VOICES, elevenlabs: await elevenVoices(await settings()) }));

on('GET', '/api/projects', () => listProjects());

on('POST', '/api/projects', async (_m, body) => {
  const s = await settings();
  const format: Format = body.format === 'long' ? 'long' : 'shorts';
  const p = body.sample ? sampleProject(format) : newProject(format, String(body.title || '새 프로젝트'));
  if (body.sample) p.id = `${p.id}_${uid()}`;
  p.design.preset = s.defaults.preset;
  p.design.accent = s.defaults.accent;
  p.narration = { ...p.narration, engine: isNative || !s.keys.openai ? 'device' : 'openai', voice: isNative || !s.keys.openai ? s.defaults.voice : 'nova', rate: '1.05' };
  if (!body.sample) p.narration.enabled = s.defaults.narration;
  p.audio.sfxMap = Object.fromEntries(BUILTIN.map((r) => [r, builtinUrl(`builtin_${r}.wav`)]));
  await writeProject(p);
  return p;
});

on('GET', '/api/projects/:id', async (m) => {
  await prime(m[1]);
  const p = await readProject(m[1]);
  return { project: p, jobs: runningJobs(p.id), versions: await listVersions(p.id), exports: await exportsOf(p.id) };
});

on('PUT', '/api/projects/:id', async (m, body) => {
  const p = body.project as Project;
  if (p.id !== m[1]) throw new Error('프로젝트가 맞지 않아요.');
  await writeProject(p, body.snapshot);
  return { ok: true, updatedAt: p.updatedAt };
});

on('DELETE', '/api/projects/:id', async (m) => {
  await db.del('projects', m[1]);
  await db.delPrefix('versions', `${m[1]}/`);
  await removeFiles(`${m[1]}/`);
});

on('POST', '/api/projects/:id/duplicate', async (m) => {
  const src = await readProject(m[1]);
  const id = newId();
  for (const f of await listFiles(`${src.id}/`)) {
    const [, dir] = f.ref.slice(4 + src.id.length).split('/');
    if (dir !== 'export') await putFile(id, dir, f.name, f.blob);
  }
  const copy = JSON.parse(JSON.stringify(src).split(`idb:${src.id}/`).join(`idb:${id}/`)) as Project;
  copy.id = id;
  copy.title = `${src.title} (복사본)`;
  await writeProject(copy);
  return { id };
});

on('GET', '/api/projects/:id/versions', (m) => listVersions(m[1]));

on('POST', '/api/projects/:id/restore', async (m, body) => {
  const old = await db.get<Project>('versions', String(body.file));
  if (!old || old.id !== m[1]) throw new Error('기록을 찾을 수 없어요.');
  await writeProject(old, '되돌리기 전');
  return { project: old };
});

on('POST', '/api/projects/:id/research', (m, body) => {
  const id = m[1];
  if (!body.topic?.trim()) throw new Error('주제를 적어 주세요.');
  return startJob('research', id, async (step) => {
    const p = await readProject(id);
    const r = await researchTopic(await settings(), { ...body, format: p.format }, step);
    const q = await readProject(id);
    q.research = r;
    if (q.title === '새 프로젝트') q.title = body.topic.slice(0, 40);
    await writeProject(q, '조사');
    return r;
  });
});

on('POST', '/api/projects/:id/script', (m, body) => {
  const id = m[1];
  return startJob('script', id, async (step) => {
    const p = await readProject(id);
    const out = await writeScript(await settings(), p, { seconds: Number(body.seconds) || (p.format === 'shorts' ? 45 : 360), tone: body.tone, extra: body.extra }, step);
    const q = await readProject(id);
    q.scenes = out.scenes!;
    if (out.title) q.title = out.title;
    if (out.headline) q.headline = out.headline;
    if (out.upload) q.upload = out.upload;
    q.timing = undefined;
    await writeProject(q, '대본 쓰기');
    return { scenes: q.scenes.length };
  });
});

on('POST', '/api/projects/:id/revise', (m, body) => {
  const id = m[1];
  const instruction = String(body.instruction || '').trim();
  if (!instruction) throw new Error('무엇을 고칠지 적어 주세요.');
  return startJob('revise', id, async (step) => {
    step('대본 고치는 중', 0.2);
    const p = await readProject(id);
    const scenes = await reviseScript(await settings(), p, instruction, body.sceneIds);
    const q = await readProject(id);
    q.scenes = scenes;
    await writeProject(q, `수정: ${instruction}`);
    return { scenes: scenes.length };
  });
});

on('POST', '/api/projects/:id/scenes/:sid/remake', (m, body) => {
  const [, id, sid] = m;
  return startJob('remake', id, async (step) => {
    step('장면 다시 만드는 중', 0.3);
    const scene = await suggestVisual(await settings(), await readProject(id), sid, String(body.instruction || ''));
    const q = await readProject(id);
    q.scenes = q.scenes.map((x) => (x.id === sid ? scene : x));
    await writeProject(q, '장면 다시 만들기');
    return { scene };
  });
});

on('POST', '/api/projects/:id/voice', (m) => startJob('voice', m[1], async (step) => ({ timing: (await ensureTiming(m[1], step)).timing })));

on('POST', '/api/projects/:id/render', (m, body) => {
  const id = m[1];
  return startJob('render', id, async (step) => {
    if (isNative) void InfoCut.keepAwake({ on: true }).catch(() => undefined);
    try {
      const { p, timing } = await ensureTiming(id, (msg, pr) => step(msg, (pr ?? 0) * 0.15));
      const { renderLocal } = await import('./render');
      const out = await renderLocal(p, timing, body.captions === false ? 'nocaptions' : 'all', (msg, pr) => step(msg, 0.15 + (pr ?? 0) * 0.85));
      await removeFiles(`${id}/export/`);
      const ref = await putFile(id, 'export', `final.${out.ext}`, out.blob);
      return { url: urlOf(ref), ext: out.ext };
    } finally {
      if (isNative) void InfoCut.keepAwake({ on: false }).catch(() => undefined);
    }
  });
});

on('POST', '/api/projects/:id/premiere', () => { throw new Error('프리미어 내보내기는 PC 버전에서 해요. 프로젝트 파일을 PC 로 보내 주세요.'); });

on('GET', '/api/jobs/:id', (m) => {
  const j = getJob(m[1]);
  if (!j) throw new Error('작업을 찾을 수 없어요.');
  return j;
});

on('GET', '/api/media/search', async (_m, _b, q) => searchRemoteMedia(await settings(), q.get('q') || '', q.get('source') || 'wikimedia'));

on('POST', '/api/projects/:id/media/fetch', async (m, body) => {
  const r = await http(String(body.url), { timeoutMs: 60000 });
  if (!r.ok) throw new Error(`내려받기 실패 ${r.status}`);
  const type = r.headers.get('content-type') || '';
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('video') ? '.mp4' : '.jpg';
  const blob = new Blob([await r.arrayBuffer()], { type: type || 'image/jpeg' });
  return { src: await putFile(m[1], 'media', `${safeName(String(body.hint || 'media')).slice(0, 24)}_${Date.now().toString(36)}${ext}`, blob) };
});

on('PUT', '/api/projects/:id/media', async (m, _b, q, raw) => {
  if (!raw) throw new Error('파일이 없어요.');
  return { src: await putFile(m[1], 'media', `${Date.now().toString(36)}_${safeName(q.get('name') || 'file')}`, raw) };
});

on('GET', '/api/assets', async () => ({ folders: [], assets: await assets() }));
on('GET', '/api/assets/suggest-sfx', () => Object.fromEntries(BUILTIN.map((r) => [r, builtinUrl(`builtin_${r}.wav`)])));

on('PUT', '/api/assets', async (_m, _b, q, raw) => {
  if (!raw) throw new Error('파일이 없어요.');
  let seconds = 0;
  try { seconds = await audioSeconds(raw); } catch { throw new Error('소리 파일을 읽을 수 없어요.'); }
  const name = safeName(q.get('name') || 'sound');
  await putFile(LIB, 'audio', name, raw, seconds);
  return { ok: true };
});

on('DELETE', '/api/assets', async (_m, _b, q) => { await removeFiles(String(q.get('ref')).replace(/^idb:/, '')); });

on('POST', '/api/import', async (_m, _b, _q, raw) => {
  if (!raw) throw new Error('파일이 없어요.');
  const id = newId();
  const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg' };
  const p = await unpackProject(new Uint8Array(await raw.arrayBuffer()), id,
    (dir, name, data) => putFile(id, dir, name, new Blob([data as Uint8Array<ArrayBuffer>], { type: TYPES[name.split('.').pop()!.toLowerCase()] || '' })),
    (name) => builtinUrl(name));
  await writeProject(p);
  return { id };
});

/** 프로젝트를 .infocut 파일로 묶는다 */
export async function packLocal(id: string): Promise<{ blob: Blob; name: string }> {
  const p = await readProject(id);
  const zip = await packProject(p, async (ref) => {
    if (ref.startsWith('/sfx/')) return { name: ref.slice(5), data: new Uint8Array() };
    const f = await getFile(ref);
    return f ? { name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) } : null;
  });
  return { blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), name: `${p.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'project'}.infocut` };
}

export async function fileBlob(ref: string) { return (await getFile(ref))?.blob ?? null; }

export async function handle(method: string, url: string, body: unknown, raw?: Blob): Promise<any> {
  const u = new URL(url, 'http://local');
  for (const [m, re, fn] of routes) {
    if (m !== method) continue;
    const hit = u.pathname.match(re);
    if (hit) return (await fn(hit.map(decodeURIComponent) as unknown as RegExpMatchArray, body ?? {}, u.searchParams, raw)) ?? { ok: true };
  }
  throw new Error(`지원하지 않는 요청: ${method} ${u.pathname}`);
}
