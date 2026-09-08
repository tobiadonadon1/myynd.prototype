import * as store from './store.ts'
import * as attrezzi from './attrezzi.ts'
import * as auto from './automazioni.ts'
import { leggi } from './config.ts'

/** Suggestions use local index evidence only. Opening the page never calls a model. */
type Modello = { id: string; pattern?: RegExp; fonti?: string[]; minimo?: number; it: string[]; en: string[] }
const MODELLI: Modello[] = [
  { id: 'invoices', pattern: /\b(invoice|fattura|fatture|billing)\b/i,
    it: ['Fatture sotto controllo', 'Estrai importo, fornitore e scadenza dalle nuove fatture.'],
    en: ['Invoices, taken care of', 'Extract the amount, supplier and due date from new invoices.'] },
  { id: 'meetings', pattern: /\b(meeting|riunione|riunioni|verbale|minutes)\b/i,
    it: ['Dalle riunioni ai prossimi passi', 'Raccogli decisioni, responsabili e prossimi passi dalle nuove note.'],
    en: ['Meetings into next steps', 'Collect decisions, owners and next steps from new meeting notes.'] },
  { id: 'proposals', pattern: /\b(proposal|quote|preventivo|preventivi|quotation)\b/i,
    it: ['Preventivi da seguire', 'Riepiloga i nuovi preventivi e prepara i prossimi passi, senza inventare risposte o scadenze.'],
    en: ['Keep proposals moving', 'Summarize new proposals and prepare next steps without inventing replies or deadlines.'] },
  { id: 'inbox', fonti: ['posta', 'google', 'microsoft'], minimo: 3,
    it: ['Le priorità della posta', 'Ogni mattina raccogli le richieste ancora aperte nelle nuove email, con mittente e prossimo passo. Ignora newsletter e notifiche automatiche.'],
    en: ['Inbox priorities', 'Each morning collect open requests from new emails, with sender and next step. Skip newsletters and automatic notifications.'] },
  { id: 'files', fonti: ['desktop', 'drive', 'notion', 'sharepoint', 'dropbox'], minimo: 5,
    it: ['Novità nei progetti', 'Riepiloga i nuovi documenti di lavoro: cambiamenti, scadenze e prossimi passi.'],
    en: ['Project updates', 'Summarize new work documents: changes, deadlines and next steps.'] }
]
export function rileva(docs: Pick<store.Documento, 'id' | 'titolo' | 'fonte'>[],
  catalogo: { nome: string; collegato: boolean }[], esistenti: Set<string>, inglese = true) {
  return MODELLI.flatMap(m => {
    const id = `mind-${m.id}`
    if (esistenti.has(id)) return []
    const prove = docs.filter(d => (m.fonti ? m.fonti.includes(d.fonte) : m.pattern!.test(d.titolo)) && catalogo.some(a =>
      a.collegato && attrezzi.esiste(a.nome) && attrezzi.fontiDi(a.nome).includes(d.fonte)))
    if (prove.length < (m.minimo ?? 2)) return []
    const suoi = catalogo.filter(a => a.collegato && attrezzi.esiste(a.nome) &&
      prove.some(d => attrezzi.fontiDi(a.nome as attrezzi.Nome).includes(d.fonte))).map(a => a.nome)
    const [nome, spiega] = inglese ? m.en : m.it
    return [{ id, nome, spiega, quanti: prove.length, esempi: prove.slice(0, 2).map(d => d.titolo), attrezzi: suoi }]
  }).slice(0, 3)
}
export function suggerimenti() {
  return rileva(store.recenti(200), attrezzi.catalogo(),
    new Set([...auto.ricette().map(a => a.id), ...store.automazioniTolte()]), leggi().lingua !== 'it')
}
export function adotta(id: string) {
  const esistente = auto.ricette().find(a => a.id === id)
  if (esistente && !store.automazioniTolte().has(id)) return esistente
  const suggerita = suggerimenti().find(a => a.id === id)
  const modello = MODELLI.find(m => `mind-${m.id}` === id)
  if (!suggerita || !modello) throw new Error('This suggestion is no longer available. Refresh and try again.')
  const a = auto.scrivi({
    id, nome: modello.it[0], spiega: modello.it[1], fai: modello.it[1],
    quando: { ogni: 'giorno', ora: 8 }, guarda: { soloNuovi: true, limite: 8 },
    attrezzi: suggerita.attrezzi, metti: { inLista: 'oggi', modo: 'bozza' },
    passi: [{ id: 'relevance', tipo: 'condizione', testo: leggi().lingua === 'it'
      ? `Continua solo se ci sono documenti pertinenti: ${modello.it[1]}`
      : `Continue only when relevant documents are present: ${modello.en[1]}` }],
    en: { nome: modello.en[0], spiega: modello.en[1], fai: modello.en[1] }
  })
  auto.accendi(id, false)
  return a
}
