import type { Itinerary } from './api'
import type { Line } from './data'
import type { LineStatus, Status } from './live'

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

/** The reported message of a line, matched by short name; undefined when the line has none (native line notice). */
export function lineMessage(status: Status | null, shortName: string): string | undefined {
  const n = shortName.toLowerCase()
  return (status?.lines ?? []).find((l) => l.line.toLowerCase() === n)?.message
}

/** Short names of the itinerary's rides (walks excluded) that have a reported problem, each once (native problemsOf). */
export function problemsOf(it: Itinerary, problemLines: string[]): string[] {
  const bad = new Set(problemLines.map((l) => l.toLowerCase()))
  const names = it.legs
    .filter((l) => l.mode !== 'WALK' && !!l.routeShortName && bad.has(l.routeShortName.toLowerCase()))
    .map((l) => l.routeShortName!)
  return [...new Set(names)]
}

/** Status lines of the lines that stop at this station: the station card's disruption tab (native myProblems). */
export function stopDisruptions(status: Status | null, lines: Map<string, Line>, stopLineIds: string[]): LineStatus[] {
  const problems = problemLineIds(status, lines)
  return (status?.lines ?? []).filter((s) =>
    stopLineIds.some((id) => problems.has(id) && lines.get(id)?.name.toLowerCase() === s.line.toLowerCase()),
  )
}
