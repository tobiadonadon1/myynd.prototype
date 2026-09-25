import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../lingua'
import { Hov } from '../ui'
import { desktop, type Desktop } from '../desktop'
import { controllaAccessoChatGPT } from '../chatgpt-accesso.ts'
import { PANNELLO_ACCESSO_DISCO } from './forms'
import type { Controllo } from '../salute-fonti'
import type { Vals } from '../vals'

/**
 * Il ponte dell'osservatore (P1A), quando c'è: il permesso per i titoli delle
 * finestre e la sua schermata. Manca nei gusci vecchi e nel browser.
 */
type ConOsservatore = Desktop & { osservatore?: { permessoTitoli?(): Promise<boolean>; apriImpostazioniTitoli?(): Promise<void> } }
export const osservatore = () => (desktop() as ConOsservatore | null)?.osservatore ?? null

/** Aspetta che la finestra torni davanti (dalle Impostazioni di Sistema, di solito). */
function alRitorno(segnale: AbortSignal): Promise<void> {
  return new Promise(risolvi => {
    const via = () => { window.removeEventListener('focus', f); document.removeEventListener('visibilitychange', f) }
    const f = () => { if (document.visibilityState === 'hidden') return; via(); risolvi() }
    window.addEventListener('focus', f)
    document.addEventListener('visibilitychange', f)
    segnale.addEventListener('abort', via, { once: true })
  })
}

const STILE_LINK = { flex: 'none', color: 'var(--rame-testo)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' } as const
const STILE_BOTTONE = { ...STILE_LINK, background: 'none', border: 0, padding: 0, margin: 0, font: 'inherit', fontWeight: 500, cursor: 'pointer', lineHeight: 'inherit' } as const

/**
 * L'unico controllo della riga fissa: quello che sistema davvero.
 *
 * Ogni pressione risponde subito (la parola cambia prima di qualunque
 * risposta) e torna com'era se non riesce. «Apri Impostazioni» aspetta che la
 * finestra torni davanti e rilegge lo stato: se il permesso manca ancora, la
 * riga lo dice e il controllo diventa «Riapri Myynd». «Accedi di nuovo» fa
 * rientrare l'account di Claude da qui, come il suo pannello. «Vai alle
 * Fonti» apre il pannello della fonte, o la griglia se sono più d'una.
 */
export function RimedioFonte({ controllo, v, quandoImpostazioni, quandoTitoli }: {
  controllo: Controllo
  v: Vals
  /** Tornati dalle Impostazioni: il permesso del disco manca ancora? */
  quandoImpostazioni: (ancora: boolean) => void
  /** Il permesso dei titoli, riletto dopo le Impostazioni. */
  quandoTitoli: (negati: boolean) => void
}) {
  const [occupato, setOccupato] = useState<string | null>(null)
  const ferma = useRef<AbortController | null>(null)
  const accesso = useRef<{ id: string; smetti: () => void } | null>(null)
  useEffect(() => () => {
    ferma.current?.abort()
    if (accesso.current) { accesso.current.smetti(); void api.annullaAccessoClaude(accesso.current.id).catch(() => {}); accesso.current = null }
  }, [])
  // il controllo cambia (la riga ha cambiato causa): quello che si aspettava non vale più
  const chiave = controllo.tipo === 'fonti' ? `fonti:${controllo.id}` : controllo.tipo
  const [chiaveVista, setChiaveVista] = useState(chiave)
  if (chiaveVista !== chiave) { setChiaveVista(chiave); if (occupato && controllo.tipo !== 'riapri') setOccupato(null) }

  const guaio = (e: unknown, ripiego: string) => v.mostraToast(e instanceof Error && e.message ? t(e.message) : t(ripiego))

  const premi = async () => {
    if (occupato) return
    const d = desktop()
    if (controllo.tipo === 'impostazioni') {
      setOccupato(t('Aspetto il permesso…'))
      const c = new AbortController(); ferma.current?.abort(); ferma.current = c
      try { await d?.apriFuori(PANNELLO_ACCESSO_DISCO) }
      catch (e) { setOccupato(null); guaio(e, 'Non sono riuscito ad aprire le Impostazioni.'); return }
      await alRitorno(c.signal)
      if (c.signal.aborted) return
      try {
        const s = await v.ricaricaStato()
        quandoImpostazioni((s.letturaIncompleta ?? []).some(f => f.rimedio === 'permesso-disco'))
      } catch { /* la riga resta com'era */ }
      setOccupato(null)
      return
    }
    if (controllo.tipo === 'riapri') {
      setOccupato(t('Riapro…'))
      // resta così finché l'app si chiude
      try { await d?.riavvia?.() } catch (e) { setOccupato(null); guaio(e, 'Non sono riuscito a riaprire Myynd.') }
      return
    }
    if (controllo.tipo === 'accessibilita') {
      const o = osservatore()
      setOccupato(t('Aspetto il permesso…'))
      const c = new AbortController(); ferma.current?.abort(); ferma.current = c
      try { await o?.apriImpostazioniTitoli?.() }
      catch (e) { setOccupato(null); guaio(e, 'Non sono riuscito ad aprire le Impostazioni.'); return }
      await alRitorno(c.signal)
      if (c.signal.aborted) return
      try {
        const negati = (await o?.permessoTitoli?.()) === false
        quandoTitoli(negati)
        if (!negati) v.mostraToast(t('Vedo di nuovo i titoli delle finestre.'))
      } catch { /* resta com'era */ }
      setOccupato(null)
      return
    }
    if (controllo.tipo === 'accedi-claude') {
      setOccupato(t('Apro l’accesso…'))
      const fallito = (msg?: string) => { accesso.current = null; setOccupato(null); v.mostraToast(msg ? t(msg) : t('L’accesso non è riuscito.')) }
      try {
        // Claude Code apre il browser da sé, come dal pannello
        const r = await api.accediClaude()
        const smetti = controllaAccessoChatGPT({
          leggi: signal => api.statoAccessoClaude(r.loginId, signal),
          entrato: () => {
            accesso.current = null
            v.claudeRipresoDaQui()
            v.mostraToast(t('Anthropic è di nuovo collegato.'))
            void v.ricaricaStato().catch(() => {}).finally(() => setOccupato(null))
          },
          terminato: esito => fallito(esito.stato === 'failed' ? esito.errore : undefined),
          errore: e => { accesso.current?.smetti(); void api.annullaAccessoClaude(r.loginId).catch(() => {}); fallito(e instanceof Error ? e.message : undefined) },
          scaduto: () => { void api.annullaAccessoClaude(r.loginId).catch(() => {}); fallito() }
        }, { durata: 180_000 })
        accesso.current = { id: r.loginId, smetti }
      } catch (e) { fallito(e instanceof Error ? e.message : undefined) }
    }
  }

  if (controllo.tipo === 'fonti') {
    const id = controllo.id
    return <Hov as="a" href="#" onClick={(e: { preventDefault: () => void }) => { e.preventDefault(); if (id) v.apriConnessioni(id); else v.goConn() }}
      style={STILE_LINK} hover={{ color: 'var(--inchiostro)' }}>{t('Vai alle Fonti')}</Hov>
  }
  const etichetta = controllo.tipo === 'impostazioni' ? t('Apri Impostazioni')
    : controllo.tipo === 'riapri' ? t('Riapri Myynd')
    : controllo.tipo === 'accedi-claude' ? t('Accedi di nuovo')
    : t('Apri Impostazioni')
  return <Hov as="button" type="button" onClick={premi} disabled={!!occupato} aria-busy={occupato ? true : undefined}
    style={{ ...STILE_BOTTONE, cursor: occupato ? 'wait' : 'pointer', opacity: occupato ? 0.75 : 1 }}
    hover={occupato ? {} : { color: 'var(--inchiostro)' }}>{occupato ?? etichetta}</Hov>
}
