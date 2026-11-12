import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import express from 'express';
import path from 'node:path';
import { sampleProject } from '../src/shared/sample';
import { buildTiming } from '../src/shared/timing';
const app = express(); app.use((q,r,n)=>{r.setHeader('Access-Control-Allow-Origin','*');n();}); app.use('/fonts', express.static(path.resolve(import.meta.dirname, '../public/fonts')));
app.use('/files', express.static((process.env.OUT || '/tmp/t') + '/media'));
const srv = app.listen(5190);
const serveUrl = await bundle({ entryPoint: path.resolve(import.meta.dirname, '../src/video/Root.tsx') });
const want = (process.argv[2] || 'long:paper').split(',');
for (const w of want) {
  const [format, preset, ...rest] = w.split(':');
  const p = sampleProject(format as any); p.design.preset = preset as any;
  if (preset !== 'paper') p.design.accent = '#F2B705';
  if (rest.includes('media')) { p.scenes[0].visual = { type:'title', heading:p.scenes[0].visual.type==='title'?p.scenes[0].visual.heading:'', sub:'예시', media:{src:'/files/a.jpg',kind:'image'} } as any; p.scenes.splice(1,0,{id:'m',text:'사진 장면 예시입니다',visual:{type:'media',media:{src:'/files/a.jpg',kind:'image'},label:'예시 사진'},source:'직접 촬영'} as any);}
  const timing = buildTiming(p);
  const inputProps = { project: p, timing, layer: 'all', base: 'http://127.0.0.1:5190' };
  const comp = await selectComposition({ serveUrl, id: 'InfoVideo', inputProps, browserExecutable: process.env.INFOCUT_CHROME || null });
  for (let i = 0; i < timing.scenes.length; i++) {
    const s = timing.scenes[i];
    await renderStill({ composition: comp, serveUrl, inputProps, frame: s.start + Math.min(s.frames - 1, 40), output: `${process.env.OUT || '/tmp/t'}/out/${format}_${preset}_${i}.png`, browserExecutable: process.env.INFOCUT_CHROME || null, scale: 0.5 });
  }
  console.log('done', w);
}
srv.close(); process.exit(0);
