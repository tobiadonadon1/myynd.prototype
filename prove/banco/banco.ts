// Il banco della qualità: un cliente inventato, i suoi lavori fatti da Myynd
// col modello vero, e un giudice a parte che per ognuno risponde a una domanda:
// lo manderebbe (o lo userebbe) così com'è?
//
//   CLIENTE=alex MYYND_DATI=$(mktemp -d) node --disable-warning=ExperimentalWarning prove/banco/banco.ts . /percorso/uscita.json
//
// Mai ~/.myynd e mai la Scrivania: i file consegnati vanno nella cartella temporanea.
// Il motore è quello della configurazione qui sotto (di serie l'account Claude di chi lancia).

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [repo, uscita] = process.argv.slice(2)
const DATI = process.env.MYYND_DATI ?? ''
if (!DATI || DATI.includes('.myynd')) throw new Error('MYYND_DATI must be a throwaway folder')
const R = resolve(repo)
const S = join(R, 'server')
const { CLIENTI } = await import(join(R, 'prove/banco/clienti.mjs'))
const cliente = CLIENTI[process.env.CLIENTE ?? 'alex']
if (!cliente) throw new Error('CLIENTE unknown')
const cfg = await import(join(S, 'config.ts'))
const store = await import(join(S, 'store.ts'))
const compiti = await import(join(S, 'compiti.ts'))
const mani = await import(join(S, 'mani.ts'))
const mod = await import(join(S, 'modello.ts'))
const { daBuffer } = await import(join(S, 'connettori/estrai.ts'))

const scrivania = join(DATI, 'Desktop')
mkdirSync(scrivania, { recursive: true })
mani.perProva({ scrivania: () => scrivania, scaricati: () => join(DATI, 'Downloads'), documenti: () => join(DATI, 'Documents'), ospitato: () => false } as never)
cfg.scrivi({
  ...cliente.config, onboarding: true, giro: true, autonomia: 'preparare',
  claudeCon: 'abbonamento', abbonamento: { attivo: true }, motore: 'claude',
  modelli: { casa: 'claude-haiku-5-5', media: 'claude-sonnet-5-5', frontiera: 'claude-sonnet-5-5' }
} as never)
store.salvaDocumenti(cliente.docs)
cliente.voce.forEach((t: string, i: number) => store.salvaMessaggio({ id: `voce-${i}`, chat: 'banco', ruolo: 'u', testo: t }))

const soloLavoro = (r: string) => r.split('\n\n').slice(1, -1).join('\n\n').trim() || r

// — il giudice —

const FORMA = {
  type: 'object',
  properties: {
    punteggio: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '5: mandabile così com\'è; 4: un ritocco piccolo; 3: da sistemare in più punti; 2: da rifare in buona parte; 1: sbagliato o pericoloso.' },
    mandabile: { type: 'boolean', description: 'Il cliente lo manderebbe o lo userebbe così com\'è, al massimo riempiendo un segnaposto dichiarato?' },
    problemi: { type: 'array', items: { type: 'string' }, description: 'I difetti precisi, uno per riga, con la frase che non va. Vuoto se non ce ne sono.' },
    categorie: { type: 'array', items: { type: 'string', enum: ['fatto_inventato', 'incompleto', 'voce_da_modello', 'tono', 'troppo_lungo', 'lingua', 'rischio', 'segnaposti_di_troppo', 'non_e_il_lavoro', 'altro'] } }
  },
  required: ['punteggio', 'mandabile', 'problemi', 'categorie'],
  additionalProperties: false
}

async function giudica(lavoro: { testo: string; tipo: string }, risultato: string, file: string): Promise<unknown> {
  const fonti = cliente.docs.map((d: { id: string; titolo: string; corpo: string; autore?: string }) => `[${d.id}] ${d.titolo}${d.autore ? ` (da ${d.autore})` : ''}\n${d.corpo}`).join('\n\n')
  const system = `Sei un giudice esigente e indipendente. Un assistente ha fatto un lavoro per un cliente. Decidi se il cliente lo manderebbe o lo userebbe così com'è.
Chi è il cliente: ${cliente.profilo}
Come scrive davvero (parole sue, solo per lo stile):
${cliente.voce.map((v: string) => `- ${v}`).join('\n')}

Controlla: ogni fatto (nome, cifra, data, impegno) sta nelle fonti o nel compito, altrimenti è inventato; fa tutto il lavoro chiesto e solo quello; suona come il cliente e non come un modello (niente enfasi, niente frasi di circostanza, niente struttura da modulo in una mail); lunghezza giusta; lingua giusta per chi riceve; nessun rischio (per esempio cambiare un IBAN senza verificarlo, promettere quello che non si può). Un segnaposto dichiarato per un dato che davvero manca va bene; segnaposti al posto di cose che si potevano sapere no. Una scelta che spetta solo al cliente (approvare, scegliere fra opzioni che gli chiedono, spendere, fissare un orario senza vedere la sua agenda) lasciata aperta in un segnaposto chiaro è corretta; decidere al suo posto è un difetto.
La prima riga («Done:/Fatto:») e la riga finale per il cliente non fanno parte del lavoro: giudica quello che sta in mezzo. Scrivi i problemi in italiano, corti.`
  const content = `Il compito (${lavoro.tipo}): ${lavoro.testo}\n\nIl lavoro consegnato:\n<<<\n${soloLavoro(risultato)}\n>>>${file ? `\n\nIl file consegnato:\n<<<\n${file.slice(0, 8000)}\n>>>` : ''}\n\nLe fonti del cliente:\n${fonti}`
  return mod.chiediJSON({ lavoro: 'verifica', max_tokens: 1200, system, formato: FORMA, messages: [{ role: 'user', content }] })
}

// — i lavori —

const esiti: unknown[] = []
const visti = new Set<string>()
for (const [i, l] of (cliente.lavori as { testo: string; doc?: string; tipo: string }[]).entries()) {
  const id = `banco-${i}`
  store.scriviCompito({ id, testo: l.testo, doc: l.doc ?? null, quando: 'oggi', ordine: `b${String(i).padStart(2, '0')}` } as never)
  const t = Date.now()
  compiti.affida(id, 'bozza', false)
  let c = store.compito(id)
  while (Date.now() - t < 8 * 60_000) {
    await new Promise(r => setTimeout(r, 2500))
    c = store.compito(id)
    if (c && c.stato !== 'delegato') break
  }
  let file = ''
  // il file della consegna, o quello scritto dal modello con `scrivi_file`: l'ultimo nuovo sulla Scrivania temporanea
  const nuovi = readdirSync(scrivania, { recursive: true }).map(String).map(f => join(scrivania, f))
    .filter(f => statSync(f).isFile() && statSync(f).mtimeMs >= t && !visti.has(f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  nuovi.forEach(f => visti.add(f))
  const percorso = c?.consegna?.percorso && existsSync(c.consegna.percorso) ? c.consegna.percorso : nuovi[0]
  if (percorso) { try { file = await daBuffer(readFileSync(percorso), percorso) } catch { /* senza file */ } }
  const cercato = (c?.diario ?? []).filter((d: { tipo: string }) => d.tipo === 'cerco').map((d: { dettaglio?: string }) => d.dettaglio ?? '')
  const giudizio = c?.risultato ? await giudica(l, c.risultato, file).catch(e => ({ errore: String(e) })) : null
  const esito = { i, ...l, file_nuovi: nuovi.length, secondi: Math.round((Date.now() - t) / 1000), stato: c?.stato, risultato: c?.risultato, file: file.slice(0, 4000), revisione: c?.revisione, cercato, giudizio, guaio: c?.guaio }
  esiti.push(esito)
  const g = giudizio as { punteggio?: number; mandabile?: boolean } | null
  console.log(`BANCO ${process.env.CLIENTE} ${i} · ${c?.stato} · ${esito.secondi}s · voto ${g?.punteggio ?? '-'}${g?.mandabile ? ' · mandabile' : ''} · ${l.testo}`)
}
writeFileSync(uscita, JSON.stringify({ cliente: process.env.CLIENTE, quando: new Date().toISOString(), esiti }, null, 1))
console.log('fatto', uscita)
process.exit(0)
