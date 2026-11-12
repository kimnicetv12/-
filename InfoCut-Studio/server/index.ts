// InfoCut Studio 서버 — 이 컴퓨터 안에서만 열린다 (127.0.0.1)
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import express from 'express';
import type { Format, Project, Research, Scene } from '../src/shared/types';
import { newProject, sampleProject, uid } from '../src/shared/sample';
import { buildTiming, timingSignature } from '../src/shared/timing';
import { listModels } from '../src/shared/ai/llm';
import { researchTopic, reviseScript, suggestVisual, writeScript } from '../src/shared/ai/writer';
import { VOICES, listElevenVoices, voiceProject, voiceStatus } from './voice';
import { copyAssetToProject, decodeAssetUrl, downloadToProject, scanAssets, searchMedia, suggestSfx } from './assets';
import { getBundle, renderFinal } from './render';
import { exportPremiere } from './premiere';
import { packProject, unpackProject } from '../src/shared/pack';
import { assetUrl } from './assets';
import {
  APP_DIR, PROJECTS_DIR, getJob, listProjects, listVersions, loadSettings, projectDir, publicSettings,
  readProject, runningJobs, saveSettings, startJob, writeProject, type Settings,
} from './store';

const PORT = Number(process.env.PORT || 5178);
process.env.PORT = String(PORT);
const app = express();
app.use((_, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });
app.use(express.json({ limit: '20mb' }));

const S = () => loadSettings();
const wrap = (fn: (req: express.Request, res: express.Response) => unknown) => async (req: express.Request, res: express.Response) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
};
const param = (req: express.Request, k: string) => String(req.params[k]);

/* ---------- 상태 · 설정 ---------- */

app.get('/api/state', wrap(() => ({ settings: publicSettings(S()), projects: listProjects(), voice: voiceStatus(S()), version: '2.0.0', platform: process.platform })));

app.post('/api/settings', wrap((req) => {
  const cur = S();
  const body = req.body as Partial<Settings>;
  const keys = { ...cur.keys };
  for (const [k, v] of Object.entries(body.keys || {})) if (typeof v === 'string' && !v.includes('••••')) (keys as any)[k] = v.trim();
  const next: Settings = {
    ...cur, ...body, keys,
    ai: { ...cur.ai, ...(body.ai || {}), models: { ...cur.ai.models, ...(body.ai?.models || {}) } },
    defaults: { ...cur.defaults, ...(body.defaults || {}) },
    render: { ...cur.render, ...(body.render || {}) },
  };
  saveSettings(next);
  return { settings: publicSettings(next) };
}));

app.get('/api/models/:provider', wrap(async (req) => {
  const p = param(req, 'provider') as Settings['ai']['provider'];
  return { models: await listModels(p, S().keys[p]) };
}));

app.get('/api/voices', wrap(async () => ({ ...VOICES, elevenlabs: await listElevenVoices(S()) })));

/* ---------- 프로젝트 ---------- */

app.get('/api/projects', wrap(() => listProjects()));

app.post('/api/projects', wrap((req) => {
  const s = S();
  const format: Format = req.body.format === 'long' ? 'long' : 'shorts';
  const p = req.body.sample ? sampleProject(format) : newProject(format, String(req.body.title || '새 프로젝트'));
  if (req.body.sample) p.id = `${p.id}_${uid()}`;
  p.design.preset = s.defaults.preset;
  p.design.accent = s.defaults.accent;
  if (!req.body.sample) p.narration = { ...p.narration, enabled: s.defaults.narration, voice: s.defaults.voice, rate: s.defaults.rate };
  writeProject(p);
  void suggestSfx(s).then((m) => { const q = readProject(p.id); q.audio.sfxMap = { ...m, ...q.audio.sfxMap }; writeProject(q); }).catch(() => undefined);
  return p;
}));

app.get('/api/projects/:id', wrap((req) => {
  const p = readProject(param(req, 'id'));
  return { project: p, jobs: runningJobs(p.id), versions: listVersions(p.id), exports: exportsOf(p.id) };
}));

app.put('/api/projects/:id', wrap((req) => {
  const p = req.body.project as Project;
  if (p.id !== param(req, 'id')) throw new Error('프로젝트가 맞지 않아요.');
  writeProject(p, req.body.snapshot);
  return { ok: true, updatedAt: p.updatedAt };
}));

app.delete('/api/projects/:id', wrap((req) => {
  fs.rmSync(projectDir(param(req, 'id')), { recursive: true, force: true });
  return { ok: true };
}));

app.post('/api/projects/:id/duplicate', wrap((req) => {
  const p = readProject(param(req, 'id'));
  const src = projectDir(p.id);
  p.id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${uid()}`;
  p.title = `${p.title} (복사본)`;
  const dst = projectDir(p.id);
  fs.cpSync(src, dst, { recursive: true, filter: (f) => !f.includes(`${path.sep}exports`) && !f.includes(`${path.sep}versions`) });
  const json = JSON.stringify(p).split(`/files/projects/${readProject(param(req, 'id')).id}/`).join(`/files/projects/${p.id}/`);
  writeProject(JSON.parse(json));
  return { id: p.id };
}));

/* ---------- 휴대폰과 주고받기 (.infocut) ---------- */

function refToFile(ref: string): string | null {
  if (ref.startsWith('/files/projects/')) return path.join(PROJECTS_DIR, ...decodeURIComponent(ref.slice(16).split('?')[0]).split('/'));
  if (ref.startsWith('/asset/')) return decodeAssetUrl(ref.slice(7), S());
  return null;
}

app.get('/api/projects/:id/pack', async (req, res) => {
  try {
    const p = readProject(param(req, 'id'));
    const zip = await packProject(p, async (ref) => {
      const f = refToFile(ref);
      if (!f || !fs.existsSync(f)) return null;
      return { name: path.basename(f), data: new Uint8Array(fs.readFileSync(f)) };
    });
    const name = `${p.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'project'}.infocut`;
    res.setHeader('content-type', 'application/zip');
    res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.end(Buffer.from(zip));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post('/api/import', express.raw({ type: '*/*', limit: '2gb' }), wrap(async (req) => {
  const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${uid()}`;
  const dir = projectDir(id);
  const p = await unpackProject(new Uint8Array(req.body as Buffer), id, async (sub, name, data) => {
    const safe = path.basename(name);
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    fs.writeFileSync(path.join(dir, sub, safe), data);
    return `/files/projects/${id}/${sub}/${safe}`;
  }, (name) => {
    const f = path.join(APP_DIR, 'assets', 'sfx', path.basename(name));
    return fs.existsSync(f) ? assetUrl(f) : undefined;
  });
  writeProject(p);
  return { id };
}));

app.get('/api/projects/:id/versions', wrap((req) => listVersions(param(req, 'id'))));

app.post('/api/projects/:id/restore', wrap((req) => {
  const id = param(req, 'id');
  const file = path.basename(String(req.body.file));
  const old = JSON.parse(fs.readFileSync(path.join(projectDir(id), 'versions', file), 'utf8')) as Project;
  writeProject(old, '되돌리기 전');
  return { project: old };
}));

function exportsOf(id: string) {
  const dir = path.join(projectDir(id), 'exports');
  const out: Record<string, string | null> = { final: null, premiere: null };
  if (fs.existsSync(path.join(dir, 'final.mp4'))) out.final = `/files/projects/${id}/exports/final.mp4?t=${fs.statSync(path.join(dir, 'final.mp4')).mtimeMs}`;
  const pdir = path.join(dir, 'premiere');
  if (fs.existsSync(pdir)) out.premiere = pdir;
  return out;
}

/* ---------- 주제 탐구 · 대본 ---------- */

app.post('/api/projects/:id/research', wrap((req) => {
  const id = param(req, 'id');
  const body = req.body as { topic: string; angleHint?: string; memo?: string; urls?: string[] };
  if (!body.topic?.trim()) throw new Error('주제를 적어 주세요.');
  const job = startJob('research', id, async (_j, step) => {
    const p = readProject(id);
    const r: Research = await researchTopic(S(), { ...body, format: p.format }, step);
    const q = readProject(id);
    q.research = r;
    if (q.title === '새 프로젝트') q.title = body.topic.slice(0, 40);
    writeProject(q, '주제 탐구');
    step(`탐구 노트 완성: 사실 ${r.facts.length}개, 방향 ${r.angles.length}개`);
    return r;
  });
  return { job: job.id };
}));

app.post('/api/projects/:id/script', wrap((req) => {
  const id = param(req, 'id');
  const job = startJob('script', id, async (_j, step) => {
    const p = readProject(id);
    const out = await writeScript(S(), p, { seconds: Number(req.body.seconds) || (p.format === 'shorts' ? 45 : 360), tone: req.body.tone, extra: req.body.extra }, step);
    const q = readProject(id);
    q.scenes = out.scenes!;
    if (out.title) q.title = out.title;
    if (out.headline) q.headline = out.headline;
    if (out.upload) q.upload = out.upload;
    q.timing = undefined;
    writeProject(q, '대본 쓰기');
    step(`대본 완성: 장면 ${q.scenes.length}개`);
    return { scenes: q.scenes.length };
  });
  return { job: job.id };
}));

app.post('/api/projects/:id/revise', wrap((req) => {
  const id = param(req, 'id');
  const instruction = String(req.body.instruction || '').trim();
  if (!instruction) throw new Error('무엇을 고칠지 적어 주세요.');
  const job = startJob('revise', id, async (_j, step) => {
    step('AI 가 대본을 고치는 중', 0.2);
    const p = readProject(id);
    const scenes = await reviseScript(S(), p, instruction, req.body.sceneIds);
    const q = readProject(id);
    q.scenes = scenes;
    writeProject(q, `AI 수정: ${instruction}`);
    step('고쳤어요');
    return { scenes: scenes.length };
  });
  return { job: job.id };
}));

app.post('/api/projects/:id/scenes/:sid/remake', wrap((req) => {
  const id = param(req, 'id');
  const sid = param(req, 'sid');
  const job = startJob('remake', id, async (_j, step) => {
    step('장면 다시 만드는 중', 0.3);
    const p = readProject(id);
    const scene: Scene = await suggestVisual(S(), p, sid, String(req.body.instruction || ''));
    const q = readProject(id);
    q.scenes = q.scenes.map((x) => (x.id === sid ? scene : x));
    writeProject(q, '장면 다시 만들기');
    return { scene };
  });
  return { job: job.id };
}));

/* ---------- 목소리 · 렌더 · 내보내기 ---------- */

async function ensureTiming(id: string, step: (m: string, p?: number) => void) {
  const p = readProject(id);
  if (p.timing && p.timing.signature === timingSignature(p)) return { p, timing: p.timing };
  const timing = p.narration.enabled ? await voiceProject(S(), p, step) : buildTiming(p);
  const q = readProject(id);
  q.timing = timing;
  writeProject(q);
  return { p: q, timing };
}

app.post('/api/projects/:id/voice', wrap((req) => {
  const id = param(req, 'id');
  const job = startJob('voice', id, async (_j, step) => {
    const { timing } = await ensureTiming(id, step);
    step('목소리 준비 완료');
    return { timing };
  });
  return { job: job.id };
}));

app.post('/api/projects/:id/render', wrap((req) => {
  const id = param(req, 'id');
  const job = startJob('render', id, async (_j, step) => {
    const { p, timing } = await ensureTiming(id, (m, pr) => step(m, (pr ?? 0) * 0.15));
    const url = await renderFinal(S(), p, timing, (m, pr) => step(m, 0.15 + (pr ?? 0) * 0.85));
    step('완성 영상이 나왔어요');
    return { url: `${url}?t=${Date.now()}` };
  });
  return { job: job.id };
}));

app.post('/api/projects/:id/premiere', wrap((req) => {
  const id = param(req, 'id');
  const job = startJob('premiere', id, async (_j, step) => {
    const { p, timing } = await ensureTiming(id, (m) => step(m, 0.02));
    const out = await exportPremiere(S(), p, timing, { visual: req.body.visual !== false }, step);
    return out;
  });
  return { job: job.id };
}));

app.get('/api/jobs/:id', wrap((req) => {
  const j = getJob(param(req, 'id'));
  if (!j) throw new Error('작업을 찾을 수 없어요 (프로그램을 다시 켰다면 처음부터 해 주세요).');
  return j;
}));

/* ---------- 사진·영상 · 에셋 ---------- */

app.get('/api/media/search', wrap(async (req) => searchMedia(S(), String(req.query.q || ''), String(req.query.source || 'wikimedia'))));

app.post('/api/projects/:id/media/fetch', wrap(async (req) => {
  const id = param(req, 'id');
  const url = String(req.body.url || '');
  if (url.startsWith('/asset/')) {
    const f = decodeAssetUrl(url.slice(7), S());
    if (!f) throw new Error('파일을 찾을 수 없어요.');
    return { src: copyAssetToProject(id, f) };
  }
  return { src: await downloadToProject(id, url, String(req.body.hint || 'media')) };
}));

app.put('/api/projects/:id/media', express.raw({ type: '*/*', limit: '2gb' }), wrap((req) => {
  const id = param(req, 'id');
  const raw = String(req.query.name || 'file');
  const name = `${Date.now().toString(36)}_${path.basename(raw).replace(/[^\w가-힣.-]/g, '_')}`;
  const dir = path.join(projectDir(id), 'media');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), req.body as Buffer);
  return { src: `/files/projects/${id}/media/${name}` };
}));

app.get('/api/assets', wrap(async (req) => ({ folders: S().assetFolders, assets: await scanAssets(S(), req.query.refresh === '1') })));
app.get('/api/assets/suggest-sfx', wrap(async () => suggestSfx(S())));

app.post('/api/open-folder', wrap((req) => {
  const target = String(req.body.path || '');
  const full = target.startsWith('/files/projects/') ? path.join(PROJECTS_DIR, ...target.slice(16).split('/')) : target;
  if (!fs.existsSync(full)) throw new Error('폴더가 없어요.');
  const cmd = process.platform === 'win32' ? `explorer "${full}"` : process.platform === 'darwin' ? `open "${full}"` : `xdg-open "${full}"`;
  exec(cmd);
  return { ok: true };
}));

/* ---------- 파일 · 화면 ---------- */

app.use('/files/projects', express.static(PROJECTS_DIR, { fallthrough: false }));
app.use('/fonts', express.static(path.join(APP_DIR, 'public', 'fonts')));
app.get('/asset/:token', (req, res) => {
  const f = decodeAssetUrl(req.params.token, S());
  if (!f) { res.status(404).end(); return; }
  res.sendFile(f);
});
const UI = path.join(APP_DIR, 'ui', 'dist');
app.use(express.static(UI));
app.get(/^\/(?!api|files|asset|fonts).*/, (_req, res) => {
  if (fs.existsSync(path.join(UI, 'index.html'))) res.sendFile(path.join(UI, 'index.html'));
  else res.status(503).send('화면 파일이 없어요. 설치.bat 을 먼저 실행해 주세요.');
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  InfoCut Studio  →  http://127.0.0.1:${PORT}\n  이 창을 닫으면 프로그램이 꺼져요.\n`);
  void getBundle().catch((e) => console.error('영상 엔진 준비 실패:', e.message));
  if (process.argv.includes('--open')) {
    const url = `http://127.0.0.1:${PORT}`;
    exec(process.platform === 'win32' ? `start "" "${url}"` : `xdg-open ${url}`);
  }
});
