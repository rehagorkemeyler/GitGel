import { useCallback, useEffect, useRef, useState } from 'react'

export type GeoState = {
  position: [number, number] | null
  status: 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable'
}

/**
 * Location stays on the phone. We never ask on page load (no popups the user
 * did not open): if permission was already granted we start watching,
 * otherwise we wait for the user to tap "locate me".
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ position: null, status: 'idle' })
  const watch = useRef<number | null>(null)

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'unavailable' }))
      return
    }
    if (watch.current !== null) return
    setState((s) => ({ ...s, status: s.position ? 'ok' : 'asking' }))
    watch.current = navigator.geolocation.watchPosition(
      (p) => setState({ position: [p.coords.longitude, p.coords.latitude], status: 'ok' }),
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

  // Test location (for testers outside Istanbul). Lives until the page reloads.
  const [override, setOverride] = useState<[number, number] | null>(null)
  if (override) return { position: override, status: 'ok' as const, start, setOverride, isOverride: true }
  return { ...state, start, setOverride, isOverride: false }
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

export function inIstanbul(p: [number, number] | null): boolean {
  return !!p && p[0] > 27.9 && p[0] < 30.0 && p[1] > 40.7 && p[1] < 41.7
}
