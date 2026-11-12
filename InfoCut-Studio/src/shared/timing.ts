import type { CaptionCue, Format, Project, Scene, SceneTiming, Timing } from './types';

/** 자막 한 줄 최대 글자 수 */
export const CAPTION_CHARS: Record<Format, number> = { shorts: 15, long: 30 };
/** 목소리 없이 자막만 쓸 때 초당 글자 수 */
const SILENT_CPS = 6.5;

export interface WordMark { offset: number; text: string }
export interface AudioInfo { url: string; seconds: number; words?: WordMark[] }

const visibleLen = (s: string) => s.replace(/\s+/g, '').length;

/** 화면에 보일 문장 (끊는 표시 제거) */
export const spokenText = (s: Scene) => s.text.replace(/\s*\/\s*/g, ' ').trim();

/** 자막 덩어리로 나누기: " / " 를 먼저 따르고, 긴 줄은 어절 단위로 줄인다 */
export function splitCaptions(text: string, format: Format, scale = 1): string[] {
  const max = Math.max(8, Math.round(CAPTION_CHARS[format] / Math.max(0.6, scale)));
  const parts = text.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const words = part.split(/\s+/);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (visibleLen(next) > max && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    if (line) out.push(line);
  }
  // 한 글자짜리 꼬리는 앞 줄에 붙인다
  for (let i = out.length - 1; i > 0; i--) {
    if (visibleLen(out[i]) <= 2) {
      out[i - 1] = `${out[i - 1]} ${out[i]}`;
      out.splice(i, 1);
    }
  }
  return out.length ? out : [''];
}

export function estimateSeconds(text: string): number {
  const len = visibleLen(text);
  const pauses = (text.match(/[,.?!…]/g) || []).length * 0.12;
  return Math.max(0.8, len / SILENT_CPS + pauses);
}

export function timingSignature(p: Project): string {
  const key = JSON.stringify({
    f: p.format, fps: p.fps, n: p.narration, cs: p.design.captionScale,
    s: p.scenes.map((s) => [s.id, s.text, s.say, s.mute, s.hold, s.duration]),
  });
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** 장면 길이와 자막 시간을 계산한다. audio 가 없으면 글자 수로 추정 */
export function buildTiming(p: Project, audio: Record<string, AudioInfo | undefined> = {}): Timing {
  const fps = p.fps;
  let cursor = 0;
  const scenes: SceneTiming[] = p.scenes.map((s) => {
    const text = spokenText(s);
    const a = p.narration.enabled && !s.mute ? audio[s.id] : undefined;
    const speech = a ? a.seconds : estimateSeconds(text);
    const lead = 0.15;
    const hold = s.hold ?? 0.25;
    let seconds = s.duration && s.duration > 0 ? s.duration : lead + speech + hold;
    seconds = Math.max(seconds, 1.2);
    const frames = Math.round(seconds * fps);
    const cues = splitCaptions(s.text, p.format, p.design.captionScale);
    const captions = cueTimes(cues, speech, a?.words, lead, fps, frames);
    const t: SceneTiming = { id: s.id, start: cursor, frames, captions };
    if (a) {
      t.audio = a.url;
      t.audioFrames = Math.round(a.seconds * fps);
    }
    cursor += frames;
    return t;
  });
  return { fps, totalFrames: Math.max(cursor, fps), scenes, signature: timingSignature(p) };
}

function cueTimes(cues: string[], speech: number, words: WordMark[] | undefined, lead: number, fps: number, frames: number): CaptionCue[] {
  const total = cues.reduce((n, c) => n + visibleLen(c), 0) || 1;
  const out: CaptionCue[] = [];
  if (words && words.length) {
    // 단어 경계를 따라 자막 시작 시간을 맞춘다
    let wi = 0;
    cues.forEach((c, i) => {
      const n = c.split(/\s+/).filter(Boolean).length;
      const startSec = words[Math.min(wi, words.length - 1)]?.offset ?? 0;
      wi += n;
      out.push({ text: c, start: Math.round((lead + startSec) * fps), end: 0 });
      if (i > 0) out[i - 1].end = out[i].start;
    });
  } else {
    let acc = 0;
    cues.forEach((c) => {
      out.push({ text: c, start: Math.round((lead + (acc / total) * speech) * fps), end: 0 });
      acc += visibleLen(c);
      if (out.length > 1) out[out.length - 2].end = out[out.length - 1].start;
    });
  }
  if (out.length) {
    out[0].start = Math.min(out[0].start, Math.round(lead * fps));
    out[out.length - 1].end = frames;
  }
  return out.filter((c) => c.text);
}

export const sceneAt = (t: Timing, frame: number) =>
  t.scenes.findIndex((s) => frame >= s.start && frame < s.start + s.frames);

export const fmtTime = (frames: number, fps: number) => {
  const s = Math.floor(frames / fps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
