import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Project } from '../src/shared/types';
import { defaultSettings, mergeSettings, publicSettings, type Settings } from '../src/shared/settings';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.INFOCUT_DATA || path.join(APP_DIR, 'data');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

export type { Provider, Settings } from '../src/shared/settings';
export { publicSettings };

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function defaultAssetFolders(): string[] {
  const home = os.homedir();
  const list = [path.join(APP_DIR, 'assets')];
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    list.push(path.join(appdata, 'Adobe', 'Common', 'Motion Graphics Templates'));
    for (const n of ['효과음 120가지 #01', '효과음 120가지 #02', '효과음 120가지 #03']) list.push(path.join(home, 'Downloads', n));
  }
  return list.filter((p) => fs.existsSync(p));
}

export function loadSettings(): Settings {
  const base = defaultSettings(defaultAssetFolders());
  try { return mergeSettings(base, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))); } catch { return base; }
}

export function saveSettings(s: Settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf8');
}

export const projectDir = (id: string) => {
  if (!/^[\w-]+$/.test(id)) throw new Error('잘못된 프로젝트 이름');
  return path.join(PROJECTS_DIR, id);
};

export function readProject(id: string): Project {
  return JSON.parse(fs.readFileSync(path.join(projectDir(id), 'project.json'), 'utf8'));
}

export function writeProject(p: Project, snapshot?: string) {
  const dir = projectDir(p.id);
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  p.updatedAt = new Date().toISOString();
  const file = path.join(dir, 'project.json');
  if (snapshot && fs.existsSync(file)) {
    const vdir = path.join(dir, 'versions');
    fs.mkdirSync(vdir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safe = snapshot.replace(/[^\w가-힣 ]/g, '').slice(0, 30);
    fs.copyFileSync(file, path.join(vdir, `${stamp}__${safe}.json`));
    const all = fs.readdirSync(vdir).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 40))) fs.rmSync(path.join(vdir, old));
  }
  fs.writeFileSync(file, JSON.stringify(p, null, 2), 'utf8');
}

export function listProjects() {
  return fs.readdirSync(PROJECTS_DIR)
    .filter((d) => fs.existsSync(path.join(PROJECTS_DIR, d, 'project.json')))
    .map((d) => {
      try {
        const p = readProject(d);
        const thumb = fs.existsSync(path.join(PROJECTS_DIR, d, 'exports', 'final.mp4'));
        return { id: p.id, title: p.title, format: p.format, scenes: p.scenes.length, updatedAt: p.updatedAt, rendered: thumb, preset: p.design.preset };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a!.updatedAt < b!.updatedAt ? 1 : -1));
}

export function listVersions(id: string) {
  const vdir = path.join(projectDir(id), 'versions');
  if (!fs.existsSync(vdir)) return [];
  return fs.readdirSync(vdir).sort().reverse().map((f) => {
    const [stamp, label] = f.replace(/\.json$/, '').split('__');
    const iso = stamp.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1T$2:$3:$4.$5Z');
    return { file: f, at: iso, label: label || '' };
  });
}

/* ---------- 작업 (오래 걸리는 일) ---------- */

export interface Job {
  id: string;
  kind: string;
  projectId?: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  message: string;
  log: string[];
  result?: unknown;
  error?: string;
  startedAt: number;
}

const jobs = new Map<string, Job>();

export function startJob(kind: string, projectId: string | undefined, run: (job: Job, step: (msg: string, progress?: number) => void) => Promise<unknown>): Job {
  const job: Job = { id: Math.random().toString(36).slice(2, 10), kind, projectId, status: 'running', progress: 0, message: '시작하는 중', log: [], startedAt: Date.now() };
  jobs.set(job.id, job);
  const step = (msg: string, progress?: number) => {
    job.message = msg;
    if (progress !== undefined) job.progress = Math.max(0, Math.min(1, progress));
    job.log.push(`${new Date().toLocaleTimeString('ko-KR')}  ${msg}`);
    if (job.log.length > 200) job.log.shift();
  };
  run(job, step)
    .then((r) => { job.result = r; job.status = 'done'; job.progress = 1; job.message = job.message || '완료'; })
    .catch((e: unknown) => {
      job.status = 'error';
      job.error = e instanceof Error ? e.message : String(e);
      job.log.push(`오류: ${job.error}`);
      console.error(`[${kind}]`, e);
    });
  return job;
}

export const getJob = (id: string) => jobs.get(id);
export const runningJobs = (projectId: string) => [...jobs.values()].filter((j) => j.projectId === projectId && j.status === 'running');
