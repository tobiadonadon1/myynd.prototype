import type { AccessoChatGPT, ChatGPT } from './api.ts'

/** Unknown billing codes are not customer-facing plan names. */
export function nomePianoChatGPT(piano: string | null | undefined): string {
  const nomi: Record<string, string> = { free: 'Free', plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', enterprise: 'Enterprise', edu: 'Edu' }
  return nomi[piano?.trim().toLowerCase() ?? ''] ?? ''
}

/** Existing accounts never hide the customer's browser sign-in route. */
export function azioniConnessioneChatGPT(stato: ChatGPT | null, selezionato: boolean, accessoInCorso: boolean) {
  return {
    accesso: stato?.installato && !accessoInCorso ? stato.entrato ? 'altro' as const : 'collega' as const : null,
    usa: !!stato?.entrato && !accessoInCorso && (!selezionato || !stato.acceso),
    disattiva: selezionato && !!stato?.acceso && !accessoInCorso,
    runtimeMancante: !!stato && !stato.installato
  }
}

/** A sign-in check has a deadline and never selects a billing/provider route. */
export function controllaAccessoChatGPT(
  eventi: {
    leggi: (signal: AbortSignal) => Promise<AccessoChatGPT>
    entrato: () => void
    terminato: (stato: AccessoChatGPT) => void
    errore: (errore: unknown) => void
    scaduto: () => void
  },
  opzioni: { durata?: number; intervallo?: number } = {}
): () => void {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let limite: ReturnType<typeof setTimeout> | undefined
  const ferma = () => { controller.abort(); clearTimeout(timer); clearTimeout(limite) }
  limite = setTimeout(() => { ferma(); eventi.scaduto() }, Math.max(0, opzioni.durata ?? 120_000))
  const controlla = async () => {
    try {
      const stato = await eventi.leggi(controller.signal)
      if (controller.signal.aborted) return
      if (stato.stato === 'completed') { ferma(); eventi.entrato(); return }
      if (stato.stato !== 'pending') { ferma(); eventi.terminato(stato); return }
    } catch (e) { if (!controller.signal.aborted) eventi.errore(e) }
    if (!controller.signal.aborted) timer = setTimeout(controlla, opzioni.intervallo ?? 2000)
  }
  void controlla()
  return ferma
}
