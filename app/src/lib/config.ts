// Where the app gets its data. Overridable at build time (VITE_*).
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''
// Static JSON built nightly by the ETL, published next to the app.
export const DATA_BASE: string = import.meta.env.VITE_DATA_BASE ?? `${import.meta.env.BASE_URL}data/`

export const MAP_STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

// Istanbul: initial view when location is unknown.
export const ISTANBUL_CENTER: [number, number] = [28.98, 41.03]
export const ISTANBUL_BOUNDS: [[number, number], [number, number]] = [
  [27.9, 40.7],
  [30.0, 41.7],
]

// MOTIS prefixes stop ids with the dataset name from infra/motis/config.yml.
export const MOTIS_STOP_PREFIX = 'istanbul_'
