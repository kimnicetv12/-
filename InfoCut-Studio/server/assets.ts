// 내 에셋 폴더 훑기 (효과음·배경음악·MOGRT·사진·영상·LUT·글꼴) + 무료 사진 검색
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import type { SfxRole } from '../src/shared/types';
import { searchRemoteMedia, type MediaHit } from '../src/shared/ai/media';
import { projectDir, type Settings } from './store';

export type AssetKind = 'sfx' | 'bgm' | 'mogrt' | 'image' | 'video' | 'lut' | 'font' | 'preset';
export interface Asset { id: string; kind: AssetKind; name: string; path: string; folder: string; seconds?: number; size: number; url: string; roles?: SfxRole[] }

const EXT: Record<string, AssetKind | 'audio'> = {
  '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.aac': 'audio', '.ogg': 'audio',
  '.mogrt': 'mogrt', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image',
  '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.cube': 'lut', '.ttf': 'font', '.otf': 'font', '.prfpset': 'preset',
};

/** 파일 이름으로 효과음 역할 짐작 (정보 영상에 어울리는 잔잔한 소리 위주) */
const ROLE_WORDS: Record<SfxRole, RegExp> = {
  cut: /(넘기|페이지|page|swipe|쉭|휙|휘익|whoosh|swoosh|transition|전환)/i,
  reveal: /(띠링|띠딩|딩|ding|chime|bell|뾰옥|pop|뽁|알림|notif)/i,
  count: /(찰칵|딸깍|click|tick|타이핑|키보드|typing|camera|셔터)/i,
  chapter: /(넘기|휘익|whoosh|riser|등장|transition|깨달음)/i,
};
/** 정보 영상에 안 어울리는 소리는 자동 추천에서 뺀다 */
const LOUD = /(싸이렌|비명|아악|폭발|boom|air ?horn|욕|퍽|닥쳐|으악|웃음|환호|총|천둥|화장실|스파르타|nope|노갓|왓더)/i;

let cache: { at: number; folders: string; list: Asset[] } | null = null;

export const assetUrl = (p: string) => `/asset/${Buffer.from(p, 'utf8').toString('base64url')}`;

export function decodeAssetUrl(token: string, s: Settings): string | null {
  const p = Buffer.from(token, 'base64url').toString('utf8');
  const full = path.resolve(p);
  const ok = s.assetFolders.some((f) => full.toLowerCase().startsWith(path.resolve(f).toLowerCase() + path.sep) || full.toLowerCase() === path.resolve(f).toLowerCase());
  return ok && fs.existsSync(full) ? full : null;
}

export async function scanAssets(s: Settings, force = false): Promise<Asset[]> {
  const key = s.assetFolders.join('|');
  if (!force && cache && cache.folders === key && Date.now() - cache.at < 60_000) return cache.list;
  const list: Asset[] = [];
  for (const folder of s.assetFolders) {
    if (!fs.existsSync(folder)) continue;
    walk(folder, 0, (file, size) => {
      const ext = path.extname(file).toLowerCase();
      const k = EXT[ext];
      if (!k || list.length > 4000) return;
      list.push({ id: crypto.createHash('sha1').update(file).digest('hex').slice(0, 10), kind: k === 'audio' ? 'sfx' : k, name: path.basename(file), path: file, folder, size, url: assetUrl(file) });
    });
  }
  for (const a of list.filter((x) => x.kind === 'sfx')) {
    try {
      const m = await parseFile(a.path, { duration: true, skipCovers: true });
      a.seconds = m.format.duration;
      if ((a.seconds || 0) > 25) a.kind = 'bgm';
    } catch { /* 길이를 못 읽어도 목록에는 둔다 */ }
    if (a.kind === 'sfx' && !LOUD.test(a.name)) a.roles = (Object.keys(ROLE_WORDS) as SfxRole[]).filter((r) => ROLE_WORDS[r].test(a.name));
  }
  cache = { at: Date.now(), folders: key, list };
  return list;
}

function walk(dir: string, depth: number, cb: (file: string, size: number) => void) {
  if (depth > 5) return;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, depth + 1, cb);
    else if (e.isFile()) { try { cb(full, fs.statSync(full).size); } catch { /* 건너뜀 */ } }
  }
}

/** 효과음 자동 연결: 내 폴더에서 역할에 맞는 첫 소리, 없으면 내장 소리 */
export async function suggestSfx(s: Settings): Promise<Partial<Record<SfxRole, string>>> {
  const all = await scanAssets(s);
  const out: Partial<Record<SfxRole, string>> = {};
  const order: SfxRole[] = ['count', 'reveal', 'chapter', 'cut'];
  const used = new Set<string>();
  for (const r of order) {
    const user = all.find((a) => a.kind === 'sfx' && a.roles?.includes(r) && !a.path.includes(`${path.sep}assets${path.sep}sfx${path.sep}`) && !used.has(a.id));
    const builtin = all.find((a) => a.kind === 'sfx' && a.name.startsWith(`builtin_${r}`));
    const pick = user || builtin;
    if (pick) { out[r] = pick.url; used.add(pick.id); }
  }
  return out;
}

/* ---------- 무료 사진·영상 검색 ---------- */

export async function searchMedia(s: Settings, q: string, source: string): Promise<MediaHit[]> {
  if (source === 'mine') {
    const all = await scanAssets(s);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((a) => (a.kind === 'image' || a.kind === 'video') && (!words.length || words.some((w) => a.name.toLowerCase().includes(w))))
      .slice(0, 60).map((a) => ({ id: a.id, source: 'mine', kind: a.kind as 'image' | 'video', thumb: a.url, url: a.url, title: a.name, credit: '내 파일', license: '내 파일' }));
  }
  return searchRemoteMedia(s, q, source);
}

/** 고른 사진·영상을 프로젝트 폴더로 내려받기 */
export async function downloadToProject(projectId: string, url: string, hint: string): Promise<string> {
  const dir = path.join(projectDir(projectId), 'media');
  fs.mkdirSync(dir, { recursive: true });
  const r = await fetch(url, { headers: { 'user-agent': 'InfoCutStudio/1.0' } });
  if (!r.ok) throw new Error(`내려받기 실패 ${r.status}`);
  const type = r.headers.get('content-type') || '';
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('video') ? '.mp4' : (path.extname(new URL(url).pathname).toLowerCase() || '.jpg');
  const name = `${hint.replace(/[^\w가-힣-]/g, '').slice(0, 24) || 'media'}_${Date.now().toString(36)}${ext}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
  return `/files/projects/${projectId}/media/${name}`;
}

/** 내 에셋 폴더의 파일을 프로젝트로 복사 (프리미어 내보내기 때 경로가 안 깨지게) */
export function copyAssetToProject(projectId: string, file: string): string {
  const dir = path.join(projectDir(projectId), 'media');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now().toString(36)}_${path.basename(file).replace(/[^\w가-힣.-]/g, '_')}`;
  fs.copyFileSync(file, path.join(dir, name));
  return `/files/projects/${projectId}/media/${name}`;
}
