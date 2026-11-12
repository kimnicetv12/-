import type { Scene, SfxRole } from './types';

/** 효과음: 장면에 지정이 없으면 장면 종류로 정한다 (평범한 컷에는 소리 없음) */
export function sfxRoleFor(s: Scene, _i: number): SfxRole | null {
  if (s.sfx !== undefined) return s.sfx;
  if (s.visual.type === 'chapter') return 'chapter';
  if (s.visual.type === 'stat' || s.visual.type === 'bars') return 'count';
  if (s.visual.type === 'table' || s.visual.type === 'compare') return 'reveal';
  return null;
}

export const SFX_ROLES: { id: SfxRole; name: string; when: string }[] = [
  { id: 'count', name: '숫자', when: '숫자·막대 그래프가 나올 때' },
  { id: 'reveal', name: '정리', when: '표·비교가 나올 때' },
  { id: 'chapter', name: '장 전환', when: '롱폼에서 장이 바뀔 때' },
  { id: 'cut', name: '컷', when: '직접 지정한 장면에만' },
];
