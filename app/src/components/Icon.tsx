// Small inline icons (no icon font, no dependency).
const paths = {
  search: 'M10.5 3a7.5 7.5 0 1 0 4.55 13.46l4.24 4.25 1.42-1.42-4.25-4.24A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z',
  route: 'M6 3a3 3 0 0 0-1 5.83V21h2V8.83A3 3 0 0 0 6 3Zm12 0a3 3 0 0 0-1 5.83V15a2 2 0 0 1-2 2h-4v-2l-3 3 3 3v-2h4a4 4 0 0 0 4-4V8.83A3 3 0 0 0 18 3Z',
  locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 3h-2.07A7 7 0 0 0 13 5.07V3h-2v2.07A7 7 0 0 0 5.07 11H3v2h2.07A7 7 0 0 0 11 18.93V21h2v-2.07A7 7 0 0 0 18.93 13H21v-2Zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z',
  back: 'M15.5 4.5 8 12l7.5 7.5 1.4-1.4L10.8 12l6.1-6.1-1.4-1.4Z',
  mail: 'M3 5h18v14H3V5Zm2 2v.5l7 4.5 7-4.5V7H5Zm14 2.9-7 4.5-7-4.5V17h14V9.9Z',
  walk: 'M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2a5 5 0 0 1-4.3-2.4l-1-1.6A2 2 0 0 0 12 6c-.3 0-.5 0-.8.1L6 8.3V13h2V9.6l1.8-.7Z',
  heart: 'M12 21s-7.5-4.6-9.5-9.2C1.2 8.7 3.2 5 6.8 5c2 0 3.4 1.1 4.2 2.3h2C13.8 6.1 15.2 5 17.2 5c3.6 0 5.6 3.7 4.3 6.8C19.5 16.4 12 21 12 21Z',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={paths[name]} fill="currentColor" />
    </svg>
  )
}
