import React from 'react';
import { Composition, registerRoot } from 'remotion';
import type { VideoProps } from '../shared/types';
import { DIMENSIONS } from '../shared/types';
import { InfoVideo } from './Video';
import { sampleProject } from '../shared/sample';
import { buildTiming } from '../shared/timing';

const sample = sampleProject('long');
const defaults: VideoProps = { project: sample, timing: buildTiming(sample), layer: 'all', base: 'http://127.0.0.1:5178' };

const Root: React.FC = () => (
  <Composition
    id="InfoVideo"
    component={InfoVideo}
    defaultProps={defaults}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={300}
    calculateMetadata={({ props }) => {
      const d = DIMENSIONS[props.project.format];
      return { durationInFrames: props.timing.totalFrames, fps: props.timing.fps, width: d.width, height: d.height };
    }}
  />
);

registerRoot(Root);
