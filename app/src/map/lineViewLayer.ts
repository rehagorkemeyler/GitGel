import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import type { LineView } from '../lib/lineDetail'
import { fitCoords } from '../lib/camera'

const SRC = 'line-view'

/**
 * The opened line: its path (stop to stop) and stops. The camera is not moved here:
 * see fitLineView.
 */
export function showLineView(map: MlMap, view: LineView | null, drawPath: boolean): void {
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
    const round = { 'line-cap': 'round', 'line-join': 'round' } as const
    // Native: a white 8 dp casing under the 5 dp line (both only when the path is drawn).
    map.addLayer({
      id: SRC + '-casing',
      type: 'line',
      source: SRC,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: round,
      paint: { 'line-color': '#ffffff', 'line-width': 8 },
    })
    map.addLayer({
      id: SRC + '-line',
      type: 'line',
      source: SRC,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: round,
      paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
    })
    // Native stop node: 12 dp, a 3 dp line-colour border around a white fill (the stroke sits outside the radius).
    map.addLayer({
      id: SRC + '-stops',
      type: 'circle',
      source: SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 3, 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 },
    })
  }
}

/**
 * Frames the open line above the sheet, as native does 450 ms after the line or direction changes
 * (a line needs two stops to be framed). `bottomInset` is the map's bottom padding.
 */
export function fitLineView(map: MlMap, view: LineView | null, bottomInset: number): void {
  if (!view || view.coords.length < 2) return
  fitCoords(map, view.coords, bottomInset)
}
