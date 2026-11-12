// 휴대폰 안에서 영상 만들기 (WebCodecs)
import { canRenderMediaOnWeb, renderMediaOnWeb, type WebRendererContainer, type WebRendererVideoCodec } from '@remotion/web-renderer';
import type { Layer, Project, Timing, VideoProps } from '../../../src/shared/types';
import { DIMENSIONS } from '../../../src/shared/types';
import { InfoVideo } from '../../../src/video/Video';

const TRY: { container: WebRendererContainer; videoCodec: WebRendererVideoCodec; ext: string; mime: string }[] = [
  { container: 'mp4', videoCodec: 'h264', ext: 'mp4', mime: 'video/mp4' },
  { container: 'webm', videoCodec: 'vp9', ext: 'webm', mime: 'video/webm' },
  { container: 'webm', videoCodec: 'vp8', ext: 'webm', mime: 'video/webm' },
];

export async function renderLocal(p: Project, timing: Timing, layer: Layer, step: (m: string, pr?: number) => void): Promise<{ blob: Blob; ext: string }> {
  const { width, height } = DIMENSIONS[p.format];
  let pick: (typeof TRY)[number] | null = null;
  const why: string[] = [];
  for (const t of TRY) {
    const c = await canRenderMediaOnWeb({ container: t.container, videoCodec: t.videoCodec, width, height });
    if (c.canRender) { pick = t; break; }
    why.push(...c.issues.filter((i) => i.severity === 'error').map((i) => i.message));
  }
  if (!pick) throw new Error(`이 기기에서는 영상을 만들 수 없어요. ${why[0] || ''}`);
  const inputProps: VideoProps = { project: p, timing, layer, base: window.location.origin };
  step('영상 만드는 중', 0);
  const total = timing.totalFrames;
  const r = await renderMediaOnWeb({
    composition: { component: InfoVideo, id: 'InfoVideo', width, height, fps: timing.fps, durationInFrames: total, defaultProps: inputProps } as any,
    inputProps: inputProps as any,
    container: pick.container,
    videoCodec: pick.videoCodec,
    videoBitrate: 'high',
    licenseKey: 'free-license',
    onProgress: (pr) => step(`영상 만드는 중 ${pr.encodedFrames}/${total} 프레임`, pr.progress),
  });
  const blob = await r.getBlob();
  return { blob: blob.type ? blob : new Blob([blob], { type: pick.mime }), ext: pick.ext };
}
