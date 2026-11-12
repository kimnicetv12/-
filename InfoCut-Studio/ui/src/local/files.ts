// 휴대폰에 넣어 둔 사진·소리. 주소는 "idb:<프로젝트>/<media|audio|export>/<이름>"
import { db } from './db';

export interface FileRec { name: string; type: string; blob: Blob; at: number; seconds?: number }

/** 내 효과음·음악 보관함 */
export const LIB = 'lib';

const urls = new Map<string, string>();

export const keyOf = (ref: string) => ref.replace(/^idb:/, '');
export const refOf = (project: string, dir: string, name: string) => `idb:${project}/${dir}/${name}`;

/** idb: 주소 → 화면에서 쓸 수 있는 주소 (미리 prime 해 둔 것만) */
export const urlOf = (ref: string): string | null => (ref.startsWith('idb:') ? urls.get(keyOf(ref)) ?? null : null);

function remember(key: string, blob: Blob) {
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.set(key, URL.createObjectURL(blob));
}

/** 프로젝트를 열 때 그 프로젝트와 보관함의 파일 주소를 준비한다 */
export async function prime(project: string) {
  for (const p of [`${project}/`, `${LIB}/`]) {
    const keys = await db.keys('files', p);
    const recs = await db.all<FileRec>('files', p);
    keys.forEach((k, i) => { if (!urls.has(k)) remember(k, recs[i].blob); });
  }
}

export async function putFile(project: string, dir: string, name: string, blob: Blob, seconds?: number): Promise<string> {
  const key = `${project}/${dir}/${name}`;
  await db.put('files', key, { name, type: blob.type, blob, at: Date.now(), seconds } satisfies FileRec);
  remember(key, blob);
  return `idb:${key}`;
}

export const getFile = (ref: string) => db.get<FileRec>('files', keyOf(ref));
export const hasFile = async (ref: string) => !!(await getFile(ref));
export const listFiles = async (p: string) => {
  const keys = await db.keys('files', p);
  const recs = await db.all<FileRec>('files', p);
  return keys.map((k, i) => ({ ref: `idb:${k}`, ...recs[i] }));
};

export async function removeFiles(p: string) {
  for (const k of await db.keys('files', p)) {
    const u = urls.get(k);
    if (u) { URL.revokeObjectURL(u); urls.delete(k); }
  }
  await db.delPrefix('files', p);
}

export const safeName = (raw: string) => raw.replace(/[^\w가-힣.-]/g, '_').slice(-80);
