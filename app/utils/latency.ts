/**
 * Lightweight dev-only tracer for the voice round trip (recording stopped → audio playing).
 * Each mark is logged once per trace with the elapsed time since the trace started.
 */

let traceStart: number | null = null
let seen = new Set<string>()

export function startLatencyTrace(label: string): void {
  traceStart = performance.now()
  seen = new Set()
  if (import.meta.dev) console.debug(`[latency] ${label} → start`)
}

export function markLatency(name: string): void {
  if (traceStart === null || seen.has(name)) return
  seen.add(name)
  if (import.meta.dev) {
    console.debug(`[latency] ${name} +${Math.round(performance.now() - traceStart)}ms`)
  }
}
