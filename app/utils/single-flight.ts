/**
 * Wraps an async function so concurrent callers share one in-flight run.
 *
 * Unlike a plain "return early if already running" guard, every caller gets a
 * result from a run that started at or after its call: if a run is already in
 * flight, one follow-up run is queued behind it and all late callers share it.
 * That keeps callers from reading stale state (e.g. a session fetched before
 * `setActive` finished).
 */
export function createSingleFlight<T>(run: () => Promise<T>) {
  let inflight: Promise<T> | undefined
  let queued: Promise<T> | undefined

  const call = (): Promise<T> => {
    if (!inflight) {
      inflight = run().finally(() => {
        inflight = undefined
      })
      return inflight
    }
    queued ??= inflight
      .catch(() => undefined)
      .then(() => {
        queued = undefined
        return call()
      })
    return queued
  }

  return call
}
