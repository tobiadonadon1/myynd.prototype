/** A queued delegation is not evidence that the worker has started. */
export function compitoInEsecuzione(c: { stato: string }, passo: unknown): boolean {
  return c.stato === 'delegato' && passo != null
}
