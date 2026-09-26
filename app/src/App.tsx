import { useState } from 'react'
import { MapView } from './map/MapView'
import { BottomSheet } from './components/BottomSheet'
import { Panel } from './components/Panel'
import { Icon } from './components/Icon'
import { HomePeek } from './screens/Home'
import { useGeolocation } from './lib/useGeolocation'
import { t, type StringKey } from './i18n'
import './App.css'

export type Screen = 'home' | 'search' | 'nearby' | 'lines' | 'contact' | 'support'

const titles: Record<Exclude<Screen, 'home'>, StringKey> = {
  search: 'whereTo',
  nearby: 'nearby',
  lines: 'lines',
  contact: 'contact',
  support: 'support',
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [expanded, setExpanded] = useState(false)
  const geo = useGeolocation()

  return (
    <>
      <MapView position={geo.position} />
      <button className="locate" onClick={geo.start} aria-label={t('locateMe')}>
        <Icon name="locate" />
      </button>
      {(geo.status === 'denied' || geo.status === 'unavailable') && (
        <p className="notice" role="status">
          {t(geo.status === 'denied' ? 'locationDenied' : 'locationUnavailable')}
        </p>
      )}
      <BottomSheet
        label={t('whereTo')}
        expanded={expanded}
        onExpandedChange={setExpanded}
        peek={<HomePeek go={setScreen} />}
      />
      {screen !== 'home' && (
        <Panel title={t(titles[screen])} onBack={() => setScreen('home')}>
          <p>{t('comingSoon')}</p>
        </Panel>
      )}
    </>
  )
}
