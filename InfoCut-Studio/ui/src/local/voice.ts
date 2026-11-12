// 휴대폰에서 목소리 만들기: 기기 기본 목소리(무료) · OpenAI · ElevenLabs
import type { Project, Timing } from '../../../src/shared/types';
import type { Settings } from '../../../src/shared/settings';
import { buildTiming, spokenText, type AudioInfo, type WordMark } from '../../../src/shared/timing';
import { http } from '../../../src/shared/ai/net';
import { getFile, putFile, refOf } from './files';
import { InfoCut, b64ToBytes, isNative } from './native';

export const OPENAI_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'].map((v) => ({ id: v, name: v }));

export async function deviceVoices() {
  if (!isNative) return [];
  try { return (await InfoCut.voices()).voices; } catch { return []; }
}

export async function elevenVoices(s: Settings) {
  if (!s.keys.elevenlabs) return [];
  try {
    const r = await http('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': s.keys.elevenlabs } });
    if (!r.ok) return [];
    return ((await r.json()).voices || []).map((v: any) => ({ id: v.voice_id, name: v.name }));
  } catch { return []; }
}

async function sha1(text: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

let ctx: AudioContext | null = null;
export async function audioSeconds(blob: Blob): Promise<number> {
  ctx ||= new AudioContext();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  return buf.duration;
}

async function synth(s: Settings, engine: string, text: string, voice: string, rate: string): Promise<{ blob: Blob; ext: string; words?: WordMark[] }> {
  const speed = Number(rate) || 1;
  if (engine === 'edge') throw new Error('edge 목소리는 PC 전용이에요. 소리에서 엔진을 바꿔 주세요.');
  if (engine === 'device') {
    if (!isNative) throw new Error('기본 목소리는 안드로이드 앱에서만 돼요. 소리에서 엔진을 바꾸거나 나레이션을 꺼 주세요.');
    const r = await InfoCut.speak({ text, voice, rate: speed });
    return { blob: new Blob([b64ToBytes(r.base64)], { type: 'audio/wav' }), ext: 'wav' };
  }
  if (engine === 'openai') {
    if (!s.keys.openai) throw new Error('OpenAI 키가 없어요. 설정에서 넣어 주세요.');
    const r = await http('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { authorization: `Bearer ${s.keys.openai}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3', speed, instructions: '한국어 정보 영상 나레이션. 차분하고 또렷하게.' }),
    });
    if (!r.ok) throw new Error(`OpenAI 목소리 오류 ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { blob: new Blob([await r.arrayBuffer()], { type: 'audio/mpeg' }), ext: 'mp3' };
  }
  if (!s.keys.elevenlabs) throw new Error('ElevenLabs 키가 없어요. 설정에서 넣어 주세요.');
  const r = await http(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps`, {
    method: 'POST', headers: { 'xi-api-key': s.keys.elevenlabs, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, speed } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs 오류 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const chars: string[] = j.alignment?.characters || [];
  const starts: number[] = j.alignment?.character_start_times_seconds || [];
  const words: WordMark[] = [];
  let cur = '', st = 0;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) words.push({ offset: st, text: cur }); cur = ''; }
    else { if (!cur) st = starts[i] ?? 0; cur += c; }
  });
  if (cur) words.push({ offset: st, text: cur });
  return { blob: new Blob([b64ToBytes(j.audio_base64)], { type: 'audio/mpeg' }), ext: 'mp3', words };
}

interface Meta { seconds: number; words?: WordMark[] }

/** 모든 장면의 목소리를 만들고(바뀐 장면만) 시간표를 계산한다 */
export async function voiceProject(s: Settings, p: Project, step: (m: string, pr?: number) => void): Promise<Timing> {
  const n = p.narration;
  const info: Record<string, AudioInfo> = {};
  const todo = p.scenes.filter((sc) => n.enabled && !sc.mute && spokenText(sc));
  let done = 0;
  for (const sc of todo) {
    const text = (sc.say || spokenText(sc)).trim();
    const hash = await sha1([n.engine, n.voice, n.rate, text].join('|'));
    let ref = '';
    for (const ext of ['wav', 'mp3']) if (await getFile(refOf(p.id, 'audio', `${hash}.${ext}`))) ref = refOf(p.id, 'audio', `${hash}.${ext}`);
    let meta: Meta | undefined;
    if (ref) {
      const m = await getFile(refOf(p.id, 'audio', `${hash}.json`));
      if (m) meta = JSON.parse(await m.blob.text());
    } else {
      step(`목소리 만드는 중 ${done + 1}/${todo.length}`, done / Math.max(todo.length, 1));
      const out = await synth(s, n.engine, text, n.voice, n.rate);
      if (out.blob.size < 200) throw new Error('목소리 파일이 비어 있어요.');
      ref = await putFile(p.id, 'audio', `${hash}.${out.ext}`, out.blob);
      meta = { seconds: await audioSeconds(out.blob), words: out.words };
      await putFile(p.id, 'audio', `${hash}.json`, new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    }
    if (!meta) {
      const f = await getFile(ref);
      meta = { seconds: f ? await audioSeconds(f.blob) : 0 };
    }
    done++;
    // 목소리가 say 로 바뀐 경우 자막 단어 수와 다르므로 단어 경계를 쓰지 않는다
    const words = sc.say && sc.say.trim() !== spokenText(sc) ? undefined : meta.words;
    info[sc.id] = { url: ref, seconds: meta.seconds, words };
  }
  step('장면 시간 계산 중', 0.98);
  return buildTiming(p, info);
}
