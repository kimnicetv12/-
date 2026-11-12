import type { Format, Project, Scene } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newProject(format: Format, title = '새 프로젝트'): Project {
  const now = new Date().toISOString();
  return {
    id: `${now.slice(0, 10).replace(/-/g, '')}_${uid()}`,
    title,
    format,
    fps: 30,
    createdAt: now,
    updatedAt: now,
    headline: { line1: title },
    narration: { enabled: true, engine: 'edge', voice: 'ko-KR-InJoonNeural', rate: '+8%' },
    audio: { bgm: null, bgmVolume: 0.08, sfx: true, sfxVolume: 0.5, sfxMap: {} },
    design: { preset: 'paper', accent: '#1F5FD1', headline: format === 'shorts', captionScale: 1, captionStyle: 'outline', chapterLabel: true, showSource: true, mascot: null, mascotSide: 'right', transition: 'cut', drift: true },
    scenes: [],
  };
}

const sc = (text: string, visual: Scene['visual'], extra: Partial<Scene> = {}): Scene => ({ id: uid(), text, visual, ...extra });

/** 디자인 미리보기용 예시 (가짜 설문 데이터) */
export function sampleProject(format: Format): Project {
  const p = newProject(format, '우리 반 등교 방법 조사');
  p.id = `sample_${format}`;
  p.headline = { line1: '우리 반 30명은', line2: '어떻게 학교에 올까?' };
  p.narration.enabled = false;
  p.scenes = [
    sc('우리 반 30명은 / 어떻게 학교에 올까요?', { type: 'title', heading: '우리 반 30명은 어떻게 학교에 올까', sub: '예시 데이터로 만든 디자인 미리보기' }),
    sc('먼저 결과부터 보면', { type: 'chapter', index: 1, heading: '결과부터 보기' }),
    sc('버스를 타는 친구가 / 가장 많았어요.', { type: 'bars', title: '등교 방법', unit: '명', items: [{ label: '버스', value: 13, highlight: true }, { label: '걸어서', value: 9 }, { label: '지하철', value: 5 }, { label: '자전거', value: 3 }] }, { source: '예시 설문' }),
    sc('절반 가까운 / 43퍼센트였죠.', { type: 'stat', value: '43%', label: '버스로 오는 친구 비율', before: '30명 중 13명' }, { source: '예시 설문' }),
    sc('걸리는 시간을 / 표로 정리해 봤어요.', { type: 'table', title: '평균 등교 시간', columns: ['방법', '인원', '평균 시간'], rows: [['버스', '13명', '24분'], ['걸어서', '9명', '12분'], ['지하철', '5명', '31분'], ['자전거', '3명', '15분']], highlightRow: 2 }, { source: '예시 설문' }),
    sc('지하철이 제일 오래 걸렸는데요,', { type: 'compare', left: { title: '버스', points: ['평균 24분', '갈아타기 거의 없음'] }, right: { title: '지하철', points: ['평균 31분', '한 번 이상 갈아탐'] } }),
    sc('한 친구는 이렇게 말했어요.', { type: 'quote', text: '지하철이 빠르긴 한데, 역까지 걸어가는 시간이 생각보다 길어요.', by: '예시 응답' }),
    sc('정리하면 / 세 가지예요.', { type: 'list', title: '정리', items: ['버스가 가장 많다', '지하철은 갈아타는 시간 때문에 길다', '가까운 친구는 걸어서 온다'] }),
    sc('다음엔 / 학년별로 비교해 볼게요.', { type: 'timeline', title: '다음 조사 계획', items: [{ when: '1주차', what: '1학년 조사' }, { when: '2주차', what: '2학년 조사' }, { when: '3주차', what: '비교 영상' }] }),
  ];
  return p;
}
