import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { ISTANBUL_BOUNDS, ISTANBUL_CENTER, MAP_STYLE } from '../lib/config'
import { useColorScheme } from '../lib/useColorScheme'
import { inIstanbul } from '../lib/useGeolocation'
import type { Itinerary } from '../lib/api'
import { showRoute } from './routeLayer'
import { LiveLayer } from './liveLayer'
import { RailLayer, type TrainInfo } from './railLayer'
import { NetworkLayer, type Station } from './networkLayer'
import { showLineView } from './lineViewLayer'
import type { LineView } from '../lib/lineDetail'
import type { Vehicle } from '../lib/live'
import { t } from '../i18n'
import './MapView.css'

// Vite bundles MapLibre's module worker separately; tell MapLibre where it is.
maplibregl.setWorkerUrl(workerUrl)

type Props = {
  /** User position [lon, lat], when known. */
  position?: [number, number] | null
  /** Itinerary to draw, or null. */
  route?: Itinerary | null
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
  /** Line to emphasise (line page). */
  focusLine?: string | null
  /** Opened line page: path and stops. `pathInNetwork` = the base layer already draws its track. */
  lineView?: LineView | null
  pathInNetwork?: boolean
  onReady?: (map: MlMap) => void
}

export function MapView({ position, route = null, bottomInset = 0, vehicles, hiddenLines, onRailCount, onStation, onTrain, focusLine = null, lineView = null, pathInNetwork = false, onReady }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const scheme = useColorScheme()
  const routeRef = useRef<Itinerary | null>(null)
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
  const insetRef = useRef(0)
  routeRef.current = route
  insetRef.current = bottomInset

  useEffect(() => {
    if (!container.current) return
    const m = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE[scheme],
      center: ISTANBUL_CENTER,
      zoom: 11,
      maxBounds: [
        [ISTANBUL_BOUNDS[0][0] - 1, ISTANBUL_BOUNDS[0][1] - 1],
        [ISTANBUL_BOUNDS[1][0] + 1, ISTANBUL_BOUNDS[1][1] + 1],
      ],
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
      fadeDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
    })
    m.touchZoomRotate.disableRotation()
    map.current = m
    // Test hook for automated screenshots: only with ?debug in the URL.
    if (location.search.includes('debug')) (window as unknown as { __map: MlMap }).__map = m
    m.once('load', () => onReady?.(m))
    // setStyle (theme change) drops our layers: add the route back.
    live.current = new LiveLayer(m)
    net.current = new NetworkLayer(m)
    net.current.onStation = (st) => onStationRef.current?.(st)
    rail.current = new RailLayer(m)
    rail.current.onCount = (n) => onRailCount?.(n)
    rail.current.onTrain = (tr) => onTrainRef.current?.(tr)
    m.on('style.load', () => {
      styleReady.current = true
      net.current?.ensure()
      rail.current?.ensure()
      showRoute(m, routeRef.current, insetRef.current)
      showLineView(m, lineViewRef.current.v, insetRef.current, !lineViewRef.current.inNet)
      live.current?.ensure()
    })
    return () => {
      rail.current?.destroy()
      m.remove()
      map.current = null
    }
    // The map is created once; theme changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const firstScheme = useRef(scheme)
  useEffect(() => {
    if (scheme === firstScheme.current) return
    firstScheme.current = scheme
    styleReady.current = false
    map.current?.setStyle(MAP_STYLE[scheme])
  }, [scheme])

  useEffect(() => {
    const m = map.current
    if (m && styleReady.current) showRoute(m, route, insetRef.current)
  }, [route])

  useEffect(() => {
    net.current?.setFocus(focusLine)
    rail.current?.setOnly(focusLine)
  }, [focusLine])

  const lineViewRef = useRef<{ v: LineView | null; inNet: boolean }>({ v: null, inNet: false })
  useEffect(() => {
    lineViewRef.current = { v: lineView, inNet: pathInNetwork }
    const m = map.current
    if (m && styleReady.current) showLineView(m, lineView, insetRef.current, !pathInNetwork)
  }, [lineView, pathInNetwork])

  useEffect(() => {
    rail.current?.setHidden(hiddenLines ?? [])
  }, [hiddenLines])

  useEffect(() => {
    if (!styleReady.current) return
    live.current?.ensure()
    live.current?.update(vehicles ?? [])
  }, [vehicles])

  useEffect(() => {
    const m = map.current
    if (!m || !position) return
    if (!marker.current) {
      const el = document.createElement('div')
      el.className = 'me-dot'
      el.setAttribute('aria-label', t('myLocation'))
      marker.current = new maplibregl.Marker({ element: el }).setLngLat(position).addTo(m)
      // Outside Istanbul the map stays on the city (tiles and data end at its edge).
      if (!routeRef.current && inIstanbul(position)) m.jumpTo({ center: position, zoom: 15 })
    } else {
      marker.current.setLngLat(position)
    }
  }, [position])

  return <div ref={container} className="map" role="region" aria-label={t('map')} />
}
