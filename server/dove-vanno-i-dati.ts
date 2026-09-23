// Dove vanno i dati di chi collega, detto per questa installazione.
//
// La richiesta per l'amministratore ha una riga su cui chi la legge si ferma:
// dove finisce quello che Myynd legge. La prima versione diceva «solo i
// passaggi che servono vanno al modello, quando chiedo qualcosa», ed era
// falso: la prima pagina si prepara in sottofondo dopo ogni lettura
// (`priorita.forse` dentro `rileggiDaSola`, con `rifinitura.ts`), e così le
// automazioni e la preparazione discreta. Qui non si scrive una promessa: si
// guarda chi riceve davvero, adesso, su questa macchina.
//
//   · il modello che ragiona, lo stesso che sceglie `modello.motore()`: ChatGPT,
//     OpenAI con la chiave, un fornitore compatibile (e se sta su questa
//     macchina, nessuno lo riceve), Claude con la chiave o con l'account;
//   · Jev, se c'è la sua chiave: riceve pezzi dei documenti per giudicarli
//     (`giudizi.ts`, `rifinitura.ts`);
//   · ospitati, i dati stanno sul server, non sul computer di chi collega.

import { leggi } from './config.ts'
import * as modello from './modello.ts'
import * as jev from './jev.ts'
import { OSPITATO } from './ospitato.ts'

export type Destinatari = {
  /** I dati stanno sul server di chi ospita, non su questo computer. */
  ospitato: boolean
  /** Chi riceve i pezzi da ragionare; `null` se nessun modello è collegato. */
  modello: { chi: string; locale: boolean } | null
  /** Pezzi dei documenti vanno anche a TypeSafe, per i giudizi di Jev. */
  jev: boolean
}

/** Un indirizzo che resta su questa macchina. */
function inCasa(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return h === 'localhost' || h === '::1' || h === '0.0.0.0' || /^127\./.test(h)
  } catch { return false }
}

export function doveVanno(): Destinatari {
  const c = leggi()
  let chi: Destinatari['modello'] = null
  const m = modello.motore()
  if (m?.tipo === 'chatgpt') chi = { chi: 'OpenAI (ChatGPT)', locale: false }
  else if (m?.tipo === 'claude') chi = { chi: 'Anthropic (Claude)', locale: false }
  else if (m?.tipo === 'compatibile') {
    if (c.motore === 'openai') chi = { chi: 'OpenAI', locale: false }
    else {
      const url = c.compatibile?.url ?? ''
      let host = ''
      try { host = new URL(url).hostname } catch { /* resta vuoto */ }
      chi = { chi: host || c.compatibile?.nome || 'OpenAI-compatible', locale: inCasa(url) }
    }
  }
  // l'account Claude, quando lavora lui: `motore()` non lo conta, `collegato()` sì
  else if (modello.soloAbbonamento()) chi = { chi: 'Anthropic (Claude)', locale: false }
  return { ospitato: OSPITATO, modello: chi, jev: !!jev.chiave() }
}
