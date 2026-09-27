import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...p,
});

export const IconGauge = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
    <path d="M12 13.5 16 8.5" />
    <circle cx="12" cy="13.5" r="1.4" />
  </svg>
);
export const IconCar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.5 14.5 5 10.2c.4-1 1.3-1.7 2.4-1.7h9.2c1.1 0 2 .7 2.4 1.7l1.5 4.3v3h-17v-3Z" />
    <path d="M3.5 14.5h17" />
    <circle cx="7.5" cy="17.5" r="1.6" />
    <circle cx="16.5" cy="17.5" r="1.6" />
  </svg>
);
export const IconMap = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);
export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.5 19.5h17" />
    <path d="m4.5 15 4-5 4 3 6.5-8" />
  </svg>
);
export const IconFlag = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 21V4" />
    <path d="M5 4h13l-2.5 4L18 12H5" />
  </svg>
);
export const IconFolder = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z" />
  </svg>
);
export const IconList = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
    <circle cx="4.5" cy="6.5" r=".6" fill="currentColor" />
    <circle cx="4.5" cy="12" r=".6" fill="currentColor" />
    <circle cx="4.5" cy="17.5" r=".6" fill="currentColor" />
  </svg>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 5v14l12-7L7 5Z" fill="currentColor" />
  </svg>
);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 5v14M16 5v14" strokeWidth={3} />
  </svg>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconBolt = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </svg>
);
export const IconCrosshair = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
  </svg>
);
