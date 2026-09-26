import { useMemo, useState } from 'react'
import { MapView } from './map/MapView'
import { BottomSheet } from './components/BottomSheet'
import { Panel } from './components/Panel'
import { Icon } from './components/Icon'
import { HomePeek } from './screens/Home'
import { SearchPanel } from './screens/SearchPanel'
import { Results } from './screens/Results'
import { RouteDetail } from './screens/RouteDetail'
import { Nearby } from './screens/Nearby'
import { useGeolocation } from './lib/useGeolocation'
import type { Place } from './lib/search'
import type { Itinerary } from './lib/api'
import { t, type StringKey } from './i18n'
import './App.css'

export type Screen = 'home' | 'search' | 'nearby' | 'lines' | 'contact' | 'support'

const titles: Record<Exclude<Screen, 'home' | 'search' | 'nearby'>, StringKey> = {
  lines: 'lines',
  contact: 'contact',
  support: 'support',
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [searchFor, setSearchFor] = useState<'to' | 'from'>('to')
  const [expanded, setExpanded] = useState(false)
  const [to, setTo] = useState<Place | null>(null)
  const [fromChoice, setFromChoice] = useState<Place | null>(null)
  const [open, setOpen] = useState<Itinerary | null>(null)
  const geo = useGeolocation()

  const me = useMemo<Place | null>(
    () => (geo.position ? { name: t('myLocation'), kind: 'me', lon: geo.position[0], lat: geo.position[1] } : null),
    [geo.position],
  )
  // Follow the live position only while "my location" is the origin.
  const from = fromChoice ?? me

  const openSearch = (which: 'to' | 'from') => {
    setSearchFor(which)
    setScreen('search')
  }

  return (
    <>
      <MapView position={geo.position} route={open} bottomInset={Math.round(window.innerHeight * 0.45)} />
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
        peek={
          open ? (
            <RouteDetail it={open} onBack={() => setOpen(null)} />
          ) : to ? (
            <Results
              from={from}
              to={to}
              onEditFrom={() => openSearch('from')}
              onEditTo={() => openSearch('to')}
              onClose={() => {
                setOpen(null)
                setTo(null)
                setFromChoice(null)
              }}
              onOpen={setOpen}
            />
          ) : (
            <HomePeek go={(s) => (s === 'search' ? openSearch('to') : setScreen(s))} />
          )
        }
      />
      {screen === 'search' && (
        <SearchPanel
          title={t(searchFor === 'to' ? 'whereTo' : 'from')}
          myLocation={searchFor === 'from' ? (me ?? { name: t('myLocation'), kind: 'me', lat: 0, lon: 0 }) : null}
          onBack={() => setScreen('home')}
          onPick={(p) => {
            if (searchFor === 'to') setTo(p)
            else if (p.kind === 'me') {
              setFromChoice(null)
              geo.start()
            } else setFromChoice(p)
            setScreen('home')
          }}
        />
      )}
      {screen === 'nearby' && <Nearby position={geo.position} onLocate={geo.start} onBack={() => setScreen('home')} />}
      {(screen === 'lines' || screen === 'contact' || screen === 'support') && (
        <Panel title={t(titles[screen])} onBack={() => setScreen('home')}>
          <p>{t('comingSoon')}</p>
        </Panel>
      )}
    </>
  )
}
