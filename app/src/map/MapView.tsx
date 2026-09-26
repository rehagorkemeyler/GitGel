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
import { RailLayer } from './railLayer'
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
  onReady?: (map: MlMap) => void
}

export function MapView({ position, route = null, bottomInset = 0, vehicles, hiddenLines, onRailCount, onReady }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const scheme = useColorScheme()
  const routeRef = useRef<Itinerary | null>(null)
  const live = useRef<LiveLayer | null>(null)
  const rail = useRef<RailLayer | null>(null)
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
    m.once('load', () => onReady?.(m))
    // setStyle (theme change) drops our layers: add the route back.
    live.current = new LiveLayer(m)
    rail.current = new RailLayer(m)
    rail.current.onCount = (n) => onRailCount?.(n)
    m.on('style.load', () => {
      rail.current?.ensure()
      showRoute(m, routeRef.current, insetRef.current)
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

  useEffect(() => {
    map.current?.setStyle(MAP_STYLE[scheme])
  }, [scheme])

  useEffect(() => {
    const m = map.current
    if (m?.isStyleLoaded()) showRoute(m, route, insetRef.current)
  }, [route])

  useEffect(() => {
    rail.current?.setHidden(hiddenLines ?? [])
  }, [hiddenLines])

  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return
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
