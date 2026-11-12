// 나레이션: edge-tts(무료) · OpenAI TTS · ElevenLabs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { parseFile } from 'music-metadata';
import type { Project } from '../src/shared/types';
import { buildTiming, spokenText, type AudioInfo, type WordMark } from '../src/shared/timing';
import { APP_DIR, projectDir, type Settings } from './store';

export const VOICES = {
  edge: [
    { id: 'ko-KR-InJoonNeural', name: '인준 (남, 차분)' },
    { id: 'ko-KR-HyunsuMultilingualNeural', name: '현수 (남, 자연스러움)' },
    { id: 'ko-KR-SunHiNeural', name: '선희 (여, 또렷)' },
  ],
  openai: ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'].map((v) => ({ id: v, name: v })),
  elevenlabs: [] as { id: string; name: string }[],
};

let pythonCache = '';
export function findPython(s: Settings): string {
  if (s.python) return s.python;
  if (pythonCache) return pythonCache;
  for (const c of process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']) {
    const r = spawnSync(c, ['-c', 'import edge_tts; print(1)'], { encoding: 'utf8' });
    if (r.status === 0) return (pythonCache = c);
  }
  for (const c of process.platform === 'win32' ? ['python', 'py'] : ['python3']) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return (pythonCache = c);
  }
  return '';
}

export function voiceStatus(s: Settings) {
  const py = findPython(s);
  let edge = false;
  if (py) edge = spawnSync(py, ['-c', 'import edge_tts'], { encoding: 'utf8' }).status === 0;
  return { python: py || null, edge, openai: !!s.keys.openai, elevenlabs: !!s.keys.elevenlabs };
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().slice(-400) || `종료 코드 ${code}`))));
  });
}

async function synthEdge(s: Settings, text: string, voice: string, rate: string, out: string, wordsFile: string) {
  const py = findPython(s);
  if (!py) throw new Error('파이썬을 찾지 못했어요. 설치.bat 을 다시 실행하거나, 설정에서 나레이션 엔진을 바꿔 주세요.');
  await run(py, [path.join(APP_DIR, 'tools', 'tts_edge.py'), '--text', text, '--voice', voice, '--rate', rate, '--out', out, '--words', wordsFile]);
}

async function synthOpenAI(s: Settings, text: string, voice: string, rate: string, out: string) {
  const speed = Number(rate) || 1;
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${s.keys.openai}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3', speed, instructions: '한국어 정보 영상 나레이션. 차분하고 또렷하게.' }),
  });
  if (!r.ok) throw new Error(`OpenAI 목소리 오류 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

async function synthEleven(s: Settings, text: string, voice: string, rate: string, out: string, wordsFile: string) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': s.keys.elevenlabs, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Number(rate) || 1 } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs 오류 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  fs.writeFileSync(out, Buffer.from(j.audio_base64, 'base64'));
  const chars: string[] = j.alignment?.characters || [];
  const starts: number[] = j.alignment?.character_start_times_seconds || [];
  const words: WordMark[] = [];
  let cur = '', st = 0;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) words.push({ offset: st, text: cur }); cur = ''; }
    else { if (!cur) st = starts[i] ?? 0; cur += c; }
  });
  if (cur) words.push({ offset: st, text: cur });
  fs.writeFileSync(wordsFile, JSON.stringify(words));
}

export async function listElevenVoices(s: Settings) {
  if (!s.keys.elevenlabs) return [];
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': s.keys.elevenlabs } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.voices || []).map((v: any) => ({ id: v.voice_id, name: v.name }));
}

/** 모든 장면의 목소리를 만들고(바뀐 장면만) 시간표를 계산한다 */
export async function voiceProject(s: Settings, p: Project, step: (m: string, pr?: number) => void, only?: string[]) {
  const dir = path.join(projectDir(p.id), 'audio');
  fs.mkdirSync(dir, { recursive: true });
  const info: Record<string, AudioInfo> = {};
  const n = p.narration;
  const todo = p.scenes.filter((sc) => n.enabled && !sc.mute && spokenText(sc));
  let done = 0;
  for (const sc of p.scenes) {
    if (!n.enabled || sc.mute) continue;
    const text = (sc.say || spokenText(sc)).trim();
    if (!text) continue;
    const hash = crypto.createHash('sha1').update([n.engine, n.voice, n.rate, text].join('|')).digest('hex').slice(0, 12);
    // 휴대폰에서 만들어 가져온 목소리는 같은 이름의 .wav 로 들어 있다
    const wav = path.join(dir, `${hash}.wav`);
    const out = fs.existsSync(wav) ? wav : path.join(dir, `${hash}.mp3`);
    const wordsFile = path.join(dir, `${hash}.json`);
    if (!fs.existsSync(out) && (!only || only.includes(sc.id))) {
      step(`목소리 만드는 중 ${done + 1}/${todo.length}: ${text.slice(0, 24)}`, done / Math.max(todo.length, 1));
      const part = `${out}.part`;
      try {
        if (n.engine === 'device') throw new Error('휴대폰 기본 목소리는 PC 에서 만들 수 없어요. 소리에서 엔진을 바꿔 주세요.');
        if (n.engine === 'edge') await synthEdge(s, text, n.voice, n.rate, part, wordsFile);
        else if (n.engine === 'openai') await synthOpenAI(s, text, n.voice, n.rate, part);
        else await synthEleven(s, text, n.voice, n.rate, part, wordsFile);
        if (!fs.existsSync(part) || fs.statSync(part).size < 200) throw new Error('목소리 파일이 비어 있어요. 인터넷 연결을 확인해 주세요.');
        fs.renameSync(part, out);
      } catch (e) {
        fs.rmSync(part, { force: true });
        throw e;
      }
    }
    done++;
    if (!fs.existsSync(out)) continue;
    const meta = await parseFile(out, { duration: true });
    let words: WordMark[] | undefined;
    try { words = JSON.parse(fs.readFileSync(wordsFile, 'utf8')); } catch { words = undefined; }
    // 목소리가 say 로 바뀐 경우 자막 단어 수와 다르므로 단어 경계를 쓰지 않는다
    if (sc.say && sc.say.trim() !== spokenText(sc)) words = undefined;
    info[sc.id] = { url: `/files/projects/${p.id}/audio/${path.basename(out)}`, seconds: meta.format.duration || 0, words };
  }
  step('장면 시간 계산 중', 0.98);
  return buildTiming(p, info);
}
