// GitGel wordmark from brand/gitgel-logo.svg. Uses currentColor: black on light, white on dark.
export function Logo({ height = 32, title = 'GitGel' }: { height?: number; title?: string }) {
  return (
    <svg viewBox="90 90 1128 332" height={height} role="img" aria-label={title} className="logo">
      <path d="M168 344 L222 296 H268 L316.4 214.4" fill="none" stroke="currentColor" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round"/><circle cx="168" cy="344" r="56" fill="currentColor"/><path fill="currentColor" fillRule="evenodd" d="M290 168a54 54 0 1 0 108 0a54 54 0 1 0 -108 0Z M320 168a24 24 0 1 0 48 0a24 24 0 1 0 -48 0Z"/><g transform="translate(470 320.0) scale(0.64)"><g fill="none" stroke="currentColor" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round"><circle cx="100" cy="-100" r="80"/><path d="M180 -180 V40 A80 80 0 0 1 30.7 80.0"/><path d="M292 -180 V-20"/><circle cx="292" cy="-268" r="25" stroke="none" fill="currentColor"/><path d="M419 -270 V-20"/><path d="M374 -180 H479"/><circle cx="635" cy="-100" r="80"/><path d="M715 -180 V40 A80 80 0 0 1 565.7 80.0"/><path d="M827 -100 H987 A80 80 0 1 0 968.3 -48.6"/><path d="M1099 -290 V-20"/></g></g>
    </svg>
  )
}
