// .infocut 파일: PC 와 휴대폰이 프로젝트를 주고받는 묶음 (zip: project.json + media/ + audio/)
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Project } from './types';

/** 프로젝트 안에서 파일을 가리키는 주소인지 */
export const isFileRef = (v: string) => /^(\/files\/|\/asset\/|\/sfx\/|idb:|pkg:)/.test(v);

function walk(node: unknown, fn: (v: string) => string | undefined): unknown {
  if (typeof node === 'string') return isFileRef(node) ? (fn(node) ?? node) : node;
  if (Array.isArray(node)) return node.map((x) => walk(x, fn));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = k === 'research' ? v : walk(v, fn);
    return out;
  }
  return node;
}

export function collectRefs(p: Project): string[] {
  const set = new Set<string>();
  walk(p, (v) => { set.add(v); return undefined; });
  return [...set];
}

export const mapRefs = (p: Project, fn: (ref: string) => string | undefined): Project => walk(p, fn) as Project;

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|json)$/i;
const BUILTIN = /^builtin_[a-z]+\.wav$/;

export interface PackFile { name: string; data: Uint8Array }

export async function packProject(p: Project, read: (ref: string) => Promise<PackFile | null>): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const ref of collectRefs(p)) {
    const f = await read(ref).catch(() => null);
    if (!f) continue;
    if (BUILTIN.test(f.name)) { map.set(ref, `pkg:builtin/${f.name}`); continue; }
    const dir = AUDIO_EXT.test(f.name) ? 'audio' : 'media';
    let name = f.name.replace(/[^\w가-힣.-]/g, '_');
    for (let n = 2; used.has(`${dir}/${name}`); n++) name = `${n}_${f.name.replace(/[^\w가-힣.-]/g, '_')}`;
    used.add(`${dir}/${name}`);
    files[`${dir}/${name}`] = f.data;
    map.set(ref, `pkg:${dir}/${name}`);
  }
  const packed = mapRefs(p, (r) => map.get(r));
  files['project.json'] = strToU8(JSON.stringify(packed));
  // 사진·소리는 이미 압축돼 있어서 다시 압축하지 않는다
  return zipSync(files, { level: 0 });
}

export async function unpackProject(
  zip: Uint8Array,
  newId: string,
  write: (dir: 'media' | 'audio', name: string, data: Uint8Array) => Promise<string>,
  builtin: (name: string) => string | undefined,
): Promise<Project> {
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(zip); } catch { throw new Error('.infocut 파일을 열 수 없어요.'); }
  if (!entries['project.json']) throw new Error('.infocut 파일이 아니에요.');
  const p = JSON.parse(strFromU8(entries['project.json'])) as Project;
  p.id = newId;
  const map = new Map<string, string>();
  for (const [path, data] of Object.entries(entries)) {
    const m = /^(media|audio)\/([^/]+)$/.exec(path);
    if (!m) continue;
    map.set(`pkg:${path}`, await write(m[1] as 'media' | 'audio', m[2], data));
  }
  return mapRefs(p, (r) => {
    if (r.startsWith('pkg:builtin/')) return builtin(r.slice(12)) ?? '';
    if (r.startsWith('pkg:')) return map.get(r) ?? '';
    return '';
  });
}
