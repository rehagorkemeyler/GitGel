import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as maplibregl from 'maplibre-gl'
import type { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { CITY } from '../lib/city'
import { baseStyle, blankStyle } from './baseStyle'
import { useColorScheme } from '../lib/useColorScheme'
import { inCity } from '../lib/useGeolocation'
import type { Itinerary } from '../lib/api'
import type { Place } from '../lib/search'
import { showRoute, fitRoute } from './routeLayer'
import { LIVE_TAP_LAYERS, LiveLayer, fromBubble } from './liveLayer'
import { RAIL_TAP_LAYERS, RailLayer, type TrainInfo } from './railLayer'
import { NET_TAP_LAYERS, NetworkLayer, type Station } from './networkLayer'
import { VehicleBubble } from './VehicleBubble'
import { showLineView, fitLineView } from './lineViewLayer'
import type { LineView } from '../lib/lineDetail'
import { stopToStopPaths } from '../lib/busFocus'
import type { Vehicle } from '../lib/live'
import { t } from '../i18n'
import { FIRST_FIX_ZOOM, FIT_DELAY_MS, LOCATE_ZOOM, cameraMs, startZoom } from '../lib/camera'
import './MapView.css'

// Vite bundles MapLibre's module worker separately; tell MapLibre where it is.
maplibregl.setWorkerUrl(workerUrl)

/** Taps that belong to a bus, station or train layer (their own handlers): the rest of the map is "empty map". */
const TAP_LAYERS = [...LIVE_TAP_LAYERS, ...NET_TAP_LAYERS, ...RAIL_TAP_LAYERS]
/** Native long press: a still press of this length picks the point under the finger. */
const LONG_PRESS_MS = 500
/** A finger that moves this far (px) is panning, not pressing. */
const LONG_PRESS_SLOP = 10
/** Native destination pin: red (#ff3b30), tip at the point. */
const DEST_PIN =
  '<svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true" focusable="false"><path d="M14 0C6.3 0 0 6.3 0 14c0 9.6 14 22 14 22s14-12.4 14-22C28 6.3 21.7 0 14 0Z" fill="#ff3b30"/><circle cx="14" cy="14" r="5" fill="#ffffff"/></svg>'

type Props = {
  /** User position [lon, lat], when known. */
  position?: [number, number] | null
  /** Itinerary to draw, or null. */
  route?: Itinerary | null
  /** Route results: every option, fastest first (drawn grey behind the first). */
  alternatives?: Itinerary[] | null
  /** Height covered by the bottom sheet, so the route is framed above it. */
  bottomInset?: number
  /** Live GPS vehicles (filled dots). */
  vehicles?: Vehicle[]
  /** Lines whose scheduled dots must be hidden (service problem reported). */
  hiddenLines?: string[]
  /** Number of scheduled rail dots currently drawn. */
  onRailCount?: (n: number) => void
  /** Tap on a station or stop marker. */
  onStation?: (s: Station) => void
  /** Tap on a scheduled train ring. */
  onTrain?: (t: TrainInfo) => void
  /** Tap on a live vehicle dot. */
  onVehicle?: (v: Vehicle) => void
  /** The live bus whose bubble is open: the card is drawn above it and follows it. */
  bubble?: Vehicle | null
  /** Tap on the bubble card: closes it. */
  onBubbleClose?: () => void
  /** Tap on empty map (not a bus, station or train): closes the bubble (native onPress). */
  onMapTap?: () => void
  /** Lines to emphasise on the base map (open line, or every line of a tapped stop). */
  focusLines?: string[] | null
  /** Bus and ferry lines of a tapped stop, drawn stop to stop (Istanbul). */
  focusBus?: string[]
  /** The stop of the open station card: its bus stop is drawn selected (accent tile). */
  selectedStop?: string | null
  /** Opened line page: path and stops. `pathInNetwork` = the base layer already draws its track. */
  lineView?: LineView | null
  pathInNetwork?: boolean
  /** The destination: a red pin while no route is drawn yet. */
  destination?: Place | null
  /** Bumped by "locate me": the camera flies to the position (or to the first fix that arrives). */
  recenter?: number
  /** Long press on the map (native onLongPress): the point under the finger. */
  onLongPress?: (p: { lat: number; lon: number }) => void
  onReady?: (map: MlMap) => void
}

/** The opened itinerary alone, else every option of the route results. */
function routesOf(route: Itinerary | null, alternatives: Itinerary[] | null): Itinerary[] {
  return route ? [route] : (alternatives ?? [])
}

/**
 * Long press on the map: a still press of LONG_PRESS_MS calls `fire` with the point under the
 * finger. Moving, a second finger, a camera move or a control press cancels it. Returns the cleanup.
 */
function watchLongPress(m: MlMap, el: HTMLElement, fire: (lat: number, lon: number) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let start = { x: 0, y: 0 }
  let pointers = 0
  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const down = (e: PointerEvent) => {
    pointers++
    cancel()
    if (pointers > 1 || e.button !== 0) return
    if ((e.target as Element | null)?.closest?.('.maplibregl-ctrl, .bus-bubble')) return
    start = { x: e.clientX, y: e.clientY }
    const box = el.getBoundingClientRect()
    timer = setTimeout(() => {
      timer = null
      const ll = m.unproject([start.x - box.left, start.y - box.top])
      fire(ll.lat, ll.lng)
    }, LONG_PRESS_MS)
  }
  const move = (e: PointerEvent) => {
    if (timer !== null && Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_SLOP) cancel()
  }
  const up = () => {
    pointers = Math.max(0, pointers - 1)
    cancel()
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  m.on('movestart', cancel)
  return () => {
    cancel()
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    m.off('movestart', cancel)
  }
}

const noop = () => {}

export function MapView({
  position,
  route = null,
  alternatives = null,
  bottomInset = 0,
  vehicles,
  hiddenLines,
  onRailCount,
  onStation,
  onTrain,
  onVehicle,
  bubble = null,
  onBubbleClose,
  onMapTap,
  focusLines = null,
  focusBus = [],
  selectedStop = null,
  lineView = null,
  pathInNetwork = false,
  destination = null,
  recenter = 0,
  onLongPress,
  onReady,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const destMarker = useRef<maplibregl.Marker | null>(null)
  const scheme = useColorScheme()
  const routeRef = useRef<Itinerary | null>(null)
  const altRef = useRef<Itinerary[] | null>(null)
  const live = useRef<LiveLayer | null>(null)
  const rail = useRef<RailLayer | null>(null)
  const net = useRef<NetworkLayer | null>(null)
  // True between 'style.load' and the next setStyle. (isStyleLoaded() also turns
  // false while any GeoJSON source is updating, which is constantly here.)
  const styleReady = useRef(false)
  const onStationRef = useRef(onStation)
  onStationRef.current = onStation
  const onTrainRef = useRef(onTrain)
  onTrainRef.current = onTrain
  const schemeRef = useRef(scheme)
  schemeRef.current = scheme
  const onVehicleRef = useRef(onVehicle)
  onVehicleRef.current = onVehicle
  const onMapTapRef = useRef(onMapTap)
  onMapTapRef.current = onMapTap
  // The bubble: a DOM marker anchored at the bus (bottom centre, so its tail sits just above the dot).
  const [bubbleEl] = useState(() => {
    const el = document.createElement('div')
    el.className = 'bus-bubble-anchor'
    return el
  })
  const bubbleMarker = useRef<maplibregl.Marker | null>(null)
  const onLongPressRef = useRef(onLongPress)
  onLongPressRef.current = onLongPress
  const positionRef = useRef<[number, number] | null>(position ?? null)
  positionRef.current = position ?? null
  // A locate press waiting for the first fix, and the first fix of the session (native flewToUser).
  const locatePending = useRef(false)
  const flewToUser = useRef(false)
  const insetRef = useRef(0)
  routeRef.current = route
  altRef.current = alternatives
  insetRef.current = bottomInset

  useEffect(() => {
    const el = container.current
    if (!el) return
    const m = new maplibregl.Map({
      container: el,
      style: blankStyle(scheme),
      center: CITY.center,
      // Native's first view: the city centre, at the zoom where its start span fills this width.
      zoom: startZoom(el.clientWidth),
      // Attribution moves to the bottom-left (native: Google logo there), clear of the locate button.
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
      fadeDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
    })
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    m.touchZoomRotate.disableRotation()
    // Native pitchEnabled={false}: no two-finger tilt.
    m.touchPitch.disable()
    m.setMaxPitch(0)
    map.current = m
    // Test hook for automated screenshots: only with ?debug in the URL.
    if (location.search.includes('debug')) (window as unknown as { __map: MlMap }).__map = m
    m.once('load', () => onReady?.(m))
    // A tap on empty map closes the bubble. A tap on the bubble itself or on a bus, station or train is
    // handled by that element or layer, so it is not an empty-map tap.
    m.on('click', (e) => {
      if (fromBubble(e)) return
      const tapLayers = TAP_LAYERS.filter((id) => m.getLayer(id))
      if (tapLayers.length && m.queryRenderedFeatures(e.point, { layers: tapLayers }).length) return
      onMapTapRef.current?.()
    })
    // setStyle (theme change) drops our layers: add the route back.
    live.current = new LiveLayer(m)
    live.current.onVehicle = (v) => onVehicleRef.current?.(v)
    net.current = new NetworkLayer(m)
    net.current.onStation = (st) => onStationRef.current?.(st)
    rail.current = new RailLayer(m)
    rail.current.onCount = (n) => onRailCount?.(n)
    rail.current.onTrain = (tr) => onTrainRef.current?.(tr)
    m.on('style.load', () => {
      styleReady.current = true
      net.current?.ensure()
      rail.current?.ensure()
      showRoute(m, routesOf(routeRef.current, altRef.current))
      showLineView(m, lineViewRef.current.v, !lineViewRef.current.inNet)
      live.current?.ensure(schemeRef.current)
    })
    const stopLongPress = watchLongPress(m, el, (lat, lon) => onLongPressRef.current?.({ lat, lon }))
    return () => {
      stopLongPress()
      bubbleMarker.current?.remove()
      bubbleMarker.current = null
      rail.current?.destroy()
      m.remove()
      map.current = null
    }
    // The map is created once; theme changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Base style per theme (fetched, recoloured for dark); our layers are re-added on 'style.load'.
  useEffect(() => {
    let alive = true
    baseStyle(scheme).then(
      (st) => {
        if (!alive || !map.current) return
        styleReady.current = false
        map.current.setStyle(st)
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [scheme])

  // Route options or the opened route: drawn at once, framed 450 ms later (native), once the sheet has settled.
  // A style still loading draws the routes on 'style.load'; the fit checks the style when it fires.
  useEffect(() => {
    const m = map.current
    const its = routesOf(route, alternatives)
    if (m && styleReady.current) showRoute(m, its)
    const id = setTimeout(() => {
      const cur = map.current
      if (cur && styleReady.current) fitRoute(cur, its, insetRef.current)
    }, FIT_DELAY_MS)
    return () => clearTimeout(id)
  }, [route, alternatives])

  // Native: one focused line (a line page, or a stop with one line) keeps only that line's trains.
  const onlyLine = focusLines?.length === 1 ? focusLines[0] : null
  useEffect(() => {
    rail.current?.setOnly(onlyLine)
  }, [onlyLine])

  // Route results on screen (native dim): every line fades, the scheduled trains are off, the focus clears.
  const dim = routesOf(route, alternatives).length > 0
  useEffect(() => {
    rail.current?.setSuspended(dim)
    net.current?.setDim(dim)
  }, [dim])

  const focusKey = (focusLines ?? []).join(',')
  useEffect(() => {
    net.current?.setFocus(focusKey ? focusKey.split(',') : null)
  }, [focusKey])

  // Bus and ferry lines of a tapped stop, stop to stop (Istanbul); none while a route is on screen.
  const busKey = dim ? '' : focusBus.join(',')
  useEffect(() => {
    let alive = true
    if (!busKey) {
      net.current?.setBusPaths([])
      return
    }
    stopToStopPaths(busKey.split(',')).then(
      (paths) => alive && net.current?.setBusPaths(paths),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [busKey])

  useEffect(() => {
    net.current?.setSelected(selectedStop)
  }, [selectedStop])

  const lineViewRef = useRef<{ v: LineView | null; inNet: boolean }>({ v: null, inNet: false })
  // The open line: drawn at once, framed 450 ms later (native). Closing it leaves the camera where it is.
  useEffect(() => {
    lineViewRef.current = { v: lineView, inNet: pathInNetwork }
    const m = map.current
    if (m && styleReady.current) showLineView(m, lineView, !pathInNetwork)
    const id = setTimeout(() => {
      const cur = map.current
      if (cur && styleReady.current) fitLineView(cur, lineView, insetRef.current)
    }, FIT_DELAY_MS)
    return () => clearTimeout(id)
  }, [lineView, pathInNetwork])

  useEffect(() => {
    rail.current?.setHidden(hiddenLines ?? [])
  }, [hiddenLines])

  useEffect(() => {
    if (!styleReady.current) return
    live.current?.ensure(schemeRef.current)
    live.current?.update(vehicles ?? [])
  }, [vehicles])

  // The bubble follows its bus: the marker moves with each fix (the list refreshes every 15 s).
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!bubble) {
      bubbleMarker.current?.remove()
      bubbleMarker.current = null
      return
    }
    const at: [number, number] = [bubble.lon, bubble.lat]
    if (bubbleMarker.current) bubbleMarker.current.setLngLat(at)
    else bubbleMarker.current = new maplibregl.Marker({ element: bubbleEl, anchor: 'bottom' }).setLngLat(at).addTo(m)
  }, [bubble, bubbleEl])

  // The user's dot. The first fix of the session flies to the user inside the city (native, zoom 15);
  // a locate press flies to the fix it asked for (zoom 16), or waits for the first fix.
  useEffect(() => {
    const m = map.current
    if (!m || !position) return
    if (!marker.current) {
      const el = document.createElement('div')
      el.className = 'me-dot'
      el.setAttribute('aria-label', t('myLocation'))
      marker.current = new maplibregl.Marker({ element: el }).setLngLat(position).addTo(m)
    } else {
      marker.current.setLngLat(position)
    }
    if (locatePending.current) {
      locatePending.current = false
      flewToUser.current = true
      m.easeTo({ center: position, zoom: LOCATE_ZOOM, duration: cameraMs() })
    } else if (!flewToUser.current && inCity(position)) {
      flewToUser.current = true
      m.flyTo({ center: position, zoom: FIRST_FIX_ZOOM, duration: cameraMs() })
    }
  }, [position])

  // "Locate me" (native onLocate): fly to the position now, or to the first fix that arrives.
  useEffect(() => {
    if (!recenter) return
    const m = map.current
    if (!m) return
    const here = positionRef.current
    if (!here) {
      locatePending.current = true
      return
    }
    locatePending.current = false
    flewToUser.current = true
    m.easeTo({ center: here, zoom: LOCATE_ZOOM, duration: cameraMs() })
  }, [recenter])

  // The destination pin: native shows it while there is a destination and no route yet.
  useEffect(() => {
    destMarker.current?.remove()
    destMarker.current = null
    const m = map.current
    if (!m || !destination) return
    const el = document.createElement('div')
    el.className = 'dest-pin'
    el.innerHTML = DEST_PIN
    el.setAttribute('aria-label', destination.name)
    destMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([destination.lon, destination.lat])
      .addTo(m)
  }, [destination])

  return (
    <>
      <div ref={container} className="map" role="region" aria-label={t('map')} />
      {bubble && createPortal(<VehicleBubble vehicle={bubble} onClose={onBubbleClose ?? noop} />, bubbleEl)}
    </>
  )
}
