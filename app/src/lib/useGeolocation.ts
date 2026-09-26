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

  return { ...state, start }
}
