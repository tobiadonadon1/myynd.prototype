/** Keep the desktop process awake only while real work is in flight. No wake timers. */
type Port = { postMessage(value: unknown): void }
export function backgroundWorkScope(port: Port | undefined, interval = 15_000) {
  let active = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const send = () => { try { port?.postMessage({tipo:'lavoro-background',attivo:active > 0}) } catch { /* desktop exited */ } }
  return async function withWork<T>(work: () => Promise<T>): Promise<T> {
    active++
    if (active === 1) { send(); timer=setInterval(send,interval);timer.unref() }
    try { return await work() }
    finally { if (--active === 0) { clearInterval(timer);timer=undefined;send() } }
  }
}
export const withBackgroundWork = backgroundWorkScope((process as unknown as {parentPort?:Port}).parentPort)
