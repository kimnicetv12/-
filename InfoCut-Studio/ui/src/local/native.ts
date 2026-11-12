// 안드로이드 앱 전용 기능 (기본 목소리, 갤러리 저장, 공유, CORS 없는 요청)
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { setHttpFetch } from '../../../src/shared/ai/net';

export const isNative = Capacitor.isNativePlatform();

interface InfoCutPlugin {
  voices(): Promise<{ voices: { id: string; name: string }[] }>;
  speak(o: { text: string; voice: string; rate: number }): Promise<{ base64: string }>;
  saveBegin(o: { name: string; mime: string; folder: 'movies' | 'downloads' }): Promise<{ id: string }>;
  saveChunk(o: { id: string; base64: string }): Promise<void>;
  saveEnd(o: { id: string }): Promise<{ uri: string }>;
  share(o: { uri: string; mime: string; title: string }): Promise<void>;
  keepAwake(o: { on: boolean }): Promise<void>;
}

export const InfoCut = registerPlugin<InfoCutPlugin>('InfoCut');

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 앱에서는 브라우저 제한(CORS)이 없는 네이티브 요청을 쓴다 */
export function installNativeHttp() {
  if (!isNative) return;
  setHttpFetch(async (url, init) => {
    const r = await CapacitorHttp.request({
      url, method: init?.method || 'GET', headers: init?.headers, data: init?.body,
      responseType: 'arraybuffer', connectTimeout: 20000, readTimeout: init?.timeoutMs || 120000,
    });
    const body = typeof r.data === 'string' ? b64ToBytes(r.data) : new TextEncoder().encode(JSON.stringify(r.data ?? ''));
    const status = r.status >= 200 && r.status <= 599 ? r.status : 502;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.headers || {})) if (typeof v === 'string' && /^[\w-]+$/.test(k)) headers[k] = v;
    return new Response([204, 205, 304].includes(status) ? null : body, { status, headers });
  });
}

/** 파일을 갤러리(영상)나 다운로드 폴더에 저장한다. 앱이 아니면 브라우저 내려받기 */
export async function saveToDevice(blob: Blob, name: string, folder: 'movies' | 'downloads'): Promise<string | null> {
  if (!isNative) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return null;
  }
  const { id } = await InfoCut.saveBegin({ name, mime: blob.type || 'application/octet-stream', folder });
  const CHUNK = 768 * 1024;
  for (let at = 0; at < blob.size; at += CHUNK) {
    const part = new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer());
    await InfoCut.saveChunk({ id, base64: bytesToB64(part) });
  }
  return (await InfoCut.saveEnd({ id })).uri;
}
