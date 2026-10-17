// Il mandato proposto: Myynd lo deduce, lei lo conferma una volta.
//
// Niente modello: l'esito viene dal traguardo del quadro (`quadro.ts`) o
// dall'obiettivo del progetto, la misura da quello che l'esito dice
// (venduto, firmato, pubblicato, un utente vero), la revisione fra un mese.
// Le regole sono quelle di serie. Lo stato resta «proposto», e finché lo è
// Myynd prepara e basta.
//
// Una domanda sola, e una volta sola per progetto: «È questo l'obiettivo di
// X: …?», col meccanismo delle domande di sempre (`domande.ts`), solo se non
// ce n'è già un'altra aperta. Un sì conferma; un'altra frase diventa
// l'esito, e il mandato resta da confermare sulla pagina del progetto.

import * as store from './store.ts'
import * as mandato from './mandato.ts'
import type { Progetto } from './progetti.ts'
import { lingua } from './config.ts'
import { senzaTrattini } from './testo.ts'

export const TEMA = 'mandato:'

/** Fra quanti giorni si rivede un mandato proposto. */
export const GIORNI_ALLA_REVISIONE = 30

const MISURE: [RegExp, string, string][] = [
  [/\b(?:pag\w*|stripe|vend\w*|sold|sell\w*|sale[s]?|paid|pay\w*|revenue|ricav\w*|fattur\w*|abbonat\w*|subscri\w*|cliente pagante|paying)\b/i, 'Un pagamento arrivato (Stripe o bonifico)', 'A payment arrives (Stripe or bank transfer)'],
  [/\b(?:firm\w*|sign\w*|contratt\w*|contract\w*|accordo|deal|agreement)\b/i, 'Una risposta firmata', 'A signed reply'],
  [/\b(?:utent\w*|users?|iscritt\w*|sign[- ]?ups?|waitlist|lista d'attesa|tester\w*)\b/i, 'Un utente vero che si iscrive', 'A real user signs up'],
  [/\b(?:pubblic\w*|publish\w*|live|lanci\w*|launch\w*|online|rilasci\w*|release\w*|ship\w*|deploy\w*)\b/i, 'È online e si apre', 'It is live and opens'],
  [/\b(?:mand\w*|send\w*|sent|invi\w*|consegn\w*|deliver\w*)\b/i, 'Lei conferma che è partito', 'You confirm it went out']
]

/** Come si saprà che ci è arrivato, detto da quello che l'esito dice. */
export function misuraDa(esito: string, l: 'it' | 'en' = lingua()): string {
  const m = MISURE.find(([re]) => re.test(esito))
  if (m) return l === 'en' ? m[2] : m[1]
  return l === 'en' ? 'You confirm it is done' : 'Lo confermi tu'
}

function piu(giorni: number, adesso = new Date()): string {
  const d = new Date(adesso.getTime() + giorni * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Il mandato che Myynd propone per questo progetto, senza scriverlo. */
export function dedotto(p: Pick<Progetto, 'id' | 'obiettivo'>, o: { traguardo?: string | null; adesso?: Date } = {}): mandato.Mandato {
  const esito = senzaTrattini(String(o.traguardo || p.obiettivo || '').replace(/\s+/g, ' ').trim()).slice(0, 200)
  return {
    ...mandato.diSerie(p.id),
    esito, misura: esito ? misuraDa(esito) : '', revisione: piu(GIORNI_ALLA_REVISIONE, o.adesso),
    origine: 'dedotto'
  }
}

/** Scrive la proposta se il progetto non ha ancora un mandato. Mai sopra uno che c'è. */
export function scriviProposta(p: Pick<Progetto, 'id' | 'obiettivo'>, o: { traguardo?: string | null; adesso?: Date } = {}): mandato.Mandato {
  const c = mandato.scritto(p.id)
  if (c) return c
  const d = dedotto(p, o)
  return mandato.salva(p.id, { esito: d.esito, misura: d.misura, revisione: d.revisione }, { origine: 'dedotto' })
}

/** La domanda, come la si legge. */
export function testoDellaDomanda(nome: string, esito: string, l: 'it' | 'en' = lingua()): string {
  const e = esito.replace(/[.?!]+$/, '')
  return l === 'en' ? `Is this the goal for ${nome}: ${e}?` : `È questo l'obiettivo di ${nome}: ${e}?`
}

/**
 * Propone il mandato, e al più una domanda per confermarlo: una volta sola
 * per progetto (il tema è unico), e solo se non c'è un'altra domanda aperta.
 * Torna la domanda aperta, o null. Non lancia mai.
 */
export function proponi(p: Pick<Progetto, 'id' | 'nome' | 'obiettivo' | 'stato'>, o: { traguardo?: string | null; adesso?: Date } = {}): store.Domanda | null {
  try {
    if (p.stato !== 'attivo') return null
    const m = scriviProposta(p, o)
    if (m.stato !== 'proposto' || !m.esito) return null
    const tema = TEMA + p.id
    if (store.domandaGiaFatta(tema) || store.domandaAperta()) return null
    return store.apriDomanda({ tema, testo: testoDellaDomanda(p.nome, m.esito), spunto: [], progetto: p.id })
  } catch (e) {
    console.warn('myynd · mandato · la proposta non è partita:', e instanceof Error ? e.message : e)
    return null
  }
}

// la fine della parola a mano: con «sì» \b non vede il confine dopo la «ì»
const SI = /^\s*(?:s[iì]|yes|yep|yeah|ok(?:ay)?|sure|certo|va bene|esatto|giusto|right|correct|exactly|confermo|confirm\w*|d'accordo|perfetto)(?=$|[\s,.!;:])/i
const NO = /^\s*(?:no|nope|non|not really|sbagliato|wrong)\b[\s,.!]*$/i

/**
 * La risposta alla domanda. Un sì conferma il mandato. Un no secco lo lascia
 * proposto. Un'altra frase («no, è vendere i primi dieci») diventa l'esito,
 * con la misura che ne segue, e il mandato resta da confermare.
 * Torna la frase che dice cosa è cambiato.
 */
export function rispondi(tema: string, risposta: string, l: 'it' | 'en' = lingua()): string {
  const id = tema.slice(TEMA.length)
  const en = l === 'en'
  const m = mandato.scritto(id)
  if (!id || !m) return en ? 'Noted.' : 'Me lo sono segnato.'
  if (SI.test(risposta) && !/\b(?:ma|but|però)\b/i.test(risposta)) {
    mandato.salva(id, {}, { conferma: true, origine: 'lei' })
    return en ? 'Confirmed. I’ll take the low-risk steps toward it on my own.' : 'Confermato. I passi a basso rischio verso questo li faccio da solo.'
  }
  if (NO.test(risposta)) return en ? 'OK. Write the goal on the project page when you like.' : 'Va bene. Scrivi l’obiettivo nella pagina del progetto quando vuoi.'
  const esito = senzaTrattini(risposta.replace(/^\s*(?:no|nope|non)\b[\s,.:;!]*/i, '').replace(/\s+/g, ' ').trim()).slice(0, 200)
  if (!esito) return en ? 'Noted.' : 'Me lo sono segnato.'
  mandato.salva(id, { esito, misura: misuraDa(esito, l) }, { origine: 'lei' })
  return en ? 'Saved as the goal. Confirm the rest on the project page.' : 'Segnato come obiettivo. Il resto lo confermi nella pagina del progetto.'
}

/** Confermato dalla pagina: la domanda aperta su questo progetto non serve più. */
export function chiudiLaDomanda(progetto: string) {
  try {
    const d = store.domandaPerTema(TEMA + progetto)
    if (d && d.stato === 'aperta') store.chiudiDomanda(d.id, 'risposta', '', lingua() === 'en' ? 'Confirmed from the project page.' : 'Confermato dalla pagina del progetto.')
  } catch { /* la domanda è un di più */ }
}
