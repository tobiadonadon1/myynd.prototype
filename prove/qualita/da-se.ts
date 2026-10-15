// Il lavoro da sé sul modello vero, su un fondatore inventato.
//
// Le idee per X e il copione di un video (`server/da-se.ts`) scritti dal
// modello vero, con i moduli veri, su dati inventati ma fatti come quelli
// veri: Alex Rivera, tre progetti (Northwind, Pagefold, Tidepool) col loro
// quadro, le cartelle di codice con i commit e il changelog, sedici post suoi
// con i numeri e una voce riconoscibile (minuscole, righe corte, ironia
// asciutta), il campione dell'archivio, il lavoro chiuso della settimana, e
// una mail riservata che non deve finire in nessun post. Il file non va sulla
// Scrivania: resta nella cartella di prova.
//
//   cd prove/qualita
//   MYYND_DATI=$(mktemp -d) node --disable-warning=ExperimentalWarning da-se.ts ../.. $PWD/da-se.json
//
// Il motore è l'account Claude di chi lancia, come per `bozze.ts`. Quattro
// chiamate (stesura e rilettura per le idee e per il copione), qualche centesimo.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [repo, uscita] = process.argv.slice(2)
if (!process.env.MYYND_DATI || process.env.MYYND_DATI.includes('.myynd')) throw new Error('MYYND_DATI must be a throwaway folder')
const S = join(repo!, 'server')
const cfg = await import(join(S, 'config.ts'))
const store = await import(join(S, 'store.ts'))
const progetti = await import(join(S, 'progetti.ts'))
const x = await import(join(S, 'connettori/x.ts'))
const archivio = await import(join(S, 'connettori/x-archivio.ts'))
const daSe = await import(join(S, 'da-se.ts'))
const mod = await import(join(S, 'modello.ts'))
const ordine = await import(join(S, 'ordine.ts'))

cfg.scrivi({
  nome: 'Alex Rivera', ruolo: 'Founder, Northwind Studio', lingua: 'en', onboarding: true, giro: true,
  claudeCon: 'abbonamento', abbonamento: { attivo: true }, motore: 'claude',
  modelli: { casa: 'claude-haiku-5-5', media: 'claude-sonnet-5-5', frontiera: 'claude-sonnet-5-5' },
  accesiDaSoli: ['conversazioni', 'x'], autonomia: 'preparare', fuso: 'Europe/Rome'
} as never)

const ORA = Date.now(), G = 86_400_000
const giorno = (d: number) => new Date(ORA - d * G).toISOString().slice(0, 10)

// — i suoi post: [testo, giorni fa, views, likes, reposts, replies, bookmarks] —
const POST: [string, number, number, number, number, number, number][] = [
  ['11 teams use northwind every day now.\n\nnot 11 signups. 11 teams who\'d notice if it broke.', 38, 24000, 412, 38, 61, 140],
  ['my rule for features: if i can\'t explain it in the changelog in one line, it doesn\'t ship.', 35, 15000, 288, 22, 40, 77],
  ['spent 3 days building a settings page.\n\ndeleted it this morning.\n\nnobody needed the settings. they needed the default to be right.', 32, 31000, 530, 61, 88, 190],
  ['small teams don\'t hate invoicing. they hate the 40 minutes of copy paste around it.', 29, 11000, 210, 15, 22, 50],
  ['pagefold waitlist hit 140 today. i have not written a single tweet about it.\n\npeople forward long docs to each other a lot, apparently.', 8, 9000, 180, 9, 30, 22],
  ['shipping on fridays because that\'s when i have the most courage.', 26, 5200, 95, 6, 14, 8],
  ['the bug report said "it just works now??" with two question marks. best review we\'ve had.', 23, 7400, 160, 7, 19, 12],
  ['northwind 2.3 is out. exports are 3x faster.\n\ni timed it with my phone like a caveman.', 20, 8100, 140, 11, 17, 9],
  ['every b2b tool eventually becomes a dashboard.\n\ni\'m trying very hard to make northwind become an email.', 18, 19000, 350, 40, 52, 120],
  ['i answer every support mail myself. it\'s 20 minutes a day and it\'s the best roadmap i have.', 16, 26000, 400, 33, 70, 160],
  ['tidepool issue 12 went out. 1,900 readers.\n\nstill written on sunday mornings, still by hand.', 3, 6000, 120, 5, 11, 10],
  ['pricing changes are scary until you realise 2 people out of 11 even noticed.', 14, 10000, 190, 12, 35, 30],
  ['today i said no to a feature a customer would pay for.\n\nit would have made northwind worse for the other 10.', 12, 14000, 260, 20, 58, 64],
  ['reply guy energy is just support with worse margins.', 10, 4100, 70, 4, 9, 3],
  ['if your onboarding needs a video, your onboarding is the video.', 9, 17000, 310, 45, 27, 110],
  ['late night commit messages are the most honest documentation i\'ve ever written.', 6, 7000, 140, 10, 12, 20]
]
store.salvaDocumenti(POST.map(([testo, giorni, v, l, r, ri, s], i) => x.documentoMio({
  postId: String(1850000000000000000n + BigInt(i)), testo, url: null, risposta: false,
  quando: new Date(ORA - giorni * G).toISOString(),
  numeri: { visualizzazioni: v, mipiace: l, repost: r, risposte: ri, segnalibri: s }
}, false)!))
// il campione dell'archivio: i post più ripresi di sempre, anche di prima di questi due mesi
store.salvaDocumenti(archivio.documentiVoce([
  ...POST.map(([testo, giorni, , l, r], i) => ({ postId: String(1850000000000000000n + BigInt(i)), testo, quando: new Date(ORA - giorni * G).toISOString(), risposta: false, mipiace: l, repost: r })),
  { postId: '1700000000000000001', testo: 'the best feature i shipped this year is a button i removed.', quando: '2025-11-02T09:00:00.000Z', risposta: false, mipiace: 1200, repost: 140 },
  { postId: '1700000000000000002', testo: 'nobody wants an invoicing tool.\n\neveryone wants to never think about invoices again.', quando: '2025-08-19T09:00:00.000Z', risposta: false, mipiace: 980, repost: 101 },
  { postId: '1700000000000000003', testo: 'year one: 0 customers, 400 commits.\nyear two: 11 customers, 200 commits.\n\nturns out the commits weren\'t the job.', quando: '2026-03-04T09:00:00.000Z', risposta: false, mipiace: 1500, repost: 210 }
], false, new Date(ORA).toISOString()))
// la mail riservata: nessun prompt di X o del video la deve vedere
store.salvaDocumenti([{ id: 'posta:INBOX:1', fonte: 'posta', tipo: 'email', titolo: 'Northwind renewal', corpo: 'Alex, Harbor signs the Northwind renewal at 38,000 USD. CONFIDENTIAL until the board meets.', autore: 'Nora Lind <nora@harbor.test>', percorso: null, quando: new Date(ORA - G).toISOString(), gruppo: 'posta' } as never])

// — i progetti, il loro quadro, le cartelle —
const nw = progetti.scrivi({ nome: 'Northwind', obiettivo: 'Grow Northwind to 50 paying teams' })
const pg = progetti.scrivi({ nome: 'Pagefold', obiettivo: 'Launch the Pagefold beta with 20 users' })
const tp = progetti.scrivi({ nome: 'Tidepool', obiettivo: 'Grow the Tidepool newsletter to 2,500 readers' })
progetti.cambia(nw.id, { priorita: 'alta' } as never)
const quadro = (p: { id: string; nome: string }, sintesi: string, stato: string, traguardo: string, blocco = '') =>
  ({ progetto: p.id, nome: p.nome, sintesi, stato, traguardo, blocco, mosse: [], quando: new Date().toISOString(), impronta: 'q', versione: 3, letto: { prova: 1 } })
writeFileSync(join(cfg.cartella(), 'quadri.json'), JSON.stringify({ quadri: {
  [nw.id]: quadro(nw, 'Northwind is an invoicing assistant for small teams: it reads supplier PDFs, finds the due date and drafts the reminder. 11 teams use it every day. Version 2.4, shipped on Tuesday, matches bank payments to open invoices and flags partial payments instead of guessing.', '2.4 shipped Tuesday. 11 teams use it daily. 3 teams asked for multi-currency.', '50 paying teams'),
  [pg.id]: quadro(pg, 'Pagefold turns long documents into one page summaries that keep the original headings. The waitlist page went live last week and has 140 sign ups. The beta invite is drafted, not sent.', 'Waitlist live with 140 sign ups. Invite drafted.', 'Beta with 20 users'),
  [tp.id]: quadro(tp, 'Tidepool is a weekly newsletter about running a software company alone. Issue 12, about the 20 minute support rule, went out on Sunday to 1,900 readers.', 'Issue 12 sent Sunday. 1,900 readers.', '2,500 readers')
} }))
const cartella = (nome: string, commit: [number, string][], appunti: string) => ({
  id: `lavoro:/casa/code/${nome}`, fonte: 'lavoro', tipo: 'cartella', gruppo: 'documenti', titolo: `Lavoro: ${nome}`, percorso: `/casa/code/${nome}`,
  quando: `${giorno(commit[0]![0])}T12:00:00.000Z`,
  corpo: [`Cartella di lavoro: ${nome} (/casa/code/${nome}). Ultima modifica: ${giorno(commit[0]![0])}.`,
    `Ultimi commit:\n${commit.map(([d, m]) => `${giorno(d)}  ${m}`).join('\n')}`, `Appunti: ${appunti}`].join('\n')
})
store.salvaDocumenti([
  cartella('northwind', [
    [1, 'reconciliation: flag partial payments instead of guessing'],
    [1, 'bank reconciliation: match payments to open invoices by amount and date'],
    [2, 'release 2.4'],
    [3, 'changelog for 2.4'],
    [5, 'fix: reminder drafts used the wrong due date for net-60 suppliers'],
    [6, 'exports: stream csv instead of building it in memory']
  ], 'CHANGELOG - 2.4: bank reconciliation. Payments from your bank feed are matched to open invoices; partial payments are flagged, never guessed. - 2.3: exports 3x faster. - 2.2: reminder drafts in your tone.'),
  cartella('pagefold', [[4, 'summaries keep the original headings'], [7, 'waitlist page live'], [8, 'beta invite email draft']], 'TODO - invite the first 20 from the waitlist - add PDF upload - stop summaries from dropping tables'),
  cartella('tidepool', [[3, 'issue 12: the 20 minute support rule']], 'Ideas for issue 13: why I deleted the settings page.')
] as never)
for (const [testo, p] of [['Ship Northwind 2.4 with bank reconciliation', nw.id], ['Write the 2.4 changelog', nw.id], ['Put the Pagefold waitlist page live', pg.id], ['Send Tidepool issue 12', tp.id]] as const) {
  const id = `fatta-${testo.length}`
  store.scriviCompito({ id, testo, progetto: p, ordine: ordine.fra(store.ultimoOrdine('oggi'), '') } as never)
  store.cambiaStatoCompito(id, 'fatto')
}

const CARTELLA = join(process.env.MYYND_DATI, 'consegne')
mkdirSync(CARTELLA, { recursive: true })
daSe.perProva({
  salva: (o: { titolo: string; testo: string }) => {
    const percorso = join(CARTELLA, `${o.titolo.replace(/[^\w ,.-]+/g, ' ').trim()}.md`)
    writeFileSync(percorso, o.testo)
    return { percorso, nome: percorso.split('/').pop()!, luogo: 'myynd' }
  }
})

const risultato: Record<string, unknown> = { quando: new Date().toISOString(), motore: mod.motoreDelLavoro()?.nome ?? null }
const nate = await daSe.giro(ORA, { pronto: () => true, pagina: () => false })
risultato.nate = nate
for (const id of nate) {
  const c = store.compito(id)!
  const t = Date.now()
  const e = await daSe.lavora(c).catch((err: Error) => ({ ritira: `ERRORE: ${err.message}`, consegna: null }))
  const testo = e.consegna ? readFileSync(e.consegna.percorso, 'utf8') : ''
  risultato[c.origine] = {
    secondi: Math.round((Date.now() - t) / 1000), ritira: (e as { ritira?: string }).ritira ?? null, testo,
    controlli: {
      senzaLineette: !/[—–]/.test(testo),
      senzaHashtag: !/(?:^|\s)#[A-Za-z]/m.test(testo.replace(/^#+ /gm, '')),
      senzaMailRiservata: !/38,000|Harbor|Nora|CONFIDENTIAL/i.test(testo),
      conFonti: /\*\*From:\*\*/.test(testo),
      // le frasi bandite contano in quello che lui pubblicherebbe, non nella riga «Why now» scritta per lui
      senzaBandite: !/excited to share|just shipped|here'?s why|no more|game changer|back to work|stay tuned|more soon|in your hands|not planned/i.test(testo.replace(/^\*\*Why now:\*\*.*$/gm, '').split('## Why now')[0]!)
    }
  }
  console.log(`\n=== ${c.origine} (${Math.round((Date.now() - t) / 1000)} s)\n${testo || (e as { ritira?: string }).ritira}`)
}
writeFileSync(uscita!, JSON.stringify(risultato, null, 1))
console.log('fatto', uscita)
process.exit(0)
