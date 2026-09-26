import { useEffect, useState } from 'react'

export type Scheme = 'light' | 'dark'

const query = '(prefers-color-scheme: dark)'

/** Follows the system light/dark setting. */
export function useColorScheme(): Scheme {
  const [scheme, setScheme] = useState<Scheme>(() =>
    typeof matchMedia !== 'undefined' && matchMedia(query).matches ? 'dark' : 'light',
  )
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setScheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return scheme
}
