// La prova del canale dell'osservatore, dal guscio al server e ritorno.
//
//   node_modules/.bin/electron prove/osservatore-guscio.cjs           → contro il finto server
//   node_modules/.bin/electron prove/osservatore-guscio.cjs --vero    → contro server/index.ts
//
// Un main di Electron nascosto (niente finestre, niente Dock, dati in una
// cartella temporanea, un cane da guardia di 120 secondi) che usa i moduli
// veri del guscio — `desktop/server.ts` e `desktop/osservatore.ts` — con una
// fonte finta al posto di quella che guarderebbe il Mac: una giornata scritta
// qui sotto (Safari, due minuti fermi, Chrome in incognito, 1Password, Code),
// poi la pausa e la ripresa, poi l'uscita. Nessuna fonte vera parte, nessun
// permesso viene chiesto, il Mac di chi la lancia non è guardato.
//
// Contro il finto server (`finto-server-osservatore.mjs`) si leggono i
// messaggi che lui ha ricevuto; con `--vero` il server è quello vero, su dati
// temporanei, con un conto inventato che accende l'osservatore da
// `POST /api/osservatore`, e alla fine si guardano le righe di `sessioni_app`.
// Stampa `ok` o i guasti, ed esce.

const { app } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const VERO = process.argv.includes('--vero')
const RADICE = path.join(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'myynd-osservatore-'))
const REGISTRO = path.join(TMP, 'registro.jsonl')

setTimeout(() => { console.error('osservatore-guscio · 120 s passati: esco'); pulisci(); app.exit(1) }, 120_000).unref()
if (app.dock) app.dock.hide()
app.setPath('userData', path.join(TMP, 'electron'))
// il server chiede il PATH alla shell di login della persona: qui no
process.env.SHELL = '/usr/bin/true'
process.env.REGISTRO = REGISTRO
if (VERO) {
  fs.mkdirSync(path.join(TMP, 'dati'), { recursive: true })
  fs.mkdirSync(path.join(TMP, 'casa'), { recursive: true })
  process.env.MYYND_DATI = path.join(TMP, 'dati')
  process.env.HOME = path.join(TMP, 'casa')
}

function pulisci() {
  if (process.env.TIENI) { console.log(`osservatore-guscio · dati in ${TMP}`); return }
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch { /* pazienza */ }
}

const pausa = ms => new Promise(r => setTimeout(r, ms))
async function aspetta(cosa, ms, ogni = 25) {
  const fine = Date.now() + ms
  while (Date.now() < fine) { const v = cosa(); if (v) return v; await pausa(ogni) }
  return null
}

const guasti = []
const verifica = (ok, frase) => { if (!ok) guasti.push(frase); console.log(`${ok ? '✓' : '✗'} ${frase}`) }

// su un guasto a metà il server va fermato prima di buttare i suoi dati
let fermaServer = async () => {}
app.whenReady().then(principale).catch(async e => {
  console.error(e)
  try { await fermaServer() } catch { /* pazienza */ }
  process.exitCode = 1
  app.quit()
})
// si butta tutto a `quit`: dopo, Chromium non scrive più nella cartella dei dati
app.on('quit', pulisci)

async function principale() {
  const importa = p => import(pathToFileURL(path.join(RADICE, p)).href)
  const server = await importa('desktop/server.ts')
  fermaServer = () => server.ferma()
  const impostazioni = await importa('desktop/impostazioni.ts')
  const oss = await importa('desktop/osservatore.ts')
  impostazioni.apri(path.join(TMP, 'electron'))
  server.apriRegistro(TMP)

  // — il registro visto dal guscio: quello che parte e quello che torna —
  const lato = []
  const segna = (dir, m) => lato.push({ dir, t: Date.now(), m: JSON.parse(JSON.stringify(m)) })
  const manda = m => { const ok = server.manda(m); if (ok) segna('dentro', m); return ok }

  // — la fonte finta e l'orologio della giornata —
  let V = Date.now() - 8 * 60_000
  let inattivo = 0
  const fonti = []
  const prodotte = []   // le sessioni che la giornata deve produrre, per contare le perse
  const cambi = []
  let stati = 0
  oss.avvia({
    manda,
    creaFonte: o => {
      const f = { o, tipo: 'aiutante', fermata: false, chiedi() {}, ferma() { f.fermata = true } }
      fonti.push(f)
      return f
    },
    inattivoSecondi: () => inattivo,
    permesso: () => true,
    adesso: () => V,
    mioPid: process.pid,
    piattaforma: 'darwin',
    suCambio: s => cambi.push({ t: performance.now(), s }),
    registra: r => server.scriviRegistro(r),
    ritmi: { inattivita: 40, invio: 150 }
  })

  let porta = null
  const ascolto = {
    suPorta: p => { porta = p; oss.nuovoServer() },
    suMorte: righe => { console.error('osservatore-guscio · il server è morto:\n' + righe.join('\n')) },
    suOsservatore: m => { stati++; segna('fuori', m); oss.daServer(m) }
  }
  const script = VERO ? undefined : path.join(__dirname, 'finto-server-osservatore.mjs')
  await server.avvia(ascolto, script ? { script } : {})
  verifica(!!(await aspetta(() => porta !== null, VERO ? 60_000 : 15_000)), 'il server dice la porta')
  verifica(!!(await aspetta(() => stati > 0, 10_000)), 'il server risponde a osservatore-chiedi')

  let token = null
  if (VERO) {
    const base = `http://127.0.0.1:${porta}`
    const chiedi = async (via, corpo) => {
      const r = await fetch(base + via, {
        method: 'POST', body: JSON.stringify(corpo),
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(`${via}: HTTP ${r.status} ${j.errore ?? ''}`)
      return j
    }
    const conto = await chiedi('/api/auth/registra', { email: 'prova-osservatore@myynd.local', password: 'una-password-lunga-di-prova', lingua: 'it' })
    token = conto.token
    verifica(!!token, 'un conto inventato entra')
    await chiedi('/api/osservatore', { acceso: true, titoli: true })
  }
  verifica(!!(await aspetta(() => fonti.length === 1, 10_000)), 'la fonte parte solo dopo acceso: true')

  // — la giornata —
  const f = () => fonti.at(-1)
  const emetti = (bundle, app, titolo, pid = 500) => f().o.suEvento({ bundle, app, pid, titolo, t: V })
  const avanti = async s => { V += s * 1000; await pausa(60) }
  emetti('com.apple.Safari', 'Safari', 'Northwind pricing - Google Docs')
  await avanti(60)
  inattivo = 180; await avanti(180); await pausa(120)       // due minuti fermi, anzi tre
  inattivo = 0; await avanti(1); await pausa(120)
  await avanti(40)
  prodotte.push(['Safari', 'Northwind pricing - Google Docs', 60], ['Safari', 'Northwind pricing - Google Docs', 40])
  emetti('com.google.Chrome', 'Google Chrome', 'New Tab - Google Chrome (Incognito)')
  await avanti(30)
  prodotte.push(['Google Chrome', null, 30])
  emetti('com.1password.1password', '1Password', 'Vault')
  await avanti(20)
  emetti('com.microsoft.VSCode', 'Code', 'index.ts')
  await avanti(50)
  prodotte.push(['Code', 'index.ts', 50])
  // la persona passa a Myynd: la sua finestra non esiste, e chiude Code lì
  emetti('com.myynd.app', 'Myynd', 'Oggi', process.pid)
  await avanti(5)

  // — la pausa, sull'orologio vero, e la ripresa —
  V = Date.now()
  const prima = stati
  const t0 = performance.now()
  oss.pausa(60)
  const subito = cambi.find(c => c.t >= t0 && c.s.guarda === false)
  const ottimista = subito ? subito.t - t0 : Infinity
  const confermata = await aspetta(() => stati > prima, 2_000, 5)
  const conferma = performance.now() - t0
  verifica(ottimista < 50, `la pausa cambia subito (${ottimista.toFixed(1)} ms)`)
  verifica(!!confermata && conferma < 1000, `il server la conferma (${conferma.toFixed(0)} ms)`)
  verifica(f().fermata === true, 'in pausa la fonte è ferma')
  await pausa(5_300)
  V = Date.now()
  verifica(oss.stato().guarda === false && oss.stato().pausaFino !== null, 'dopo cinque secondi la pausa resta: è confermata')
  const primaR = stati
  oss.riprendi()
  verifica(!!(await aspetta(() => stati > primaR, 2_000, 5)), 'il server conferma la ripresa')
  verifica(!!(await aspetta(() => fonti.length === 2, 2_000)), 'la fonte riparte')
  V = Date.now()
  emetti('com.microsoft.VSCode', 'Code', 'index.ts')
  await pausa(11_000)
  V = Date.now()
  prodotte.push(['Code', 'index.ts', 11])

  // — l'uscita: prima l'osservatore, poi il server —
  const t1 = performance.now()
  await oss.ferma()
  const uscita = performance.now() - t1
  verifica(uscita < 1_600, `l'osservatore consegna e si ferma (${uscita.toFixed(0)} ms)`)
  await server.ferma()

  // — cosa è arrivato —
  let arrivati
  if (VERO) {
    arrivati = lato
  } else {
    arrivati = fs.readFileSync(REGISTRO, 'utf8').trim().split('\n').map(r => JSON.parse(r))
  }
  const dentro = arrivati.filter(r => r.dir === 'dentro')
  verifica(dentro[0]?.m?.tipo === 'osservatore-chiedi', 'il primo messaggio è osservatore-chiedi')
  const primoStato = arrivati.findIndex(r => r.dir === 'fuori' && r.m?.tipo === 'osservatore-stato')
  const primaSessione = arrivati.findIndex(r => r.dir === 'dentro' && r.m?.tipo === 'osservatore')
  verifica(primoStato >= 0 && primaSessione > primoStato, 'nessuna sessione prima del primo stato')
  const tipi = new Set(dentro.map(r => r.m?.tipo))
  verifica([...tipi].every(t => ['osservatore', 'osservatore-chiedi', 'osservatore-pausa', 'osservatore-riprendi'].includes(t)),
    `solo i messaggi del contratto (${[...tipi].join(', ')})`)
  const sessioni = dentro.filter(r => r.m?.tipo === 'osservatore').flatMap(r => r.m.sessioni)
  const viste = sessioni.map(s => [s.app, s.titolo, s.secondi])
  console.log('   sessioni: ' + viste.map(v => v.join(' / ')).join(' | '))
  verifica(!sessioni.some(s => /1password/i.test(s.bundle) || s.titolo === 'Vault'), '1Password non compare mai')
  verifica(sessioni.some(s => s.app === 'Google Chrome' && s.titolo === null), 'il titolo in incognito è null')
  verifica(!sessioni.some(s => /incognito/i.test(s.titolo ?? '')), 'nessun titolo in incognito arriva')
  const safari = sessioni.filter(s => s.app === 'Safari').map(s => s.secondi)
  verifica(safari.length === 2 && safari[0] === 60 && safari[1] === 40, `i due minuti fermi spezzano Safari (${safari.join(', ')})`)
  const pausaI = dentro.findIndex(r => r.m?.tipo === 'osservatore-pausa')
  const riprendiI = dentro.findIndex(r => r.m?.tipo === 'osservatore-riprendi')
  verifica(pausaI >= 0 && riprendiI > pausaI, 'pausa e ripresa ci sono, in ordine')
  const perse = prodotte.filter(([a, t, sec]) => !sessioni.some(s => s.app === a && s.titolo === t && Math.abs(s.secondi - sec) <= 1))
  verifica(perse.length === 0, `nessuna sessione persa (${prodotte.length} prodotte, ${sessioni.length} arrivate)`)
  if (!VERO) {
    const fine = arrivati.findIndex(r => r.dir === 'fine')
    const ultima = arrivati.map(r => r.dir === 'dentro' && r.m?.tipo === 'osservatore').lastIndexOf(true)
    verifica(ultima >= 0 && (fine < 0 || ultima < fine), 'le ultime sessioni arrivano prima che il server si fermi')
  } else {
    const db = fs.readdirSync(path.join(TMP, 'dati', 'utenti')).map(u => path.join(TMP, 'dati', 'utenti', u, 'mente.db')).find(fs.existsSync)
    let righe = []
    try {
      righe = execFileSync('sqlite3', ['-json', db, 'select app, titolo, secondi from sessioni_app order by inizio'], { encoding: 'utf8' })
      righe = righe.trim() ? JSON.parse(righe) : []
    } catch (e) { console.error(e.message) }
    console.log('   righe: ' + righe.map(r => `${r.app} / ${r.titolo} / ${r.secondi}`).join(' | '))
    verifica(righe.length >= prodotte.length, `le sessioni sono in sessioni_app (${righe.length})`)
    verifica(!righe.some(r => /1password/i.test(r.app) || /incognito/i.test(r.titolo ?? '')), 'nel database niente 1Password e niente incognito')
  }

  console.log(guasti.length ? `guasti: ${guasti.length}` : 'ok')
  process.exitCode = guasti.length ? 1 : 0
  app.quit()
}
