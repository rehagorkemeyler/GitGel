import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import type { LineView } from '../lib/lineDetail'

const SRC = 'line-view'

/** The opened line: its path (stop to stop) and stops, framed above the sheet. */
export function showLineView(map: MlMap, view: LineView | null, bottomPadding: number, drawPath: boolean): void {
  const features: GeoJSON.Feature[] = []
  if (view && view.coords.length) {
    if (drawPath && view.coords.length > 1) {
      features.push({ type: 'Feature', properties: { color: view.color }, geometry: { type: 'LineString', coordinates: view.coords } })
    }
    for (const c of view.coords) features.push({ type: 'Feature', properties: { color: view.color }, geometry: { type: 'Point', coordinates: c } })
  }
  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
  const src = map.getSource(SRC) as GeoJSONSource | undefined
  if (src) src.setData(data)
  else {
    map.addSource(SRC, { type: 'geojson', data })
    map.addLayer({
      id: SRC + '-line',
      type: 'line',
      source: SRC,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
    })
    map.addLayer({
      id: SRC + '-stops',
      type: 'circle',
      source: SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2.5 },
    })
  }
  if (!view || view.coords.length < 1) return
  let minX = 180, minY = 90, maxX = -180, maxY = -90
  for (const [x, y] of view.coords) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  map.fitBounds([[minX, minY], [maxX, maxY]], { padding: { top: 64, left: 32, right: 32, bottom: bottomPadding + 32 }, duration: reduce ? 0 : 500, maxZoom: 15 })
}
