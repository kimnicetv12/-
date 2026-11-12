// Remotion 렌더링: 완성본 mp4 / 프리미어용 레이어
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import type { Layer, Project, Timing, VideoProps } from '../src/shared/types';
import { APP_DIR, projectDir, type Settings } from './store';

let bundling: Promise<string> | null = null;
export function getBundle(step?: (m: string) => void) {
  if (!bundling) {
    step?.('영상 엔진 준비 중 (처음 한 번 30초쯤)');
    bundling = bundle({ entryPoint: path.join(APP_DIR, 'src', 'video', 'Root.tsx'), outDir: path.join(APP_DIR, 'data', '.engine') }).catch((e) => { bundling = null; throw e; });
  }
  return bundling;
}

const browserExecutable = () => process.env.INFOCUT_CHROME || null;

export function baseUrl() {
  return `http://127.0.0.1:${process.env.PORT || 5178}`;
}

async function comp(serveUrl: string, inputProps: VideoProps) {
  return selectComposition({ serveUrl, id: 'InfoVideo', inputProps, browserExecutable: browserExecutable() });
}

export async function renderFinal(s: Settings, p: Project, timing: Timing, step: (m: string, pr?: number) => void, cancelSignal?: { cancelled: boolean }) {
  const serveUrl = await getBundle(step);
  const out = path.join(projectDir(p.id), 'exports', 'final.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const inputProps: VideoProps = { project: p, timing, layer: 'all', base: baseUrl() };
  const composition = await comp(serveUrl, inputProps);
  const tmp = out.replace(/\.mp4$/, '.part.mp4');
  await renderMedia({
    composition, serveUrl, codec: 'h264', crf: s.render.crf, outputLocation: tmp, inputProps,
    browserExecutable: browserExecutable(), concurrency: s.render.concurrency, audioBitrate: '192k',
    onProgress: ({ progress, renderedFrames }) => step(`영상 만드는 중 ${renderedFrames}/${composition.durationInFrames} 프레임`, progress),
    onBrowserDownload: () => { step('렌더링용 브라우저 내려받는 중 (처음 한 번)'); return { version: null, onProgress: () => undefined }; },
  });
  fs.renameSync(tmp, out);
  return `/files/projects/${p.id}/exports/final.mp4`;
}

export interface LayerFiles { background: string; visual: string | null; captions: { file: string; start: number; end: number; text: string }[]; reference?: string }

/** 프리미어용: 배경(정지 그림), 화면(투명 ProRes 4444), 자막(투명 PNG 한 장씩) */
export async function renderLayers(s: Settings, p: Project, timing: Timing, outDir: string, opts: { visual: boolean }, step: (m: string, pr?: number) => void): Promise<LayerFiles> {
  const serveUrl = await getBundle(step);
  fs.mkdirSync(path.join(outDir, 'layers', 'captions'), { recursive: true });
  const props = (layer: Layer): VideoProps => ({ project: p, timing, layer, base: baseUrl() });
  const browser = await openBrowser('chrome', { browserExecutable: browserExecutable() });
  try {
    step('배경 그림 만드는 중', 0.02);
    const bg = path.join(outDir, 'layers', 'background.png');
    const c0 = await comp(serveUrl, props('background'));
    await renderStill({ composition: c0, serveUrl, inputProps: props('background'), frame: 0, output: bg, puppeteerInstance: browser, imageFormat: 'png' });

    step('자막 그림 만드는 중', 0.05);
    const cc = await comp(serveUrl, props('captions'));
    const caps: LayerFiles['captions'] = [];
    const all = timing.scenes.flatMap((t) => t.captions.map((c) => ({ ...c, start: t.start + c.start, end: t.start + c.end })));
    for (let i = 0; i < all.length; i++) {
      const c = all[i];
      const file = path.join(outDir, 'layers', 'captions', `cap_${String(i + 1).padStart(4, '0')}.png`);
      await renderStill({ composition: cc, serveUrl, inputProps: props('captions'), frame: c.start, output: file, puppeteerInstance: browser, imageFormat: 'png' });
      caps.push({ file, start: c.start, end: c.end, text: c.text });
      if (i % 5 === 0) step(`자막 그림 ${i + 1}/${all.length}`, 0.05 + 0.25 * (i / all.length));
    }

    let visual: string | null = null;
    if (opts.visual) {
      const cv = await comp(serveUrl, props('visual'));
      visual = path.join(outDir, 'layers', 'visual.mov');
      await renderMedia({
        composition: cv, serveUrl, inputProps: props('visual'), outputLocation: visual, puppeteerInstance: browser,
        codec: 'prores', proResProfile: '4444', pixelFormat: 'yuva444p10le', imageFormat: 'png', muted: true,
        concurrency: s.render.concurrency,
        onProgress: ({ progress, renderedFrames }) => step(`화면 레이어(투명) 만드는 중 ${renderedFrames}/${cv.durationInFrames}`, 0.3 + 0.65 * progress),
      });
    }
    return { background: bg, visual, captions: caps };
  } finally {
    await browser.close({ silent: true }).catch(() => undefined);
  }
}
