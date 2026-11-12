import type { Design, Format, Preset } from '../shared/types';

export interface Theme {
  preset: Preset;
  bg: string;
  /** 인용 기사처럼 배경과 살짝 다른 면 */
  sheet: string;
  ink: string;
  muted: string;
  rule: string;
  accent: string;
  barRest: string;
  /** 사진을 화면 가득 채울지 */
  fullBleed: boolean;
  headline: { bg: string; color: string };
}

/** 옛 프로젝트 값 → 새 값 */
const LEGACY: Record<string, Preset> = { note: 'paper', ink: 'black', field: 'full' };

export function normalizeDesign(d: Design): Design {
  return {
    ...d,
    preset: (LEGACY[d.preset as string] || d.preset || 'paper') as Preset,
    captionStyle: d.captionStyle || 'outline',
    chapterLabel: d.chapterLabel ?? true,
  };
}

export const PRESETS: Record<Preset, { name: string; blurb: string; defaultAccent: string }> = {
  paper: { name: '화이트', blurb: '흰 바탕에 검은 글자. 표와 그래프가 가장 잘 읽혀요.', defaultAccent: '#1F5FD1' },
  black: { name: '블랙', blurb: '검은 바탕에 흰 글자. 밤에 보기 편하고 화면이 차분해요.', defaultAccent: '#F2B705' },
  full: { name: '풀화면', blurb: '사진과 게임 화면을 꽉 채워요. 그래프는 검은 바탕.', defaultAccent: '#F2B705' },
};

export const ACCENTS = [
  { name: '파랑', hex: '#1F5FD1' },
  { name: '빨강', hex: '#D92D20' },
  { name: '노랑', hex: '#F2B705' },
  { name: '초록', hex: '#12805C' },
  { name: '보라', hex: '#6941C6' },
  { name: '회색', hex: '#667085' },
];

export function makeTheme(raw: Design): Theme {
  const d = normalizeDesign(raw);
  const accent = d.accent || PRESETS[d.preset].defaultAccent;
  if (d.preset === 'paper') {
    return {
      preset: 'paper', bg: '#FFFFFF', sheet: '#F2F3F5', ink: '#17191C', muted: '#6A6F77', rule: '#D5D8DC',
      accent, barRest: '#C8CCD2', fullBleed: false, headline: { bg: '#FFFFFF', color: '#17191C' },
    };
  }
  return {
    preset: d.preset, bg: '#0F1012', sheet: '#1C1E22', ink: '#F3F4F6', muted: '#9A9FA8', rule: '#34373D',
    accent, barRest: '#4B4F57', fullBleed: d.preset === 'full', headline: { bg: '#000000', color: '#FFFFFF' },
  };
}

export interface Box { x: number; y: number; w: number; h: number }
export interface Layout {
  W: number; H: number;
  stage: Box;
  /** 자막 가운데 세로 위치 */
  captionY: number;
  captionMaxW: number;
  headline: Box | null;
  long: boolean;
}

export function makeLayout(format: Format, d: Design): Layout {
  if (format === 'long') {
    const W = 1920, H = 1080;
    return { W, H, long: true, stage: { x: 128, y: 104, w: W - 256, h: 760 }, captionY: H - 100, captionMaxW: 1560, headline: null };
  }
  const W = 1080, H = 1920;
  if (d.headline) {
    return { W, H, long: false, headline: { x: 0, y: 0, w: W, h: 500 }, stage: { x: 64, y: 560, w: W - 128, h: 800 }, captionY: 1500, captionMaxW: 980 };
  }
  return { W, H, long: false, headline: null, stage: { x: 64, y: 360, w: W - 128, h: 1020 }, captionY: 1510, captionMaxW: 980 };
}

export const FONT = 'Pretendard, "Malgun Gothic", sans-serif';

export const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(Math.round(n * 10) / 10));
