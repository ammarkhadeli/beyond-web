import React from 'react';
export function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    map: <><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-35 12 12)"/></>,
    crew: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/></>,
    play: <path d="m9 5 11 7-11 7Z" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3Z" /><circle cx="12" cy="13" r="4" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01" /></>,
    arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
    radio: <><path d="M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /><circle cx="12" cy="12" r="1.5" /></>,
    target: <><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></>,
    expand: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.help}</svg>;
}
