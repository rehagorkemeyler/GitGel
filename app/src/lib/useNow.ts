import { useEffect, useState } from 'react'

/** Current time, refreshed every `ms` (countdowns without calling Date.now during render). */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
