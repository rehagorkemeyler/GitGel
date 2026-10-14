import { useSyncExternalStore } from 'react'
import { App } from './App'
import { lang, subscribeLang } from './i18n'

/** Changing the language re-mounts the app, so every string and layer starts clean (native App.tsx version key). */
export function Root() {
  const current = useSyncExternalStore(subscribeLang, () => lang)
  return <App key={current} />
}
