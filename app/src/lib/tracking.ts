import { useEffect, useRef, useState } from 'react'
import type { Itinerary } from './api'
import { trackState, type TrackState } from './route'
import { t } from '../i18n'

// Web version of the native "Başla" follow mode: the trip is followed while the
// page is open, one vibration and one notification per ride, one stop before
// getting off. Both only after the user taps "Başla" (see prepareAlerts).

/** Asked only when the user taps "Başla". Tracking still works (vibration) without it. */
export async function prepareAlerts(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

function alertGetOff(title: string, body: string) {
  try {
    navigator.vibrate?.([0, 250, 150, 250])
  } catch {
    // Vibration is optional (not on iOS, not on every desktop).
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    // A service worker shows it while the page is in the background; the page itself when there is none.
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, tag: 'get-off' })).catch(() => {})
    } else {
      new Notification(title, { body, tag: 'get-off' })
    }
  } catch {
    // ignore
  }
}

/** Follows the trip while `it` is set: current step, and one alert per ride one stop before getting off. */
export function useTracking(it: Itinerary | null, position: [number, number] | null): TrackState | null {
  const [now, setNow] = useState(() => Date.now())
  const alerted = useRef(new Set<number>())

  useEffect(() => {
    alerted.current.clear()
    if (!it) return
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [it])

  // Positions are [lon, lat], as everywhere in the app.
  const state = it ? trackState(it, position ? { lat: position[1], lon: position[0] } : null, now) : null

  const leg = state?.leg ?? -1
  const getOff = !!state?.getOffNext
  useEffect(() => {
    if (!it || !getOff || alerted.current.has(leg)) return
    alerted.current.add(leg)
    const stop = it.legs[leg]?.to.name ?? ''
    alertGetOff(t('getOffTitle'), `${t('getOffAt')} ${stop}`)
  }, [it, leg, getOff])

  return state
}
