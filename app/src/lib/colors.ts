// Accent and live colours. Same values as the native app (native src/theme/tokens.ts),
// so the map and the tokens in styles/tokens.css agree in both schemes.

/** App accent: highlighted bus lines, route fallbacks, the line-view fallback. Matches --accent. */
export const ACCENT = '#2f7cf6'

/** Live vehicle dots on the map. Matches --live (light #1f9d45, dark #34c759). */
export const LIVE_COLOR: Record<'light' | 'dark', string> = {
  light: '#1f9d45',
  dark: '#34c759',
}
