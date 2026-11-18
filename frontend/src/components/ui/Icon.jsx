/**
 * Inline SVG icon set. One component, no icon fonts. Icons are decorative
 * (aria-hidden) unless a title is passed.
 */
const PATHS = {
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 3',
  location: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  phone: 'M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z',
  pin: 'M9 3h6l-1 6 4 4H6l4-4zM12 13v8',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  check: 'M4 12l5 5L20 6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  logout: 'M15 4h5v16h-5M10 8l-4 4 4 4M6 12h11',
  plus: 'M12 5v14M5 12h14',
  building: 'M4 21V3h10v18M14 9h6v12M7 7h2M7 11h2M7 15h2M17 13h1M17 17h1M2 21h20',
  book: 'M4 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4zM20 4h-6M20 4v15h-6',
  refresh: 'M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  upload: 'M12 21V9M7 14l5-5 5 5M4 4h16',
  flag: 'M5 21V4h11l-2 4 2 4H5',
};

export default function Icon({ name, size = 18, title, className, strokeWidth = 2 }) {
  const d = PATHS[name];
  if (!d) return null;
  const labelled = Boolean(title);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={labelled ? undefined : 'true'}
      role={labelled ? 'img' : undefined}
      focusable="false"
    >
      {labelled && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}
