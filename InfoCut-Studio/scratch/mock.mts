// AI 응답을 흉내 내서 탐구·대본·수정 흐름을 점검
import { researchTopic, writeScript, reviseScript, suggestVisual } from '../src/shared/ai/writer';
import { newProject } from '../src/shared/sample';
import { loadSettings } from '../server/store';
const s = loadSettings(); s.ai.provider = 'openai'; s.keys.openai = 'sk-test'; s.ai.models.openai = 'gpt-test';
let calls: any[] = [];
const reply = (obj: any, wrap = true) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: (wrap ? '여기 결과입니다:\n```json\n' : '') + JSON.stringify(obj) + (wrap ? '\n```' : ''), annotations: [{ type: 'url_citation', url: 'https://example.org/a', title: '예시 출처' }] }] }] });
const queue: any[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  if (!String(url).includes('openai')) return new Response('{}', { status: 404 });
  calls.push(JSON.parse(init.body));
  return new Response(JSON.stringify(queue.shift()), { status: 200 });
};
queue.push(reply({ summary: '요약', facts: [{ text: '사실1', source: 'A', url: 'https://a' }, { text: '사실2' }], numbers: [{ label: '시청자', value: '100만 명' }], angles: [{ title: '방향', hook: '훅', outline: ['a', 'b'] }] }));
const p = newProject('shorts', '테스트');
p.research = await researchTopic(s, { topic: '테스트 주제', format: 'shorts' }, () => {});
console.log('research', p.research.facts.length, p.research.sources.length, 'tools:', JSON.stringify(calls[0].tools));
queue.push(reply({ title: '제목', headline: { line1: '한 줄', line2: '두 줄' }, scenes: [
  { text: '첫 문장', visual: { type: 'title', heading: '질문' } },
  { text: '숫자', visual: { type: 'bars', title: 't', items: [{ label: 'a', value: '1,200명' }, { label: 'b', value: 30, highlight: true }] }, source: 'A' },
  { text: '표', visual: { type: 'table', columns: ['x', 'y'], rows: [['1', 2]] } },
  { text: '사진', visual: { type: 'media' }, query: 'seoul' },
  { text: '이상한 화면', visual: 'nope' },
], upload: { title: 'u', description: 'd', tags: ['t'] } }, false));
const out = await writeScript(s, p, { seconds: 45 }, () => {});
console.log('script', out.scenes!.map((x) => x.visual.type + (x.visual.type === 'bars' ? JSON.stringify(x.visual.items) : '')).join(' | '));
p.scenes = out.scenes!;
queue.push(reply({ scenes: [{ id: p.scenes[0].id, text: '고친 첫 문장', visual: { type: 'title', heading: '질문2' } }, { id: '', text: '새 장면', visual: { type: 'text', heading: 'h' } }] }));
const rev = await reviseScript(s, p, '첫 장면 고쳐', [p.scenes[0].id]);
console.log('revise', rev.length, rev[0].text, rev[1].text, rev[2].visual.type);
queue.push(reply({ text: '숫자', visual: { type: 'stat', value: '1,200명', label: 'L' } }));
const one = await suggestVisual(s, p, p.scenes[1].id, '숫자로');
console.log('remake', one.id === p.scenes[1].id, one.visual.type);
// 롱폼
const L = newProject('long', '롱'); L.research = p.research;
queue.push(reply({ title: '롱 제목', headline: { line1: 'x' }, chapters: [{ heading: '도입', points: ['a'] }, { heading: '본론', points: ['b'] }, { heading: '정리', points: ['c'] }] }));
for (let i = 0; i < 3; i++) queue.push(reply({ scenes: [{ text: `장${i + 1} 시작`, visual: { type: 'chapter', index: i + 1, heading: 'h' } }, { text: '내용', visual: { type: 'text', heading: 'h' } }] }));
const lo = await writeScript(s, L, { seconds: 300 }, (m) => console.log('  step', m));
console.log('long scenes', lo.scenes!.length);
