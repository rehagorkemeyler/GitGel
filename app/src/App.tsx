import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BottomSheet } from './components/BottomSheet'
import { Icon } from './components/Icon'
import { HomePeek } from './screens/Home'
import { SearchPanel } from './screens/SearchPanel'
import { Results } from './screens/Results'
import { RouteDetail } from './screens/RouteDetail'
import { Nearby } from './screens/Nearby'
import { Lines } from './screens/Lines'
import { Contact, Support } from './screens/Info'
import { About } from './screens/About'
import { StationSheet } from './screens/StationSheet'
import { TrainSheet } from './screens/TrainSheet'
import type { TrainInfo } from './map/railLayer'
import { LineHeader, LineStops } from './screens/LineSheet'
import { lineView, useLineDetail } from './lib/lineDetail'
import type { Station } from './map/networkLayer'
import { inIstanbul, useGeolocation, useStablePosition } from './lib/useGeolocation'
import type { Place } from './lib/search'
import type { Itinerary } from './lib/api'
import { t } from './i18n'
import { loadSearchIndex } from './lib/data'
import { useLineStatus, useLiveVehicles } from './lib/live'
import { StatusBand } from './components/StatusBand'
import { LocationPicker } from './components/LocationPicker'
import type { Map as MlMap } from 'maplibre-gl'
import './App.css'

// The map (MapLibre, the biggest chunk) loads in parallel; the panel is usable at once.
const MapView = lazy(() => import('./map/MapView').then((m) => ({ default: m.MapView })))

export type Screen = 'home' | 'search' | 'nearby' | 'lines' | 'contact' | 'support' | 'about'


export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [searchFor, setSearchFor] = useState<'to' | 'from'>('to')
  const [expanded, setExpanded] = useState(false)
  const [to, setTo] = useState<Place | null>(null)
  const [fromChoice, setFromChoice] = useState<Place | null>(null)
  const [open, setOpen] = useState<Itinerary | null>(null)
  const [station, setStation] = useState<Station | null>(null)
  const [train, setTrain] = useState<TrainInfo | null>(null)
  const [lineId, setLineId] = useState<string | null>(null)
  const [lineDir, setLineDir] = useState(0)
  const geo = useGeolocation()
  const lineData = useLineDetail(lineId)
  const view = useMemo(() => lineView(lineData.line, lineData.stops, lineDir), [lineData, lineDir])
  const railModes = ['metro', 'rail', 'tram', 'funicular', 'cablecar']
  // Buses and Metrobüs of the open route: İETT publishes their GPS positions.
  const busLines = useMemo(
    () => (open?.legs ?? []).filter((l) => l.mode === 'BUS' && l.routeShortName).map((l) => l.routeShortName!),
    [open],
  )
  const vehicles = useLiveVehicles(busLines)
  const status = useLineStatus()
  const hiddenLines = useMemo(() => status?.lines.map((l) => l.line) ?? [], [status])
  const [railCount, setRailCount] = useState(0)
  const [map, setMap] = useState<MlMap | null>(null)
  const [picking, setPicking] = useState(false)
  const outside = !!geo.position && !inIstanbul(geo.position)

  // Warm the search index while the user looks at the map.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
    idle(() => {
      loadSearchIndex().catch(() => {})
    })
  }, [])

  // Route searches use a position that only changes after a real move (GPS jitters every second).
  const stablePos = useStablePosition(geo.position)
  const me = useMemo<Place | null>(
    () => (stablePos ? { name: t('myLocation'), kind: 'me', lon: stablePos[0], lat: stablePos[1] } : null),
    [stablePos],
  )
  // Follow the live position only while "my location" is the origin.
  const from = fromChoice ?? me

  const openSearch = (which: 'to' | 'from') => {
    setSearchFor(which)
    setScreen('search')
  }

  return (
    <>
      <Suspense fallback={<div className="map" />}>
        <MapView
          position={geo.position}
          route={open}
          vehicles={vehicles}
          hiddenLines={hiddenLines}
          onRailCount={setRailCount}
          bottomInset={Math.round(window.innerHeight * 0.45)}
          onReady={setMap}
          onStation={(st) => {
            if (open || to) return // a route is on screen: keep it
            setLineId(null)
            setTrain(null)
            setStation(st)
            setExpanded(false)
          }}
          onTrain={(tr) => {
            if (open || to) return
            setStation(null)
            setTrain(tr)
            setExpanded(false)
          }}
          focusLine={lineId}
          lineView={view}
          pathInNetwork={!!lineData.line && railModes.includes(lineData.line.mode)}
        />
      </Suspense>
      {status && <StatusBand lines={status.lines} />}
      {(railCount > 0 || vehicles.length > 0) && (
        <div className="legend" aria-label={t('legend')}>
          {vehicles.length > 0 && (
            <span>
              <i className="dot live" /> {t('live')}
            </span>
          )}
          {railCount > 0 && (
            <span>
              <i className="dot scheduled" /> {t('scheduled')}
            </span>
          )}
        </div>
      )}
      <button className="locate" onClick={geo.start} aria-label={t('locateMe')}>
        <Icon name="locate" />
      </button>
      {!picking && (outside || geo.status === 'denied' || geo.status === 'unavailable') && (
        <div className="notice" role="status">
          <span>{t(outside ? 'outsideIstanbul' : geo.status === 'denied' ? 'locationDenied' : 'locationUnavailable')}</span>
          <button className="link" onClick={() => setPicking(true)}>
            {t('pickLocation')}
          </button>
        </div>
      )}
      {picking && (
        <LocationPicker
          map={map}
          onCancel={() => setPicking(false)}
          onPick={(p) => {
            geo.setOverride(p)
            setPicking(false)
          }}
        />
      )}
      <BottomSheet
        label={t('whereTo')}
        contentKey={
          lineId ? `line:${lineId}` : open ? `route:${open.startTime}` : to ? `to:${to.name}` : train ? `train:${train.id}` : station ? `st:${station.id}` : 'home'
        }
        expanded={expanded}
        onExpandedChange={setExpanded}
        peek={
          lineId ? (
            <LineHeader {...lineData} dir={lineDir} onDir={setLineDir} onClose={() => setLineId(null)} />
          ) : open ? (
            <RouteDetail it={open} liveCount={vehicles.length} onBack={() => setOpen(null)} />
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
          ) : train ? (
            <TrainSheet train={train} onClose={() => setTrain(null)} />
          ) : station ? (
            <StationSheet
              station={station}
              onClose={() => setStation(null)}
              onDirections={() => {
                setTo({ name: station.name, lat: station.lat, lon: station.lon, kind: 'stop' })
                setStation(null)
              }}
              onLine={(id) => {
                setLineDir(0)
                setLineId(id)
              }}
            />
          ) : (
            <HomePeek go={(s) => (s === 'search' ? openSearch('to') : setScreen(s))} />
          )
        }
      >
        {lineId && <LineStops {...lineData} dir={lineDir} onDir={setLineDir} onClose={() => setLineId(null)} />}
      </BottomSheet>
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
      {screen === 'lines' && (
        <Lines
          onBack={() => setScreen('home')}
          onOpen={(id) => {
            setLineDir(0)
            setLineId(id)
            setExpanded(false)
            setScreen('home')
          }}
        />
      )}
      {screen === 'contact' && <Contact onBack={() => setScreen('home')} onAbout={() => setScreen('about')} />}
      {screen === 'about' && <About onBack={() => setScreen('contact')} />}
      {screen === 'support' && <Support onBack={() => setScreen('home')} />}
    </>
  )
}
