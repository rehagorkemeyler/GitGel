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
import { VehicleSheet } from './screens/VehicleSheet'
import type { TrainInfo } from './map/railLayer'
import { LineHeader, LineStops } from './screens/LineSheet'
import { lineView, useLineDetail } from './lib/lineDetail'
import type { Station } from './map/networkLayer'
import { inCity, useGeolocation, useStablePosition } from './lib/useGeolocation'
import { CITY, CITY_CHOSEN, switchCity } from './lib/city'
import type { Place } from './lib/search'
import type { Itinerary } from './lib/api'
import { t } from './i18n'
import { loadJson, loadSearchIndex, loadStops } from './lib/data'
import { useLineStatus, useLiveVehicles, type Vehicle } from './lib/live'
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
  const [options, setOptions] = useState<Itinerary[] | null>(null)
  const [station, setStation] = useState<Station | null>(null)
  const [train, setTrain] = useState<TrainInfo | null>(null)
  const [bus, setBus] = useState<Vehicle | null>(null)
  const [lineId, setLineId] = useState<string | null>(null)
  const [lineDir, setLineDir] = useState(0)
  const geo = useGeolocation()
  const lineData = useLineDetail(lineId)
  const view = useMemo(() => lineView(lineData.line, lineData.stops, lineDir), [lineData, lineDir])
  const railModes = ['metro', 'rail', 'tram', 'funicular', 'cablecar']
  // Buses (and Metrobüs) of the open route: İETT or EGO publish their GPS positions.
  // Ankara: EGO publishes bus positions per line, so the open line page shows its buses too.
  const openBusLine = CITY.ego && lineData.line?.mode === 'bus' ? lineData.line.name : null
  const busLines = useMemo(
    () => [
      ...(open?.legs ?? []).filter((l) => l.mode === 'BUS' && l.routeShortName).map((l) => l.routeShortName!),
      ...(openBusLine ? [openBusLine] : []),
    ],
    [open, openBusLine],
  )
  const vehicles = useLiveVehicles(busLines)
  const status = useLineStatus()
  const hiddenLines = useMemo(() => status?.lines.map((l) => l.line) ?? [], [status])
  const [railCount, setRailCount] = useState(0)
  const [map, setMap] = useState<MlMap | null>(null)
  const [picking, setPicking] = useState(false)
  const [choosingCity, setChoosingCity] = useState(false)
  const outside = !!geo.position && !inCity(geo.position)
  // First visit outside the default city: ask for the city before offering a test location.
  const cityPrompt = choosingCity || (!CITY_CHOSEN && outside)

  // Nightly data missing (first night of a new city, or Pages down): say so instead of an empty map.
  const [dataMissing, setDataMissing] = useState(false)
  useEffect(() => {
    loadJson('meta.json').catch(() => setDataMissing(true))
  }, [])

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
          alternatives={to ? options : null}
          vehicles={vehicles}
          hiddenLines={hiddenLines}
          onRailCount={setRailCount}
          bottomInset={Math.round(window.innerHeight * 0.45)}
          onReady={setMap}
          onStation={(st) => {
            if (open || to) return // a route is on screen: keep it
            setLineId(null)
            setTrain(null)
            setBus(null)
            setStation(st)
            setExpanded(false)
          }}
          onTrain={(tr) => {
            if (open || to) return
            setStation(null)
            setBus(null)
            setTrain(tr)
            setExpanded(false)
          }}
          onVehicle={(v) => {
            if (open || to) return
            setStation(null)
            setTrain(null)
            setBus(v)
            setExpanded(false)
          }}
          focusLine={lineId}
          focusLines={lineId ? [lineId] : station ? station.lines : null}
          lineView={view}
          pathInNetwork={!!lineData.line && (railModes.includes(lineData.line.mode) || (CITY.ego && lineData.line.mode === 'bus'))}
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
      {!picking && cityPrompt && (
        <div className="notice" role="status">
          <span>{t('pickCity')}</span>
          <div className="notice-actions">
            <button className="link" onClick={() => switchCity('istanbul')}>
              {t('cityIstanbul')}
            </button>
            <button className="link" onClick={() => switchCity('ankara')}>
              {t('cityAnkara')}
            </button>
            {choosingCity && (
              <button className="link quiet" onClick={() => setChoosingCity(false)}>
                {t('close')}
              </button>
            )}
          </div>
        </div>
      )}
      {!picking && !cityPrompt && dataMissing && (
        <div className="notice" role="status">
          <span>{t('cityDataMissing')}</span>
        </div>
      )}
      {!picking && !cityPrompt && !dataMissing && (outside || geo.status === 'denied' || geo.status === 'unavailable') && (
        <div className="notice" role="status">
          <span>
            {t(outside ? (CITY.id === 'ankara' ? 'outsideAnkara' : 'outsideIstanbul') : geo.status === 'denied' ? 'locationDenied' : 'locationUnavailable')}
          </span>
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
          bus ? `bus:${bus.id}` : lineId ? `line:${lineId}` : open ? `route:${open.startTime}` : to ? `to:${to.name}` : train ? `train:${train.id}` : station ? `st:${station.id}` : 'home'
        }
        expanded={expanded}
        onExpandedChange={setExpanded}
        peek={
          bus ? (
            <VehicleSheet
              vehicle={bus}
              onClose={() => setBus(null)}
              onLine={(id) => {
                setBus(null)
                setLineDir(0)
                setLineId(id)
              }}
            />
          ) : lineId ? (
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
              onOptions={setOptions}
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
            <HomePeek go={(s) => (s === 'search' ? openSearch('to') : setScreen(s))} onCity={() => setChoosingCity(true)} />
          )
        }
      >
        {lineId && !bus && <LineStops {...lineData} dir={lineDir} onDir={setLineDir} onClose={() => setLineId(null)} />}
      </BottomSheet>
      {screen === 'search' && (
        <SearchPanel
          title={t(searchFor === 'to' ? 'whereTo' : 'from')}
          myLocation={searchFor === 'from' ? (me ?? { name: t('myLocation'), kind: 'me', lat: 0, lon: 0 }) : null}
          near={stablePos}
          onBack={() => setScreen('home')}
          onPick={(p) => {
            // A stop picked by its number (Ankara) opens its card: that is what people look up.
            if (searchFor === 'to' && p.code) {
              setScreen('home')
              loadStops().then((all) => {
                const s = all.find((x) => x.id === `eg_${p.code}`)
                if (!s) return setTo(p)
                setLineId(null)
                setTrain(null)
                setBus(null)
                setStation({ ...s, ids: [s.id] })
                setExpanded(false)
                map?.jumpTo({ center: [s.lon, s.lat], zoom: 16.5 })
              }, () => setTo(p))
              return
            }
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
