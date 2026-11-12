import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import type { Project, Timing, VideoProps } from '../../../src/shared/types';
import { DIMENSIONS } from '../../../src/shared/types';
import { fmtTime, sceneAt } from '../../../src/shared/timing';
import { Icon } from '../icons';
import { InfoVideo } from '../../../src/video/Video';

export interface PreviewHandle { seekScene: (i: number) => void }

export const Preview = forwardRef<PreviewHandle, { project: Project; timing: Timing; onScene: (i: number) => void; compact?: boolean }>(
  ({ project, timing, onScene, compact }, ref) => {
    const player = useRef<PlayerRef>(null);
    const [frame, setFrame] = useState(0);
    const [playing, setPlaying] = useState(false);
    const dim = DIMENSIONS[project.format];
    const inputProps = useMemo<VideoProps>(() => ({ project, timing, layer: 'all', base: window.location.origin }), [project, timing]);
    const has = project.scenes.length > 0;

    useImperativeHandle(ref, () => ({
      seekScene: (i) => {
        const t = timing.scenes[i];
        if (t) { player.current?.pause(); player.current?.seekTo(t.start + Math.min(20, Math.floor(t.frames / 2))); }
      },
    }), [timing]);

    useEffect(() => {
      const p = player.current;
      if (!p) return;
      const on = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
      const play = () => setPlaying(true);
      const stop = () => setPlaying(false);
      p.addEventListener('frameupdate', on);
      p.addEventListener('play', play);
      p.addEventListener('pause', stop);
      p.addEventListener('ended', stop);
      return () => { p.removeEventListener('frameupdate', on); p.removeEventListener('play', play); p.removeEventListener('pause', stop); p.removeEventListener('ended', stop); };
    }, [has]);

    const idx = sceneAt(timing, frame);
    useEffect(() => { if (idx >= 0) onScene(idx); }, [idx, onScene]);

    return (
      <div className="pv">
        <div className="pv-frame" style={{ aspectRatio: `${dim.width} / ${dim.height}`, ['--ar' as any]: dim.width / dim.height }}>
          {has && (
            <Player
              ref={player}
              component={InfoVideo as any}
              inputProps={inputProps}
              durationInFrames={Math.max(1, timing.totalFrames)}
              fps={timing.fps}
              compositionWidth={dim.width}
              compositionHeight={dim.height}
              style={{ width: '100%', height: '100%' }}
              controls={!compact}
              clickToPlay
              spaceKeyToPlayOrPause={!compact}
              acknowledgeRemotionLicense
              initialFrame={12}
            />
          )}
        </div>
        {compact && has && (
          <div className="pv-bar num">
            <button className="btn ghost icon" aria-label={playing ? '멈춤' : '재생'} onClick={() => player.current?.toggle()}><Icon name={playing ? 'stop' : 'play'} /></button>
            <input type="range" aria-label="위치" min={0} max={Math.max(1, timing.totalFrames - 1)} value={frame} onChange={(e) => { player.current?.pause(); player.current?.seekTo(Number(e.target.value)); }} />
            <span>{fmtTime(frame, timing.fps)} / {fmtTime(timing.totalFrames, timing.fps)}</span>
          </div>
        )}
        {!compact && has && (
          <div className="pv-meta num">
            <span>{fmtTime(frame, timing.fps)} / {fmtTime(timing.totalFrames, timing.fps)}</span>
            <span>장면 {idx + 1} / {project.scenes.length}</span>
          </div>
        )}
      </div>
    );
  },
);
