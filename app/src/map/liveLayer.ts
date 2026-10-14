import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import type * as GeoJSON from 'geojson'
import type { Vehicle } from '../lib/live'
import { LIVE_COLOR } from '../lib/colors'
import type { Scheme } from '../lib/useColorScheme'

// Live vehicles: filled dots, drawn at each fix (native LiveLayer: no glide between fixes).
// Dot: 14 px across with a 2 px white ring. MapLibre draws the stroke outside the radius, so the
// outer diameter is 2 x (radius + stroke width) = 14, which gives a radius of 5.

const SRC = 'live-vehicles'
/** The layer that takes a tap on a live bus (MapView drops the bus bubble on any other tap). */
export const LIVE_TAP_LAYER = 'live-dots'

/** A tap on the open bus bubble (a DOM marker over the map) is not a tap on the map beneath it. */
export function fromBubble(e: Pick<MapMouseEvent, 'originalEvent'>): boolean {
  return !!(e.originalEvent?.target as Element | null | undefined)?.closest?.('.bus-bubble')
}

export class LiveLayer {
  private map: MlMap
  private list: Vehicle[] = []
  private byId = new Map<string, Vehicle>()
  onVehicle?: (v: Vehicle) => void

  constructor(map: MlMap) {
    this.map = map
    map.on('click', LIVE_TAP_LAYER, (e) => {
      if (fromBubble(e)) return
      const v = this.byId.get(String(e.features?.[0]?.properties?.id))
      if (v) this.onVehicle?.(v)
    })
    map.on('mouseenter', LIVE_TAP_LAYER, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', LIVE_TAP_LAYER, () => (map.getCanvas().style.cursor = ''))
  }

  /** Adds the source and layer; called again on every style.load with the current scheme. */
  ensure(scheme: Scheme) {
    if (this.map.getSource(SRC)) return
    this.map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    this.map.addLayer({
      id: LIVE_TAP_LAYER,
      type: 'circle',
      source: SRC,
      paint: {
        'circle-radius': 5,
        'circle-color': LIVE_COLOR[scheme],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
    this.draw()
  }

  update(vehicles: Vehicle[]) {
    this.list = vehicles
    this.byId = new Map(vehicles.map((v) => [v.id, v]))
    this.draw()
  }

  private draw() {
    const src = this.map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    const features: GeoJSON.Feature[] = this.list.map((v) => ({
      type: 'Feature',
      properties: { id: v.id },
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
    }))
    src.setData({ type: 'FeatureCollection', features })
  }
}
