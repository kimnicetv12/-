import React, { useEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Img, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { loadFont } from '@remotion/fonts';
import type { Project, Scene, SceneTiming, VideoProps } from '../shared/types';
import { sfxRoleFor } from '../shared/sfx';
import { Background, resolveSrc } from './parts';
import { FONT, makeLayout, makeTheme, normalizeDesign, type Layout, type Theme } from './theme';
import { VisualView } from './Visuals';

const WEIGHTS: [string, string][] = [['Regular', '400'], ['Medium', '500'], ['SemiBold', '600'], ['Bold', '700'], ['ExtraBold', '800']];
const loaded = new Set<string>();

function useFonts(base: string) {
  const [handle] = useState(() => (loaded.has(base) ? null : delayRender('글꼴 불러오기')));
  useEffect(() => {
    if (handle === null) return;
    Promise.all(WEIGHTS.map(([n, w]) => loadFont({ family: 'Pretendard', url: resolveSrc(base, `/fonts/Pretendard-${n}.woff2`), weight: w })))
      .catch(() => undefined)
      .finally(() => { loaded.add(base); continueRender(handle); });
  }, [base, handle]);
}

/** 각 장면이 속한 장 (롱폼 장 라벨용) */
function chapterOf(scenes: Scene[]) {
  let cur: { index: number; heading: string } | null = null;
  return scenes.map((s) => {
    if (s.visual.type === 'chapter') cur = { index: s.visual.index, heading: s.visual.heading };
    return cur;
  });
}

export const InfoVideo: React.FC<VideoProps> = ({ project: raw, timing, layer, base }) => {
  useFonts(base);
  const { fps, durationInFrames } = useVideoConfig();
  const project: Project = useMemo(() => ({ ...raw, design: normalizeDesign(raw.design) }), [raw]);
  const theme = useMemo(() => makeTheme(project.design), [project.design]);
  const L = useMemo(() => makeLayout(project.format, project.design), [project.format, project.design]);
  const chapters = useMemo(() => chapterOf(project.scenes), [project.scenes]);
  const showBg = layer === 'all' || layer === 'background' || layer === 'nocaptions';
  const showVisual = layer === 'all' || layer === 'visual' || layer === 'nocaptions';
  const showCaptions = layer === 'all' || layer === 'captions';
  const withAudio = layer === 'all' || layer === 'nocaptions';
  const lead = Math.round(0.15 * fps);
  const byId = new Map(timing.scenes.map((t) => [t.id, t]));

  return (
    <AbsoluteFill style={{ background: 'transparent', fontFamily: FONT }}>
      {showBg && <Background theme={theme} W={L.W} H={L.H} />}
      {project.scenes.map((s, i) => {
        const t = byId.get(s.id);
        if (!t) return null;
        const role = project.audio.sfx ? sfxRoleFor(s, i) : null;
        const sfx = role ? project.audio.sfxMap[role] : undefined;
        const ch = chapters[i];
        return (
          <Sequence key={s.id} from={t.start} durationInFrames={t.frames} name={`${i + 1}. ${s.text.slice(0, 18)}`}>
            <SceneFrame scene={s} index={i} t={t} theme={theme} L={L} base={base} project={project} showVisual={showVisual} showCaptions={showCaptions}
              chapter={L.long && project.design.chapterLabel && ch && s.visual.type !== 'chapter' ? ch : null} />
            {withAudio && t.audio && (
              <Sequence from={lead} layout="none"><Audio src={resolveSrc(base, t.audio)} /></Sequence>
            )}
            {withAudio && sfx && <Audio src={resolveSrc(base, sfx)} volume={project.audio.sfxVolume} />}
          </Sequence>
        );
      })}
      {showVisual && L.headline && <Headline project={project} theme={theme} L={L} />}
      {showVisual && project.design.mascot && <Mascot src={resolveSrc(base, project.design.mascot)} side={project.design.mascotSide} L={L} />}
      {withAudio && project.audio.bgm && (
        <Audio
          src={resolveSrc(base, project.audio.bgm)}
          loop
          volume={(f) => project.audio.bgmVolume * interpolate(f, [durationInFrames - fps * 1.5, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      )}
    </AbsoluteFill>
  );
};

const SceneFrame: React.FC<{ scene: Scene; index: number; t: SceneTiming; theme: Theme; L: Layout; base: string; project: Project; showVisual: boolean; showCaptions: boolean; chapter: { index: number; heading: string } | null }> =
  ({ scene, index, t, theme, L, base, project, showVisual, showCaptions, chapter }) => {
    const frame = useCurrentFrame();
    const fade = project.design.transition === 'fade' && index > 0 ? interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' }) : 1;
    const overlay = scene.visual.type === 'media' || (scene.visual.type === 'title' && !!scene.visual.media?.src);
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        {showVisual && (
          <>
            <VisualView visual={scene.visual} theme={theme} L={L} base={base} design={project.design} format={project.format} />
            {project.design.showSource && scene.source && <SourceTag text={scene.source} theme={theme} L={L} overlay={overlay && theme.fullBleed} />}
            {chapter && <ChapterLabel c={chapter} theme={theme} overlay={overlay && theme.fullBleed} />}
          </>
        )}
        {showCaptions && <Caption cues={t.captions} L={L} scale={project.design.captionScale} style={project.design.captionStyle} plain={theme.preset === 'paper' ? theme.ink : null} />}
      </AbsoluteFill>
    );
  };

/** plain: 흰 바탕 디자인에서는 외곽선 없이 이 색 글자로 쓴다 (흰 글자는 흰 바탕에서 안 읽힌다) */
const Caption: React.FC<{ cues: SceneTiming['captions']; L: Layout; scale: number; style: 'outline' | 'box'; plain: string | null }> = ({ cues, L, scale, style, plain }) => {
  const frame = useCurrentFrame();
  const cue = cues.find((c) => frame >= c.start && frame < c.end);
  if (!cue) return null;
  const size = (L.long ? 48 : 60) * scale;
  const box = style === 'box';
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: L.captionY, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        fontFamily: FONT, fontSize: size, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, letterSpacing: '-0.01em',
        maxWidth: L.captionMaxW, textAlign: 'center', wordBreak: 'keep-all',
        ...(box
          ? { background: 'rgba(0,0,0,0.78)', padding: `${size * 0.16}px ${size * 0.42}px` }
          : plain
            ? { color: plain }
            : { WebkitTextStroke: `${size * 0.12}px #000000`, paintOrder: 'stroke fill' }),
      }}>{cue.text}</div>
    </div>
  );
};

const SourceTag: React.FC<{ text: string; theme: Theme; L: Layout; overlay: boolean }> = ({ text, theme, L, overlay }) => {
  const st = L.stage;
  const fs = L.long ? 26 : 30;
  if (overlay) {
    return <div style={{ position: 'absolute', right: L.long ? 40 : 32, top: (L.headline ? L.headline.h : 0) + (L.long ? 36 : 32), fontFamily: FONT, fontSize: fs, fontWeight: 600, color: '#FFFFFF', background: 'rgba(0,0,0,0.6)', padding: '6px 14px' }}>자료: {text}</div>;
  }
  return <div style={{ position: 'absolute', left: st.x, top: st.y + st.h + 20, fontFamily: FONT, fontSize: fs, fontWeight: 500, color: theme.muted }}>자료: {text}</div>;
};

const ChapterLabel: React.FC<{ c: { index: number; heading: string }; theme: Theme; overlay: boolean }> = ({ c, theme, overlay }) => (
  <div style={{ position: 'absolute', left: 48, top: 40, fontFamily: FONT, fontSize: 26, fontWeight: 600, color: overlay ? '#FFFFFF' : theme.muted, background: overlay ? 'rgba(0,0,0,0.6)' : 'transparent', padding: overlay ? '6px 14px' : 0 }}>
    {c.index}장 {c.heading}
  </div>
);

const Headline: React.FC<{ project: Project; theme: Theme; L: Layout }> = ({ project, theme, L }) => {
  const h = L.headline!;
  const { line1, line2 } = project.headline;
  return (
    <div style={{ position: 'absolute', left: h.x, top: h.y, width: h.w, height: h.h, background: theme.headline.bg, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 48, boxSizing: 'border-box' }}>
      <div style={{ fontFamily: FONT, fontSize: 72, fontWeight: 800, color: theme.headline.color, lineHeight: 1.2, textAlign: 'center', letterSpacing: '-0.03em', padding: '0 56px', wordBreak: 'keep-all' }}>
        <div>{line1}</div>
        {line2 && <div>{line2}</div>}
      </div>
    </div>
  );
};

const Mascot: React.FC<{ src: string; side: 'left' | 'right'; L: Layout }> = ({ src, side, L }) => (
  <Img src={src} style={{ position: 'absolute', bottom: L.long ? 0 : L.H - L.captionY + 70, [side]: L.long ? 24 : 12, height: L.long ? 320 : 280, objectFit: 'contain' } as React.CSSProperties} />
);
