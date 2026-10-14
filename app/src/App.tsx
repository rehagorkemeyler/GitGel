import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet, type SheetHandle } from './components/BottomSheet'
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
import { LineHeader, LineStops } from './screens/LineSheet'
import { lineView, useLineDetail } from './lib/lineDetail'
import type { Station } from './map/networkLayer'
import { useGeolocation, useStablePosition } from './lib/useGeolocation'
import { CITY, CITY_CHOSEN, busShapes, cityAt, liveStop, rememberCity, switchCity, type CityId } from './lib/city'
import type { Place } from './lib/search'
import type { Itinerary } from './lib/api'
import { cityName, t } from './i18n'
import { rememberLine, rememberPlace, rememberStation, type RecentPlace } from './lib/recent'
import { prepareAlerts, useTracking } from './lib/tracking'
import { TrackingBanner } from './components/TrackingBanner'
import { loadJson, loadSearchIndex, loadStops, type StopRow } from './lib/data'
import { plateKey, useLineStatus, useLiveArrivals, useLiveVehicles, type Vehicle } from './lib/live'
import { StatusBand } from './components/StatusBand'
import type { Map as MlMap } from 'maplibre-gl'
import { SNAP } from './lib/sheet'
import { STOP_ZOOM, cameraMs, locateFade, mapBottomInset, safeInsets, sheetTopOf } from './lib/camera'
import { defaultSnapOf, isTrip, popPanels, resetPanels, type Panel } from './lib/panels'
import './App.css'

// The map (MapLibre, the biggest chunk) loads in parallel; the panel is usable at once.
const MapView = lazy(() => import('./map/MapView').then((m) => ({ default: m.MapView })))

/** Screens the home menu can open (the sheet panels of the stack). */
export type Screen = 'home' | 'search' | 'nearby' | 'lines' | 'contact' | 'support' | 'about'

// Set once per page load: after a reload the panels start at home again (see the history effect).
let historyResumed = false

const CITY_IDS: CityId[] = ['istanbul', 'ankara', 'bursa']

/**
 * The stop a search result names (native SearchPanel): an Ankara stop by its id, a Bursa stop by its
 * position and name (its code is not an id), else any stop at the same place.
 */
function matchStop(all: StopRow[], p: Place): StopRow | undefined {
  if (CITY.live === 'ego') return all.find((x) => x.id === `eg_${p.code}`)
  const near = (x: StopRow) => Math.abs(x.lat - p.lat) < 0.0002 && Math.abs(x.lon - p.lon) < 0.0002
  return all.find((x) => near(x) && x.name === p.name) ?? all.find(near)
}

export function App() {
  // The panel stack (native App.tsx): the top panel is what the sheet shows; the one below is "back".
  const [stack, setStackState] = useState<Panel[]>([{ kind: 'home' }])
  const stackRef = useRef(stack)
  const panel = stack[stack.length - 1]
  const sheet = useRef<SheetHandle>(null)
  // Trip state, kept while panels come and go (native destination, fromChoice, options, tracked).
  const [to, setTo] = useState<Place | null>(null)
  const [fromChoice, setFromChoice] = useState<Place | null>(null)
  const [options, setOptions] = useState<Itinerary[] | null>(null)
  const [tracking, setTracking] = useState<Itinerary | null>(null)
  const geo = useGeolocation()
  // What the top panel shows.
  const station = panel.kind === 'station' ? panel.station : null
  const lineId = panel.kind === 'line' ? panel.id : null
  const lineDir = panel.kind === 'line' ? panel.dir : 0
  const openRoute = panel.kind === 'route' ? panel.it : null
  // Native shownRoute: the opened route, or the options on the results panel.
  const shownRoute = openRoute ? [openRoute] : panel.kind === 'results' ? options : null
  const lineData = useLineDetail(lineId)
  const view = useMemo(() => lineView(lineData.line, lineData.stops, lineDir), [lineData, lineDir])
  const railModes = ['metro', 'rail', 'tram', 'funicular', 'cablecar']
  // Live buses (native App.tsx): the open route's bus lines (Bursa: trams too), the open bus line (Ankara
  // and Bursa: EGO and BURULAŞ publish bus positions per line; Bursa trams too), and the buses coming to the
  // open stop (its live board, matched by plate). Istanbul has no stop board, so only the route counts there.
  const liveTram = CITY.live === 'burulas'
  const openBusLine =
    busShapes() && (lineData.line?.mode === 'bus' || (liveTram && lineData.line?.mode === 'tram')) ? lineData.line.name : null
  const boardStop = station ? liveStop(station.id) : null
  const coming = useLiveArrivals(boardStop)?.arrivals
  const comingLines = useMemo(() => [...new Set((coming ?? []).map((a) => a.line))].sort().join(','), [coming])
  const comingPlates = useMemo(() => new Set((coming ?? []).map((a) => plateKey(a.plate)).filter(Boolean)), [coming])
  const busLines = useMemo(
    () => [
      ...(openRoute?.legs ?? [])
        .filter((l) => (l.mode === 'BUS' || (liveTram && l.mode === 'TRAM')) && l.routeShortName)
        .map((l) => l.routeShortName!),
      ...(openBusLine ? [openBusLine] : []),
      ...(comingLines ? comingLines.split(',') : []),
    ],
    [openRoute, openBusLine, comingLines, liveTram],
  )
  const lineVehicles = useLiveVehicles(busLines)
  const vehicles = useMemo(
    () => (boardStop ? lineVehicles.filter((v) => comingPlates.has(plateKey(v.plate))) : lineVehicles),
    [boardStop, lineVehicles, comingPlates],
  )
  // The tapped live bus (native bubbleId): a bubble over the map, not a panel, so the panel stack and the
  // station or train card stay as they are. It is kept by id and read from the live list on every render,
  // so speed, plate, crowding and age refresh with each poll (native MapScreen.tsx:69).
  const [busId, setBusId] = useState<string | null>(null)
  const bus = busId ? vehicles.find((v) => v.id === busId) ?? null : null
  // Set on render: while a bubble is open, a station or train tap only closes it (native guardedStation).
  const busShown = useRef(false)
  busShown.current = bus !== null
  // The bus left the list (its line closed, or it passed the stop): the bubble goes with it (native MapScreen.tsx:72-74).
  useEffect(() => {
    if (busId && !bus) setBusId(null)
  }, [busId, bus])
  const closeBus = useCallback(() => setBusId(null), [])
  // A tap on a bus opens its bubble; the same bus again closes it; another bus moves it (native MapScreen.tsx:76).
  const onVehicle = useCallback((v: Vehicle) => setBusId((id) => (id === v.id ? null : v.id)), [])
  const status = useLineStatus()
  const hiddenLines = useMemo(() => status?.lines.map((l) => l.line) ?? [], [status])
  const [railCount, setRailCount] = useState(0)
  const [map, setMap] = useState<MlMap | null>(null)
  const [picking, setPicking] = useState(false)
  const [choosingCity, setChoosingCity] = useState(false)
  // "Başla": the trip is followed while the page is open; alerts are asked only when the user starts it.
  const track = useTracking(tracking, geo.position)
  // A stop card and a line page count as uses (frequent places and lines); the search counts places itself.
  useEffect(() => {
    if (station) rememberStation(station)
  }, [station])
  useEffect(() => {
    if (lineId) rememberLine(lineId)
  }, [lineId])
  // The city chooser opens only from home (native: the city panel). No prompt for an outside position.
  const cityPrompt = choosingCity
  // Locate (native onLocate): a press bumps `recenter`, so the map flies to the user. The sheet reports
  // its height: the locate button rides on it, and the map's bottom padding follows it once it settles.
  const [recenter, setRecenter] = useState(0)
  const [sheetPx, setSheetPx] = useState(0)
  const locateRef = useRef<HTMLButtonElement>(null)
  // First launch (native setCity): the city the phone is in is remembered, without asking. A supported
  // city elsewhere is switched to (a reload here, where native re-mounts).
  const cityNoted = useRef(false)
  useEffect(() => {
    if (CITY_CHOSEN || cityNoted.current || !geo.position) return
    const here = cityAt(geo.position)
    if (!here) return
    cityNoted.current = true
    if (here === CITY.id) rememberCity(here)
    else switchCity(here)
  }, [geo.position])

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

  // ---- Panel stack -------------------------------------------------------------------------
  // The state and a ref: callbacks that run later (a search answer, a back gesture) read the current stack.
  const setPanels = (next: Panel[]) => {
    stackRef.current = next
    setStackState(next)
  }
  // Each panel above home is one browser history entry, so Android back closes the top panel first.
  const move = (next: Panel[]) => {
    const prevLen = stackRef.current.length
    const d = next.length - prevLen
    setPanels(next)
    if (d > 0) for (let i = 0; i < d; i++) history.pushState({ depth: prevLen + i }, '')
    else if (d < 0) history.go(d)
    else if (next.length > 1) history.replaceState({ depth: next.length - 1 }, '')
  }
  const top = () => stackRef.current[stackRef.current.length - 1]
  // The sheet's next move (native goTo): the new panel's default, or the height it had when it comes back.
  const goTo = (p: Panel) => sheet.current?.goTo(defaultSnapOf(p), p.snapH)

  /** Opens a panel on top; the one below keeps the height it had. */
  const push = (p: Panel) => {
    const s = stackRef.current
    const h = sheet.current?.height()
    goTo(p)
    move([...s.slice(0, -1), { ...s[s.length - 1], snapH: h }, p])
  }
  /** Replaces the stack down to the panels `keep` allows, then opens `p` (native resetTo). */
  const resetTo = (keep: (p: Panel) => boolean, p: Panel | null) => {
    const next = resetPanels(stackRef.current, keep, p)
    goTo(next[next.length - 1])
    move(next)
  }
  /** Replaces the top panel, as a stop card does for another stop (native replaceTop). */
  const replaceTop = (p: Panel) => move([...stackRef.current.slice(0, -1), p])
  /** Back: the panel below comes back at the height it had. */
  const pop = () => {
    const next = popPanels(stackRef.current)
    if (next === stackRef.current) return
    goTo(next[next.length - 1])
    move(next)
  }
  // Android back: the browser goes back one entry; the top panel closes instead while there is one.
  useEffect(() => {
    // After a reload the panels start at home, but the browser still holds this page's entries above
    // the first one: go back to it, so the back gesture is not spent on panels that are gone.
    const depth = typeof history.state?.depth === 'number' ? history.state.depth : 0
    if (!historyResumed && depth > 0) {
      historyResumed = true
      history.go(-depth)
    }
    const onPop = (e: PopStateEvent) => {
      const depth = typeof e.state?.depth === 'number' ? e.state.depth : 0
      const s = stackRef.current
      if (depth + 1 >= s.length) return
      const next = s.slice(0, depth + 1)
      goTo(next[next.length - 1])
      setPanels(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showResults = () => resetTo((x) => !isTrip(x), { kind: 'results' })

  /** A destination: its results open (native chooseDestination). With no origin, the position is asked for now. */
  const chooseDestination = (p: Place) => {
    setTo(p)
    setPicking(false)
    showResults()
    if (!fromChoice && !geo.position) geo.start()
  }
  /** An origin: back to the trip when there is a destination, else back to the search that asked (native chooseOrigin). */
  const chooseOrigin = (p: Place) => {
    if (p.kind === 'me') {
      setFromChoice(null)
      geo.start()
    } else setFromChoice(p)
    if (to) showResults()
    else pop()
  }
  /** Closing a trip removes its panels and forgets the destination, origin, options and tracking (native closeTrip). */
  const closeTrip = () => {
    setTo(null)
    setFromChoice(null)
    setOptions(null)
    setTracking(null)
    resetTo((x) => !isTrip(x), null)
  }
  /** "Başla" follows the trip and drops the sheet to the peek; the same button stops it (native toggleTracking). */
  const toggleTracking = (it: Itinerary) => {
    if (tracking) {
      setTracking(null)
      return
    }
    // The user asked for it, so alerts may be asked for now.
    void prepareAlerts()
    geo.start()
    setTracking(it)
    sheet.current?.snapTo(SNAP.peek)
  }
  /** A stop card: the card replaces the one already on top (native openStation). */
  const openStation = (st: Station, fly = false) => {
    if (top().kind === 'station') replaceTop({ kind: 'station', station: st })
    else push({ kind: 'station', station: st })
    // A stop picked from a list flies to it (native); a tap on the map leaves the camera alone.
    if (fly && map) map.easeTo({ center: [st.lon, st.lat], zoom: STOP_ZOOM, duration: cameraMs() })
  }
  const openLine = (id: string) => push({ kind: 'line', id, dir: 0 })
  const setLineDirection = (d: number) => {
    if (panel.kind === 'line') replaceTop({ ...panel, dir: d })
  }
  /** A recent stop opens its card again; anything else is a destination. */
  const onRecent = (p: RecentPlace) => (p.station ? openStation(p.station, true) : chooseDestination(p))
  const onSearchPick = (which: 'to' | 'from', p: Place) => {
    // A recent stop that was opened as a card opens its card again (native pickRecent).
    const station = (p as RecentPlace).station
    if (which === 'to' && station) {
      pop()
      openStation(station, true)
      return
    }
    // A stop picked by its number (Ankara, Bursa) opens its card: that is what people look up.
    if (which === 'to' && p.code) {
      pop()
      loadStops().then((all) => {
        const s = matchStop(all, p)
        if (!s) return chooseDestination(p)
        openStation({ ...s, ids: [s.id] }, true)
      }, () => chooseDestination(p))
      return
    }
    if (which === 'to') chooseDestination(p)
    else chooseOrigin(p)
  }
  /** "Locate me" (native onLocate): asks for the position, and the map flies to it. */
  const locateMe = () => {
    geo.start()
    setRecenter((n) => n + 1)
  }
  /** Long press on the map (native onLongPress): the point becomes the destination, and is remembered. */
  const onLongPress = (p: { lat: number; lon: number }) => {
    // Native: a long press closes the bus bubble, then picks the point.
    closeBus()
    const here: Place = { name: t('pickedPoint'), kind: 'address', lat: p.lat, lon: p.lon }
    rememberPlace(here)
    chooseDestination(here)
  }
  /** "Haritada seç" (native onPickOnMap): the search closes, the sheet drops to its minimum, a long press picks. */
  const pickOnMap = () => {
    setPicking(true)
    resetTo((x) => x.kind !== 'search', null)
    sheet.current?.goTo(SNAP.min)
  }
  /** The sheet's height: live while it is dragged (the locate button follows, without re-rendering the app), settled after. */
  const onSheetVisible = useCallback((px: number, live: boolean) => {
    const el = locateRef.current
    if (el) {
      const vh = window.innerHeight
      const safe = safeInsets()
      el.style.transform = `translate3d(0, ${-px}px, 0)`
      const fade = locateFade(sheetTopOf(px, vh, safe.bottom), vh, safe.top)
      el.style.setProperty('--locate-fade', String(fade))
      // Faded out, the button takes no taps (it is not visible). inert keeps it out of focus order too.
      el.inert = fade === 0
      el.classList.toggle('dragging', live)
    }
    if (!live) setSheetPx(px)
  }, [])

  const go = (s: Screen) => {
    if (s === 'search') push({ kind: 'search', which: 'to' })
    else if (s === 'nearby') {
      push({ kind: 'nearby' })
      // Native: the nearby list asks for the position when it has none, and flies there.
      if (!geo.position) locateMe()
    }
    else if (s === 'lines') push({ kind: 'lines' })
    else if (s === 'contact') push({ kind: 'contact' })
    else if (s === 'support') push({ kind: 'support' })
  }

  const contentId =
    panel.kind === 'station'
      ? panel.station.id
      : panel.kind === 'line'
        ? panel.id
        : panel.kind === 'route'
          ? panel.it.startTime
          : panel.kind === 'train'
            ? panel.train.id
            : panel.kind === 'search'
              ? panel.which
              : ''
  // Same panel: the sheet keeps the user's height. A new panel: its default (or the height it had).
  const panelKey = `${stack.length}:${panel.kind}:${contentId}`

  const content = (() => {
    switch (panel.kind) {
      case 'home':
        return <HomePeek go={go} onCity={() => setChoosingCity(true)} onRecent={onRecent} />
      case 'search':
        return (
          <SearchPanel
            title={t(panel.which === 'to' ? 'whereTo' : 'from')}
            myLocation={panel.which === 'from' ? (me ?? { name: t('myLocation'), kind: 'me', lat: 0, lon: 0 }) : null}
            near={stablePos}
            onBack={pop}
            onPick={(p) => onSearchPick(panel.which, p)}
            onPickOnMap={pickOnMap}
          />
        )
      case 'results':
        return to ? (
          <Results
            from={from}
            to={to}
            onEditFrom={() => push({ kind: 'search', which: 'from' })}
            onEditTo={() => push({ kind: 'search', which: 'to' })}
            onClose={closeTrip}
            onOpen={(it) => push({ kind: 'route', it })}
            onOptions={setOptions}
          />
        ) : null
      case 'route':
        return (
          <RouteDetail
            it={panel.it}
            liveCount={vehicles.length}
            tracking={tracking === panel.it}
            onBack={pop}
            onStart={() => toggleTracking(panel.it)}
          />
        )
      case 'station':
        return (
          <StationSheet
            station={panel.station}
            onClose={pop}
            onDirections={() => chooseDestination({ name: panel.station.name, lat: panel.station.lat, lon: panel.station.lon, kind: 'stop' })}
            onLine={openLine}
          />
        )
      case 'line':
        return <LineHeader {...lineData} dir={lineDir} onDir={setLineDirection} onClose={pop} />
      case 'train':
        return <TrainSheet train={panel.train} onClose={pop} />
      case 'lines':
        return <Lines onBack={pop} onOpen={openLine} />
      case 'nearby':
        return <Nearby position={geo.position} onLocate={locateMe} onBack={pop} />
      case 'contact':
        return <Contact onBack={pop} onAbout={() => push({ kind: 'about' })} />
      case 'support':
        return <Support onBack={pop} />
      case 'about':
        return <About onBack={pop} />
    }
  })()

  return (
    <>
      <Suspense fallback={<div className="map" />}>
        <MapView
          position={geo.position}
          route={openRoute}
          alternatives={to ? options : null}
          vehicles={vehicles}
          hiddenLines={hiddenLines}
          onRailCount={setRailCount}
          bottomInset={mapBottomInset(sheetPx, window.innerHeight)}
          destination={to && !options?.length ? to : null}
          recenter={recenter}
          onLongPress={onLongPress}
          onReady={setMap}
          onStation={(st) => {
            // A bus bubble is open: this tap only closes it (native guardedStation).
            if (busShown.current) return closeBus()
            if (shownRoute?.length) return // a route is on screen: keep it
            openStation(st)
          }}
          onTrain={(tr) => {
            if (busShown.current) return closeBus()
            if (!shownRoute?.length) push({ kind: 'train', train: tr })
          }}
          onVehicle={onVehicle}
          bubble={bus}
          onBubbleClose={closeBus}
          onMapTap={closeBus}
          focusLines={lineId ? [lineId] : station ? station.lines : null}
          focusBus={station ? station.lines : []}
          selectedStop={station?.id ?? null}
          lineView={view}
          pathInNetwork={!!lineData.line && (railModes.includes(lineData.line.mode) || (busShapes() && lineData.line.mode === 'bus'))}
        />
      </Suspense>
      {status && <StatusBand lines={status.lines} />}
      {/* The legend shares the top slot with the tracking banner, notices and the pick hint: it waits for them. */}
      {(railCount > 0 || vehicles.length > 0) && !(tracking && track) && !picking && !cityPrompt && !dataMissing && (
        <div className="legend" aria-label={t('legend')}>
          {vehicles.length > 0 && (
            <span className="legend-live">
              <i className="dot live" /> {t('live')}
            </span>
          )}
          {/* Native: the scheduled item is hidden while a route or the results list is open. */}
          {railCount > 0 && !shownRoute?.length && (
            <span>
              <i className="dot scheduled" /> {t('scheduled')}
            </span>
          )}
        </div>
      )}
      <button
        ref={locateRef}
        className="locate"
        onClick={() => {
          navigator.vibrate?.(8)
          locateMe()
        }}
        aria-label={t('locateMe')}
      >
        <Icon name="navigate" size={22} />
      </button>
      {tracking && track && <TrackingBanner it={tracking} state={track} onStop={() => setTracking(null)} />}
      {!picking && cityPrompt && (
        <div className="notice" role="status">
          <span>{t('pickCity')}</span>
          <div className="notice-actions">
            {CITY_IDS.map((id) => (
              <button key={id} className="link" onClick={() => switchCity(id)}>
                {cityName(id)}
              </button>
            ))}
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
      {picking && (
        <button className="pick-hint" onClick={() => setPicking(false)}>
          <span>{t('pickOnMapHint')}</span>
          <span className="pick-cancel">{t('cancel')}</span>
        </button>
      )}
      <BottomSheet ref={sheet} label={t('whereTo')} contentKey={panelKey} defaultSnap={defaultSnapOf(panel)} peek={content} onVisible={onSheetVisible}>
        {lineId && <LineStops {...lineData} dir={lineDir} onDir={setLineDirection} onClose={pop} />}
      </BottomSheet>
    </>
  )
}
