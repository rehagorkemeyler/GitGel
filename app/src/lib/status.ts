import type { Line } from './data'
import type { Status } from './live'

/** Status lines are short names ("M7"); map ids ("m7") compare through the line list. */
export function problemLineIds(status: Status | null, lines: Map<string, Line>): Set<string> {
  const names = new Set((status?.lines ?? []).map((l) => l.line.toLowerCase()))
  const out = new Set<string>()
  if (!names.size) return out
  for (const [id, l] of lines) if (names.has(l.name.toLowerCase()) || names.has(id.toLowerCase())) out.add(id)
  return out
}

/** True when a departure's short name belongs to a line with a reported problem. */
export function hasProblem(status: Status | null, shortName: string): boolean {
  const n = shortName.toLowerCase()
  return (status?.lines ?? []).some((l) => l.line.toLowerCase() === n)
}
