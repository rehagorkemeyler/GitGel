import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ISTANBUL_BOUNDS, ISTANBUL_CENTER, MAP_STYLE } from '../lib/config'
import { useColorScheme } from '../lib/useColorScheme'
import './MapView.css'

type Props = {
  /** User position [lon, lat], when known. */
  position?: [number, number] | null
  onReady?: (map: MlMap) => void
}

export function MapView({ position, onReady }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const scheme = useColorScheme()

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
    return () => {
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
    if (!m || !position) return
    if (!marker.current) {
      const el = document.createElement('div')
      el.className = 'me-dot'
      el.setAttribute('aria-label', 'Konumun')
      marker.current = new maplibregl.Marker({ element: el }).setLngLat(position).addTo(m)
      m.jumpTo({ center: position, zoom: 15 })
    } else {
      marker.current.setLngLat(position)
    }
  }, [position])

  return <div ref={container} className="map" role="region" aria-label="Harita" />
}
