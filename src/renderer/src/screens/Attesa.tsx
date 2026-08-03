/**
 * lavoro in attesa — l'elenco (senza id) e l'approvazione di una singola
 * proposta (con id). `modifica` rende `.draft__body` editabile in linea:
 * è il corpo di una mail, quindi `invio` inserisce solo una riga vuota e
 * non innesca mai un'azione. Mentre si modifica, `salva` esce dalla
 * modifica tenendo il testo modificato (senza inviare nulla) e `annulla`
 * (bottone o `esc`, da qualunque punto dello schermo abbia il focus) esce
 * scartandolo. Inviare resta un secondo gesto separato e deliberato: si
 * preme `invia` sul corpo (eventualmente modificato) già salvato. `invia`
 * e `ignora` usano sempre la lista che la chiamata restituisce, mai un
 * nuovo `getProposals`.
 *
 * Il corpo salvato con "salva" vive in `lib/modificaBozza.ts`, non in
 * stato locale: questo componente smonta ogni volta che si naviga altrove,
 * e "salva" (a differenza di "invia") invita esattamente a farlo — guardare
 * un'altra schermata e tornare non deve far sparire la modifica.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Proposal } from '@shared/types'
import { api } from '../lib/api'
import { estraiTesto } from '../lib/markers'
import {
  impostaCorpoModificato,
  leggiCorpoModificato,
  registraAnnullaBozza,
  rimuoviCorpoModificato,
} from '../lib/modificaBozza'
import { BUDGET_DASHBOARD_PRONTA, inPreparazione } from '../lib/preparazione'
import { pollUntilReady } from '../lib/pollUntilReady'
import { Testo } from '../components/Testo'
import type { Vista } from '../App'

interface AttesaProps {
  id?: string
  onNavigate: (v: Vista) => void
  onProposteAggiornate: (lista: Proposal[]) => void
}

function formattaOra(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function formattaQuando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export function Attesa({ id, onNavigate, onProposteAggiornate }: AttesaProps) {
  const [proposte, setProposte] = useState<Proposal[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [preparazione, setPreparazione] = useState(false)
  const [azioneFallita, setAzioneFallita] = useState(false)
  const corpoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // il conteggio non basta a distinguere "niente in attesa" da "le bozze
    // si stanno rigenerando" (dopo un cambiamento nel corpus può restare
    // vuoto per 40-90s): senza continuare a chiedere finché `preparing` non
    // torna falso, questa lista direbbe la stessa bugia calma della
    // dashboard e del rail, e non si correggerebbe mai da sola.
    return pollUntilReady(
      async () => {
        const [lista, dashboard] = await Promise.all([api.getProposals(), api.getDashboard()])
        return { lista, dashboard }
      },
      ({ dashboard }) => !inPreparazione(dashboard),
      ({ lista, dashboard }) => {
        setProposte(lista)
        setPreparazione(inPreparazione(dashboard))
      },
      BUDGET_DASHBOARD_PRONTA,
    )
  }, [])

  useEffect(() => {
    setEditing(false)
    setAzioneFallita(false)
  }, [id])

  const attiva = id ? (proposte?.find((p) => p.id === id) ?? null) : null

  useEffect(() => {
    if (id && proposte && !attiva) {
      // id sconosciuto (dato stantio): si torna all'elenco invece di
      // mostrare una schermata vuota senza spiegazione.
      onNavigate({ s: 'attesa' })
    }
  }, [id, proposte, attiva, onNavigate])

  useEffect(() => {
    if (editing && corpoRef.current) {
      const el = corpoRef.current
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [editing])

  const agisci = useCallback(
    async (azione: 'invia' | 'ignora', editedBody?: string) => {
      if (!attiva) return
      setInCorso(true)
      setAzioneFallita(false)
      try {
        const aggiornati = await api.actOnProposal(attiva.id, azione, editedBody)
        setEditing(false)
        // fatto: non serve più tenere una bozza salvata per questo id in giro.
        rimuoviCorpoModificato(attiva.id)
        setProposte(aggiornati)
        onProposteAggiornate(aggiornati)
        onNavigate({ s: 'attesa' })
      } catch {
        // senza questo, un rifiuto di `actOnProposal` lascerebbe `inCorso`
        // vero per sempre: tutti e tre i bottoni disabilitati, senza una
        // riga che lo dica. Si riaccendono e si dice cos'è successo.
        setAzioneFallita(true)
      } finally {
        setInCorso(false)
      }
    },
    [attiva, onNavigate, onProposteAggiornate],
  )

  // esce dalla modifica tenendo il testo modificato. Non invia nulla: il
  // corpo salvato resta in attesa di un secondo gesto, deliberato, su
  // "invia". Vive in `lib/modificaBozza.ts`, non in stato locale: deve
  // sopravvivere anche se si naviga altrove e si torna.
  const salvaBozza = useCallback(() => {
    if (!corpoRef.current || !attiva) return
    const testoModificato = estraiTesto(corpoRef.current).trim()
    impostaCorpoModificato(attiva.id, testoModificato)
    setEditing(false)
  }, [attiva])

  // esce dalla modifica scartando quanto digitato in questa sessione; il
  // corpo (originale o l'ultima bozza salvata con "salva") resta invariato.
  const annullaBozza = useCallback(() => {
    setEditing(false)
  }, [])

  // registra chi può annullare la modifica in corso adesso (o nessuno, se
  // non si sta modificando): serve al gestore globale di `esc` in
  // `App.tsx`, che altrimenti non avrebbe modo di saperlo quando il focus
  // non è dentro il testo editabile (es. sul bottone "salva" dopo un tab).
  useEffect(() => {
    registraAnnullaBozza(editing ? annullaBozza : null)
    return () => registraAnnullaBozza(null)
  }, [editing, annullaBozza])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        // è il corpo di una mail: deve poter contenere paragrafi. Invio
        // inserisce solo una riga vuota e non innesca mai un'azione.
        e.preventDefault()
        document.execCommand('insertText', false, '\n')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        // non deve risalire fino al gestore globale di App.tsx, che userebbe
        // lo stesso tasto per nascondere la finestra: qui annulla soltanto.
        e.stopPropagation()
        annullaBozza()
      }
    },
    [annullaBozza],
  )

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const testo = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, testo)
  }, [])

  if (proposte === null) return null

  if (!id) {
    return (
      <div className="screen">
        <h1 className="screen-title">lavoro in attesa</h1>

        {proposte.length === 0 ? (
          <div className="empty">
            {preparazione ? 'sto preparando il lavoro in attesa.' : 'niente in attesa.'}
          </div>
        ) : (
          <div className="waiting">
            {proposte.map((p) => {
              const fatta = p.status !== 'in_attesa'
              return (
                <button
                  key={p.id}
                  className={`waiting-item${fatta ? ' waiting-item--done' : ''}`}
                  onClick={() => onNavigate({ s: 'attesa', id: p.id })}
                >
                  <span className="dot-attesa" />
                  <span className="waiting-item__title">
                    <span className="waiting-item__who">{p.who.name}</span>
                    {p.title}
                  </span>
                  <span className="waiting-item__when">
                    {p.status === 'inviata' ? 'approvata' : p.status === 'ignorata' ? 'ignorata' : formattaOra(p.receivedAt)}
                  </span>
                  <span className="waiting-item__reason">{p.reason}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (!attiva) return null

  const inAttesa = attiva.status === 'in_attesa'
  const bodyEditato = leggiCorpoModificato(attiva.id)

  return (
    <div className="screen">
      <div className="approval">
        <p className="approval__reason">{attiva.reason}</p>

        <p className="draft__subject">{attiva.subject?.trim() || attiva.title}</p>
        <p className="draft__meta">
          {attiva.who.name} · {formattaQuando(attiva.receivedAt)}
        </p>

        <div
          key={editing ? 'modifica' : 'lettura'}
          ref={editing ? corpoRef : undefined}
          className="draft__body prose"
          contentEditable={editing ? true : undefined}
          suppressContentEditableWarning
          onKeyDown={editing ? handleKeyDown : undefined}
          onPaste={editing ? handlePaste : undefined}
        >
          <Testo testo={bodyEditato ?? attiva.body} sorgenti={attiva.sources} />
        </div>

        {editing && <p className="edit-hint">esc annulla</p>}

        {attiva.attachments.length > 0 && (
          <div className="attachments">
            <p className="attachments__label">allegati</p>
            {attiva.attachments.map((a) => (
              <div className="attachment" key={a.id}>
                <span className="attachment__name">{a.name}</span>
                <span className="attachment__reason">{a.reason}</span>
              </div>
            ))}
          </div>
        )}

        {inAttesa && editing && (
          <div className="actions">
            <button className="btn btn--quiet" disabled={inCorso} onClick={salvaBozza}>
              salva
            </button>
            <button className="btn btn--quiet" disabled={inCorso} onClick={annullaBozza}>
              annulla
            </button>
          </div>
        )}

        {inAttesa && !editing && (
          <div className="actions">
            <button
              className="btn btn--primary"
              disabled={inCorso}
              onClick={() => void agisci('invia', bodyEditato ?? undefined)}
            >
              invia
            </button>
            <button className="btn btn--quiet" disabled={inCorso} onClick={() => setEditing(true)}>
              modifica
            </button>
            <button className="btn btn--quiet" disabled={inCorso} onClick={() => void agisci('ignora')}>
              ignora
            </button>
          </div>
        )}

        {azioneFallita && <p className="quiet small">non è riuscito.</p>}

        {!inAttesa && (
          <p className="quiet small">{attiva.status === 'inviata' ? 'approvata' : 'ignorata'}</p>
        )}
      </div>
    </div>
  )
}
