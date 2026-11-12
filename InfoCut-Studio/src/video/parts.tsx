import React from 'react';
import { Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Video } from '@remotion/media';
import type { MediaRef } from '../shared/types';
import { FONT, type Theme } from './theme';

/** 휴대폰 버전은 사진을 기기 안에 저장하고 "idb:" 주소로 가리킨다. 그 주소를 실제 주소로 바꾸는 함수 */
let customResolver: ((src: string) => string | null) | null = null;
export const setSrcResolver = (fn: ((src: string) => string | null) | null) => { customResolver = fn; };

export const resolveSrc = (base: string, src?: string | null) => {
  if (!src) return '';
  if (customResolver) {
    const r = customResolver(src);
    if (r) return r;
  }
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return `${base.replace(/\/$/, '')}${src.startsWith('/') ? '' : '/'}${src}`;
};

/** 막대가 자라는 정도 (0→1, 짧게) */
export function useGrow(delay = 0, dur = 10) {
  const f = useCurrentFrame();
  return interpolate(f, [delay, delay + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - Math.pow(1 - t, 3) });
}

/** 목록·타임라인 항목을 장면 길이에 맞춰 하나씩 (페이드 없이) 보이게 */
export function useReveal(count: number) {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const span = Math.max(1, durationInFrames * 0.65);
  const step = count > 1 ? span / count : 0;
  return (i: number) => f >= Math.round(i * step);
}

export const MediaView: React.FC<{ media?: MediaRef; base: string; drift: boolean; style?: React.CSSProperties; fit?: 'cover' | 'contain'; theme: Theme }> = ({ media, base, drift, style, fit, theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  if (!media?.src) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.sheet, color: theme.muted, fontFamily: FONT, fontSize: 30, fontWeight: 600 }}>
        사진 없음
      </div>
    );
  }
  const scale = drift && media.kind !== 'video' ? interpolate(frame, [0, Math.max(durationInFrames, 1)], [1, 1.03]) : 1;
  const objectFit = fit || media.fit || 'cover';
  const src = resolveSrc(base, media.src);
  return (
    <div style={{ overflow: 'hidden', background: objectFit === 'contain' ? theme.sheet : '#000', ...style }}>
      {media.kind === 'video' ? (
        <Video src={src} muted trimBefore={Math.round((media.start || 0) * fps)} objectFit={objectFit} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Img src={src} style={{ width: '100%', height: '100%', objectFit, transform: `scale(${scale})` }} />
      )}
    </div>
  );
};

export const Background: React.FC<{ theme: Theme; W: number; H: number }> = ({ theme, W, H }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, background: theme.bg }} />
);
