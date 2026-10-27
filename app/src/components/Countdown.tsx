import { memo } from 'react'
import { eta } from '../lib/eta'
import { useNow } from '../lib/useNow'

/**
 * "3 dk 12 sn" counting down every second from the last live update until the next one (native
 * Countdown). Only this text re-renders each second; the board around it stays still.
 */
export const Countdown = memo(function Countdown({ seconds, at, className }: { seconds: number; at: number; className?: string }) {
  const now = useNow(1000)
  return <span className={className}>{eta(seconds - (now - at) / 1000)}</span>
})
