// 프리미어 프로 내보내기: Final Cut Pro 7 XML (프리미어 [파일 > 가져오기]로 열림)
// V1 배경 · V2 화면(투명) · V3 자막(PNG 한 장씩) / A1 나레이션 · A2 효과음 · A3 배경음악 / 장면·장 마커
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import type { Project, Timing } from '../src/shared/types';
import { DIMENSIONS } from '../src/shared/types';
import { sfxRoleFor } from '../src/shared/sfx';
import { decodeAssetUrl } from './assets';
import { PROJECTS_DIR, projectDir, type Settings } from './store';
import { renderLayers } from './render';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function pathUrl(p: string) {
  const abs = path.resolve(p).replace(/\\/g, '/');
  const parts = abs.split('/').map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? `${seg[0]}%3a` : encodeURIComponent(seg)));
  return `file://localhost${abs.startsWith('/') ? '' : '/'}${parts.join('/')}`;
}

/** 화면 주소(/files/..., /asset/...) → 실제 파일 경로 */
export function urlToPath(url: string | undefined | null, s: Settings): string | null {
  if (!url) return null;
  if (url.startsWith('/files/projects/')) {
    const p = path.join(PROJECTS_DIR, ...decodeURIComponent(url.slice('/files/projects/'.length)).split('/'));
    return fs.existsSync(p) ? p : null;
  }
  if (url.startsWith('/asset/')) return decodeAssetUrl(url.slice('/asset/'.length), s);
  return null;
}

interface Clip { name: string; file: string; start: number; end: number; in: number; out: number; srcDur: number; kind: 'video' | 'still' | 'audio' }

export async function exportPremiere(s: Settings, p: Project, timing: Timing, opts: { visual: boolean }, step: (m: string, pr?: number) => void) {
  const dir = path.join(projectDir(p.id), 'exports', 'premiere');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const fps = timing.fps;
  const total = timing.totalFrames;
  const lead = Math.round(0.15 * fps);

  const layers = await renderLayers(s, p, timing, dir, opts, (m, pr) => step(m, (pr ?? 0) * 0.85));
  step('타임라인 파일 쓰는 중', 0.88);

  const copy = (src: string, sub: string) => {
    const dst = path.join(dir, 'media', sub, path.basename(src));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
    return dst;
  };
  const audioFrames = async (f: string) => {
    try { const m = await parseFile(f, { duration: true }); return Math.max(1, Math.round((m.format.duration || 1) * fps)); } catch { return fps; }
  };

  const v1: Clip[] = [{ name: '배경', file: layers.background, start: 0, end: total, in: 0, out: total, srcDur: total, kind: 'still' }];
  const v2: Clip[] = layers.visual
    ? timing.scenes.map((t, i) => ({ name: `${i + 1}. ${p.scenes[i]?.text.slice(0, 20) || ''}`, file: layers.visual!, start: t.start, end: t.start + t.frames, in: t.start, out: t.start + t.frames, srcDur: total, kind: 'video' as const }))
    : [];
  const v3: Clip[] = layers.captions.map((c, i) => ({ name: `자막 ${i + 1}`, file: c.file, start: c.start, end: Math.max(c.end, c.start + 1), in: 0, out: Math.max(c.end, c.start + 1) - c.start, srcDur: Math.max(c.end, c.start + 1) - c.start, kind: 'still' }));

  const a1: Clip[] = [];
  for (const [i, t] of timing.scenes.entries()) {
    const f = urlToPath(t.audio, s);
    if (!f) continue;
    const local = copy(f, 'narration');
    const len = t.audioFrames || (await audioFrames(local));
    const start = t.start + lead;
    const end = Math.min(start + len, t.start + t.frames);
    a1.push({ name: `나레이션 ${i + 1}`, file: local, start, end, in: 0, out: end - start, srcDur: len, kind: 'audio' });
  }
  const a2: Clip[] = [];
  if (p.audio.sfx) {
    for (const [i, sc] of p.scenes.entries()) {
      const role = sfxRoleFor(sc, i);
      const f = role ? urlToPath(p.audio.sfxMap[role], s) : null;
      const t = timing.scenes[i];
      if (!f || !t) continue;
      const local = copy(f, 'sfx');
      const len = await audioFrames(local);
      const end = Math.min(t.start + len, total);
      a2.push({ name: path.basename(local), file: local, start: t.start, end, in: 0, out: end - t.start, srcDur: len, kind: 'audio' });
    }
  }
  const a3: Clip[] = [];
  const bgm = urlToPath(p.audio.bgm, s);
  if (bgm) {
    const local = copy(bgm, 'bgm');
    const len = await audioFrames(local);
    for (let at = 0; at < total; at += len) {
      const end = Math.min(at + len, total);
      a3.push({ name: path.basename(local), file: local, start: at, end, in: 0, out: end - at, srcDur: len, kind: 'audio' });
    }
  }

  // 원본 사진·영상은 바꿔 끼우기 쉽게 따로 모아 둔다
  for (const sc of p.scenes) {
    const v = sc.visual as any;
    for (const m of [v.media, v.left?.media, v.right?.media]) {
      const f = urlToPath(m?.src, s);
      if (f) copy(f, '원본_사진영상');
    }
  }

  const name = (p.title || p.id).replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
  const xml = buildXml(p, timing, name, { v1, v2, v3, a1, a2, a3 });
  const xmlPath = path.join(dir, `${name}_프리미어.xml`);
  fs.writeFileSync(xmlPath, xml, 'utf8');

  // 자막 파일 · MOGRT 패널용 자막 목록
  const sec = (f: number) => f / fps;
  const srt = layers.captions.map((c, i) => `${i + 1}\n${srtTime(sec(c.start))} --> ${srtTime(sec(c.end))}\n${c.text}\n`).join('\n');
  fs.writeFileSync(path.join(dir, '자막.srt'), '﻿' + srt, 'utf8');
  fs.writeFileSync(path.join(dir, 'infocut_captions.json'), JSON.stringify({
    title: name, fps, width: DIMENSIONS[p.format].width, height: DIMENSIONS[p.format].height, captionTrack: 3,
    captions: layers.captions.map((c) => ({ start: sec(c.start), end: sec(c.end), text: c.text })),
    scenes: timing.scenes.map((t, i) => ({ start: sec(t.start), end: sec(t.start + t.frames), text: p.scenes[i]?.text || '', type: p.scenes[i]?.visual.type })),
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, '프리미어에서_여는_법.txt'), HOWTO(name, !!layers.visual), 'utf8');
  step('프리미어용 폴더 완성', 1);
  return { folder: dir, xml: xmlPath };
}

function srtTime(t: number) {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}

function buildXml(p: Project, timing: Timing, name: string, t: Record<'v1' | 'v2' | 'v3' | 'a1' | 'a2' | 'a3', Clip[]>) {
  const { width, height } = DIMENSIONS[p.format];
  const fps = timing.fps;
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const files = new Map<string, string>();
  let clipN = 0;
  const fileEl = (c: Clip) => {
    const known = files.get(c.file);
    if (known) return `<file id="${known}"/>`;
    const id = `file-${files.size + 1}`;
    files.set(c.file, id);
    const media = c.kind === 'audio'
      ? `<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>`
      : `<video><samplecharacteristics>${rate}<width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>`;
    return `<file id="${id}"><name>${esc(path.basename(c.file))}</name><pathurl>${esc(pathUrl(c.file))}</pathurl>${rate}<duration>${c.srcDur}</duration><media>${media}</media></file>`;
  };
  const clipEl = (c: Clip, trackIndex: number) => {
    clipN++;
    const audio = c.kind === 'audio';
    return `<clipitem id="clipitem-${clipN}"><masterclipid>masterclip-${crypto.createHash('md5').update(c.file).digest('hex').slice(0, 8)}</masterclipid><name>${esc(c.name)}</name><enabled>TRUE</enabled><duration>${c.srcDur}</duration>${rate}<start>${c.start}</start><end>${c.end}</end><in>${c.in}</in><out>${c.out}</out>${c.kind === 'still' ? '<stillframe>TRUE</stillframe>' : ''}${fileEl(c)}${audio ? `<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>` : ''}<labels><label2>${audio ? (trackIndex === 1 ? 'Iris' : trackIndex === 2 ? 'Mango' : 'Forest') : (trackIndex === 3 ? 'Lavender' : 'Cerulean')}</label2></labels></clipitem>`;
  };
  const track = (clips: Clip[], idx: number) => `<track>${clips.map((c) => clipEl(c, idx)).join('')}<enabled>TRUE</enabled><locked>FALSE</locked></track>`;
  const markers = timing.scenes.map((sc, i) => {
    const scene = p.scenes[i];
    const isChapter = scene?.visual.type === 'chapter';
    const label = isChapter ? `[장] ${(scene.visual as any).heading}` : `#${i + 1} ${scene?.visual.type || ''}`;
    return `<marker><comment>${esc(scene?.text || '')}</comment><name>${esc(label)}</name><in>${sc.start}</in><out>-1</out></marker>`;
  }).join('');
  // 트랙 번호를 늘 같게: V1 배경 · V2 화면(없으면 빈 트랙) · V3 그림 자막 · V4 MOGRT 자막 자리(비어 있음)
  const videoTracks = [track(t.v1, 1), track(t.v2, 2), track(t.v3, 3), track([], 4)].join('');
  const audioTracks = [track(t.a1, 1), track(t.a2, 2), track(t.a3, 3)].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="sequence-1">
<uuid>${crypto.randomUUID()}</uuid>
<name>${esc(name)}</name>
<duration>${timing.totalFrames}</duration>
${rate}
<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
<media>
<video><format><samplecharacteristics>${rate}<width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance><colordepth>24</colordepth></samplecharacteristics></format>
${videoTracks}
</video>
<audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>
${audioTracks}
</audio>
</media>
${markers}
</sequence>
</xmeml>
`;
}

const HOWTO = (name: string, visual: boolean) => `프리미어 프로에서 이어서 편집하기 — ${name}

1. 프리미어 프로를 열고 [파일 > 가져오기]로 "${name}_프리미어.xml" 을 고릅니다.
   (InfoCut 패널을 설치했다면 [창 > 확장 > InfoCut Bridge] 에서 [XML 가져오기]를 눌러도 됩니다.)
2. 프로젝트 창에 같은 이름의 시퀀스가 생겨요. 두 번 눌러 엽니다.

트랙 구성
  V1  배경 (정지 그림 한 장)
${visual ? '  V2  장면 화면 — 투명 배경 ProRes 4444. 장면마다 잘려 있어서 지우거나 바꿔 끼우기 쉬워요\n' : '  V2  (화면 레이어를 빼고 내보냄)\n'}  V3  자막 — 자막 한 줄 = 그림 한 장. 문구를 바꾸려면 InfoCut 에서 고친 뒤 다시 내보내거나,
       InfoCut 패널의 [MOGRT 자막 적용]으로 내 자막 템플릿(.mogrt)으로 바꿔 넣으세요
  V4  비어 있음 — InfoCut 패널이 MOGRT 자막을 여기에 올려요
  A1  나레이션 (장면별 파일)
  A2  효과음
  A3  배경음악
  마커  장면마다 하나 (마커 설명에 대본 문장), 장이 바뀌는 곳은 [장] 표시

같이 들어 있는 것
  자막.srt                  프리미어 [파일 > 가져오기]로 캡션 트랙을 만들 때
  infocut_captions.json     InfoCut 패널이 MOGRT 자막을 만들 때 읽는 파일
  media/원본_사진영상        영상에 쓴 원본 사진·영상 (바꿔 끼울 때)
  layers/                   렌더링된 레이어 파일

파일을 옮기면 프리미어가 "미디어 연결"을 물어봐요. 이 폴더째 옮기면 다시 연결하기 쉬워요.
`;
