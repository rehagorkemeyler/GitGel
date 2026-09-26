// Where the app gets its data. Overridable at build time (VITE_*).
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''
// Static JSON built nightly by the ETL, published next to the app.
export const DATA_BASE: string = import.meta.env.VITE_DATA_BASE ?? `${import.meta.env.BASE_URL}data/`

// Istanbul: initial view when location is unknown.
export const ISTANBUL_CENTER: [number, number] = [28.98, 41.03]
export const ISTANBUL_BOUNDS: [[number, number], [number, number]] = [
  [27.9, 40.7],
  [30.0, 41.7],
]

// MOTIS prefixes stop ids with the dataset name from infra/motis/config.yml.
export const MOTIS_STOP_PREFIX = 'istanbul_'

export const REPO_URL = 'https://github.com/rehagorkemeyler/GitGel'
export const ISSUES_URL = `${REPO_URL}/issues/new`
// Filled in once Görkem decides; empty hides the row.
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL ?? ''
export const DONATE_URL: string = import.meta.env.VITE_DONATE_URL ?? ''

// Live service (İETT GPS, Metro İstanbul status). Empty: live layer off.
export const LIVE_BASE: string = import.meta.env.VITE_LIVE_BASE ?? ''
