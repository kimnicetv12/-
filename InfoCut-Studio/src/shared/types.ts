// InfoCut Studio — 프로젝트 데이터 구조 (화면·서버·영상 엔진이 함께 씀)

export type Format = 'shorts' | 'long';

export interface MediaRef {
  /** 서버 주소(/files/...), 휴대폰 저장소 주소(idb:...) 또는 http 주소 */
  src: string;
  kind: 'image' | 'video';
  fit?: 'cover' | 'contain';
  /** 영상 클립 시작 초 */
  start?: number;
  /** 기록용 출처 (작성자·라이선스·링크) */
  credit?: string;
}

export interface BarItem { label: string; value: number; highlight?: boolean }
export interface TimelineItem { when: string; what: string }
export interface CompareSide { title: string; points: string[]; media?: MediaRef }

export type Visual =
  | { type: 'title'; heading: string; sub?: string; media?: MediaRef }
  | { type: 'media'; media?: MediaRef; label?: string }
  | { type: 'stat'; value: string; label: string; before?: string; media?: MediaRef }
  | { type: 'bars'; title?: string; unit?: string; items: BarItem[] }
  | { type: 'table'; title?: string; columns: string[]; rows: string[][]; highlightRow?: number }
  | { type: 'quote'; text: string; by?: string }
  | { type: 'list'; title?: string; items: string[] }
  | { type: 'compare'; left: CompareSide; right: CompareSide }
  | { type: 'timeline'; title?: string; items: TimelineItem[] }
  | { type: 'chapter'; index: number; heading: string }
  | { type: 'text'; heading: string; body?: string };

export type VisualType = Visual['type'];

export interface Scene {
  id: string;
  /** 읽을 문장 = 자막. " / " 는 자막을 끊는 자리 (화면·목소리에는 안 나옴) */
  text: string;
  /** 발음이 이상할 때 목소리가 대신 읽을 문장 */
  say?: string;
  /** 이 장면만 목소리 끄기 */
  mute?: boolean;
  /** 말이 끝난 뒤 더 머무를 시간(초) */
  hold?: number;
  /** 장면 길이를 직접 정할 때(초) */
  duration?: number;
  visual: Visual;
  /** 화면에 작게 보일 출처 (예: "통계청 2025") */
  source?: string;
  /** 효과음 역할 (null = 끄기, 없으면 자동) */
  sfx?: SfxRole | null;
  /** 제작 메모 (영상에는 안 나옴) */
  note?: string;
  /** 사진·영상을 찾을 검색어 (AI 가 제안) */
  query?: string;
}

export type SfxRole = 'cut' | 'reveal' | 'count' | 'chapter';

export type Preset = 'paper' | 'black' | 'full';

export interface Design {
  preset: Preset;
  accent: string;
  /** 쇼츠 위쪽 고정 제목 */
  headline: boolean;
  captionScale: number;
  /** 자막 모양: 외곽선 / 검은 상자 */
  captionStyle: 'outline' | 'box';
  /** 롱폼에서 지금 몇 장인지 왼쪽 위에 표시 */
  chapterLabel: boolean;
  showSource: boolean;
  /** 내 캐릭터 PNG (선택) */
  mascot?: string | null;
  mascotSide: 'left' | 'right';
  transition: 'cut' | 'fade';
  /** 사진 천천히 확대 */
  drift: boolean;
}

export interface Narration {
  enabled: boolean;
  /** edge 는 PC 전용, device(휴대폰 기본 목소리)는 휴대폰 전용 */
  engine: 'edge' | 'device' | 'openai' | 'elevenlabs';
  voice: string;
  /** edge: "+10%" 형식 / 나머지: 1.0 배속 */
  rate: string;
}

export interface AudioSettings {
  bgm?: string | null;
  bgmVolume: number;
  sfx: boolean;
  sfxVolume: number;
  /** 역할 → 효과음 파일 주소 */
  sfxMap: Partial<Record<SfxRole, string>>;
}

export interface Fact { text: string; source?: string; url?: string; use: boolean }
export interface Angle { title: string; hook: string; outline: string[] }

export interface Research {
  topic: string;
  angleHint?: string;
  summary: string;
  facts: Fact[];
  numbers: { label: string; value: string; source?: string }[];
  angles: Angle[];
  sources: { title: string; url: string }[];
  chosenAngle?: number;
  memo?: string;
  createdAt: string;
}

export interface CaptionCue { text: string; start: number; end: number }

export interface SceneTiming {
  id: string;
  start: number;
  frames: number;
  /** 나레이션 파일 주소 */
  audio?: string;
  audioFrames?: number;
  captions: CaptionCue[];
}

export interface Timing {
  fps: number;
  totalFrames: number;
  scenes: SceneTiming[];
  /** 어떤 대본으로 계산했는지 (바뀌면 다시 계산) */
  signature: string;
}

export interface Project {
  id: string;
  title: string;
  format: Format;
  fps: number;
  createdAt: string;
  updatedAt: string;
  headline: { line1: string; line2?: string };
  narration: Narration;
  audio: AudioSettings;
  design: Design;
  scenes: Scene[];
  research?: Research;
  upload?: { title: string; description: string; tags: string[] };
  timing?: Timing;
}

export const DIMENSIONS: Record<Format, { width: number; height: number }> = {
  shorts: { width: 1080, height: 1920 },
  long: { width: 1920, height: 1080 },
};

export type Layer = 'all' | 'background' | 'visual' | 'captions' | 'nocaptions';

export interface VideoProps {
  project: Project;
  timing: Timing;
  layer: Layer;
  /** 서버 주소 (렌더링 때 파일을 불러올 곳) */
  base: string;
  [key: string]: unknown;
}
