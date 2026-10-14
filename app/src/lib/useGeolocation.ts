import { CITY, inBounds } from './city'
import { useCallback, useEffect, useRef, useState } from 'react'

export type GeoState = {
  position: [number, number] | null
  status: 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable'
}

/** A position fix: [lon, lat] and its time in ms. */
export type Fix = { lon: number; lat: number; t: number }

/** Native watchPositionAsync: a new fix counts after the phone moved this far... */
export const FIX_METRES = 15
/** ...or after this long, whichever comes first (native timeInterval 5000). */
export const FIX_MS = 5000

/**
 * True when `next` should replace `last`: the first fix, a fix 15 m from the last accepted one, or
 * one 5 s after it. Fewer updates keep the dot and the route origin steadier (native useLocation).
 */
export function isNewFix(last: Fix | null, next: Fix, metres = FIX_METRES, ms = FIX_MS): boolean {
  if (!last) return true
  if (next.t - last.t >= ms) return true
  const dLat = (next.lat - last.lat) * 111_320
  const dLon = (next.lon - last.lon) * 111_320 * Math.cos((next.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon) >= metres
}

/**
 * Location stays on the phone. We never ask on page load (no popups the user
 * did not open): if permission was already granted we start watching,
 * otherwise we wait for the user to tap "locate me".
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ position: null, status: 'idle' })
  const watch = useRef<number | null>(null)
  const lastFix = useRef<Fix | null>(null)

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'unavailable' }))
      return
    }
    if (watch.current !== null) return
    setState((s) => ({ ...s, status: s.position ? 'ok' : 'asking' }))
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const fix: Fix = { lon: p.coords.longitude, lat: p.coords.latitude, t: p.timestamp }
        if (!isNewFix(lastFix.current, fix)) return
        lastFix.current = fix
        setState({ position: [fix.lon, fix.lat], status: 'ok' })
      },
      (e) => {
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
        watch.current = null
        setState((s) => ({ ...s, status: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }))
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )
  }, [])

  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => {
        if (p.state === 'granted') start()
      })
      .catch(() => {})
    return () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    }
  }, [start])

  return { ...state, start }
}

/** Same position until it moves more than `metres`: stops GPS jitter from re-running searches. */
export function useStablePosition(position: [number, number] | null, metres = 150): [number, number] | null {
  const [stable, setStable] = useState(position)
  let next = stable
  if (!position) next = null
  else if (!stable) next = position
  else {
    const dLat = (position[1] - stable[1]) * 111_320
    const dLon = (position[0] - stable[0]) * 111_320 * Math.cos((position[1] * Math.PI) / 180)
    if (Math.hypot(dLat, dLon) > metres) next = position
  }
  // Adjusting state while rendering is React's recommended pattern for derived state.
  if (next !== stable) setStable(next)
  return next
}

/** Inside the city this page shows. */
export function inCity(p: [number, number] | null): boolean {
  return inBounds(p, CITY.bounds)
}
