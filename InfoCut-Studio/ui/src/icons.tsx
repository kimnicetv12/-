import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  plus: <path d="M8 3v10M3 8h10" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v3.5M9.2 7v3.5" />,
  copy: <><rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1" /><path d="M10.5 5.5V3.5a.5.5 0 00-.5-.5H3.5a.5.5 0 00-.5.5V10a.5.5 0 00.5.5h2" /></>,
  up: <path d="M8 13V3M4 7l4-4 4 4" />,
  down: <path d="M8 3v10M4 9l4 4 4-4" />,
  back: <path d="M9.5 3L4.5 8l5 5" />,
  gear: <><circle cx="8" cy="8" r="2" /><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" /></>,
  image: <><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 11l3.5-3.5 2.5 2.5 2-2 4 4" /><circle cx="10.5" cy="6" r="1" /></>,
  folder: <path d="M2 4.5a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1z" />,
  download: <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" />,
  share: <><circle cx="4" cy="8" r="1.6" /><circle cx="11.5" cy="3.8" r="1.6" /><circle cx="11.5" cy="12.2" r="1.6" /><path d="M5.4 7.2l4.7-2.6M5.4 8.8l4.7 2.6" /></>,
  play: <path d="M5 3.5v9l7-4.5z" />,
  stop: <rect x="4" y="4" width="8" height="8" />,
  volume: <path d="M2.5 6v4h2.5l3.5 3V3L5 6zM11 5.5a3.5 3.5 0 010 5" />,
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
