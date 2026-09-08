// La prova dell'app impacchettata.
//
// Non prova il codice: apre il binario che esce da electron-builder, come lo
// aprirebbe chi l'ha scaricato, si attacca a DevTools e guarda che le cose
// che il guscio promette ci siano davvero — la schermata d'avvio che lascia
// il posto all'app, la registrazione, una cartella letta fino in fondo con
// il PDF dentro, il ponte `window.myynd`, il registro, e nessun server
// lasciato in ascolto dopo la chiusura. È l'unico posto in cui si imposta
// MYYND_DATI: la cartella dei dati è temporanea, il `~/.myynd` di chi prova
// non si tocca.
//
//   npm run prova:app                    → dist-app/mac-arm64/Myynd.app
//   node prove/app.mjs <binario>         → un altro binario
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { attacca, pausa, trova } from './guida.mjs'

const BINARIO = resolve(process.argv[2] ?? 'dist-app/mac-arm64/Myynd.app/Contents/MacOS/Myynd')
const PORTA_CDP = 9333

// le chiavi che il contratto del ponte promette, e che il renderer usa
const CHIAVI = [
  'versione', 'piattaforma', 'scegliCartelle', 'scegliFile', 'apriFuori', 'mostraNelFinder', 'segnala',
  'lingua', 'scorciatoia', 'impostaScorciatoia', 'avvioAutomatico', 'impostaAvvioAutomatico',
  'aggiornamenti', 'naviga', 'notifica', 'dentroIlRichiamo', 'richiamo'
]
const CHIAVI_RICHIAMO = ['chiudi', 'apri', 'misura', 'mostrato']
const CHIAVI_AGGIORNAMENTI = ['attuale', 'controlla', 'installa', 'stato']

// — il registro della prova —
let guasti = 0
function segna(ok, frase, dettaglio = '') {
  if (!ok) guasti++
  console.log(`${ok ? '✓' : '✗'} ${frase}${dettaglio ? ` — ${dettaglio}` : ''}`)
  return ok
}

/** Aspetta che `cosa()` torni un valore vero, entro `ms`. Torna il valore, o null. */
async function aspetta(cosa, ms, ogni = 400) {
  const fine = Date.now() + ms
  while (Date.now() < fine) {
    try { const v = await cosa(); if (v) return v } catch { /* non ancora */ }
    await pausa(ogni)
  }
  return null
}

/**
 * Un PDF vero, scritto a mano: una pagina, una riga di testo, la tabella
 * degli scarti calcolata. pdf.js ricostruisce anche una xref sbagliata, ma
 * una giusta non costa niente e la prova non deve dipendere da quella
 * tolleranza.
 */
function pdfMinimo(testo) {
  const oggetti = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // il contenuto, sotto
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  const flusso = `BT /F1 18 Tf 24 90 Td (${testo.replace(/[()\\]/g, '\\$&')}) Tj ET`
  oggetti[3] = `<< /Length ${Buffer.byteLength(flusso)} >>\nstream\n${flusso}\nendstream`
  let corpo = '%PDF-1.4\n'
  const scarti = []
  oggetti.forEach((o, i) => {
    scarti.push(Buffer.byteLength(corpo))
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(corpo)
  corpo += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`
  for (const s of scarti) corpo += `${String(s).padStart(10, '0')} 00000 n \n`
  corpo += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return corpo
}

/** I processi in ascolto su una porta TCP (solo dove c'è `lsof`). */
function inAscolto(porta) {
  if (platform() === 'win32') return []
  try {
    return execFileSync('lsof', ['-nP', `-iTCP:${porta}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean)
  } catch { return [] }
}

/** Legge il flusso di `/api/sincronizza` fino alla fine, e torna l'ultimo messaggio. */
async function sincronizza(origine, token, fonte) {
  const r = await fetch(`${origine}/api/sincronizza?fonte=${fonte}`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(180_000)
  })
  if (!r.ok) throw new Error(`sincronizza: HTTP ${r.status}`)
  const lettore = r.body.getReader()
  const dec = new TextDecoder()
  let resto = ''
  for (;;) {
    const { done, value } = await lettore.read()
    if (done) break
    resto += dec.decode(value, { stream: true })
    const eventi = resto.split('\n\n')
    resto = eventi.pop() ?? ''
    for (const e of eventi) for (const riga of e.split('\n')) {
      if (!riga.startsWith('data: ')) continue
      const m = JSON.parse(riga.slice(6))
      if (m.fase === 'fine') return m
      if (m.fase === 'errore') throw new Error(m.errore)
    }
  }
  throw new Error('il flusso si è chiuso senza dire «fine»')
}

// — la prova —
if (!existsSync(BINARIO)) {
  segna(false, `il binario c'è`, BINARIO)
  process.exit(1)
}

const dati = mkdtempSync(join(tmpdir(), 'myynd-prova-dati-'))
const cartella = mkdtempSync(join(tmpdir(), 'myynd-prova-cartella-'))
writeFileSync(join(cartella, 'appunti.md'), '# Appunti della prova\n\nUna riga che si deve ritrovare nell’indice.\n')
writeFileSync(join(cartella, 'promemoria.txt'), 'Chiamare il commercialista giovedì alle dieci.\n')
writeFileSync(join(cartella, 'foglio.pdf'), pdfMinimo('Myynd: una prova in PDF'))

// Con MYYND_DATI impostata il guscio sposta anche il suo `userData` — registro,
// impostazioni, sessione — sotto `<MYYND_DATI>/app`, per la stessa ragione per
// cui i dati stanno in una cartella temporanea: quello vero non si tocca. Il
// registro che si legge è quindi questo, e nasce con la prova: niente di
// vecchio da saltare.
const registro = join(dati, 'app', 'myynd.log')

const env = { ...process.env, MYYND_DATI: dati }
// mai nel pacchetto, e non deve arrivarci nemmeno dall'ambiente di chi prova
delete env.MYYND_DEV
delete env.ELECTRON_RUN_AS_NODE
delete env.MYYND_PORT

let uscita = ''
const app = spawn(BINARIO, [`--remote-debugging-port=${PORTA_CDP}`], { env, stdio: ['ignore', 'pipe', 'pipe'] })
app.stdout.on('data', d => { uscita += d })
app.stderr.on('data', d => { uscita += d })
let uscito = null
app.on('exit', (codice, segnale) => { uscito = { codice, segnale } })

let pagina = null
let portaServer = null
try {
  pagina = await attacca(PORTA_CDP, /./)
  segna(true, 'l’app parte e DevTools risponde')

  // la schermata d'avvio (un data: URL) lascia il posto all'app dal server locale
  const origine = await aspetta(async () => {
    const o = await pagina.valuta('return location.origin')
    return /^http:\/\/127\.0\.0\.1:\d+$/.test(o) ? o : null
  }, 60_000)
  segna(!!origine, 'la schermata d’avvio lascia il posto all’app', origine ?? 'la finestra è rimasta sulla schermata d’avvio')
  if (!origine) throw new Error('senza l’app non si va avanti')
  portaServer = Number(new URL(origine).port)

  // la registrazione, in inglese
  const testoAccesso = await aspetta(async () => {
    const t = await pagina.testo()
    return t.includes('Create an account') && t.includes('Sign in') ? t : null
  }, 30_000)
  segna(!!testoAccesso, 'la schermata d’accesso è in inglese',
    testoAccesso ? '' : `visto: ${(await pagina.testo()).split('\n').filter(Boolean).slice(0, 4).join(' / ')}`)
  segna(!(testoAccesso ?? '').includes('Accedi'), 'nessuna frase italiana nella schermata d’accesso')
  await pagina.ascoltaGuai()

  const scheda = trova(await pagina.cliccabili(), 'Create an account')
  if (!scheda) throw new Error('non trovo la scheda «Create an account»')
  await pagina.clic(scheda.x, scheda.y)
  await pausa(400)
  const campi = await pagina.valuta(`
    return [...document.querySelectorAll('input')].filter(e => e.type !== 'file' && e.type !== 'checkbox')
      .map(e => { const r = e.getBoundingClientRect(); return { tipo: e.type, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })
      .filter(c => c.x && c.y)`)
  // due caselle, email e password: la ripetizione c'è solo quando si sceglie
  // una password nuova, non quando si crea il conto
  segna(campi.length === 2, 'la scheda «crea» ha email e password', `${campi.length} campi`)
  const email = `prova-${Date.now()}@esempio.it`
  const valori = [email, 'una-password-lunga']
  for (let i = 0; i < Math.min(valori.length, campi.length); i++) {
    await pagina.clic(campi[i].x, campi[i].y)
    await pagina.scrivi(valori[i])
  }
  const crea = trova(await pagina.cliccabili(), 'Create your Myynd')
  if (!crea) throw new Error('non trovo il bottone «Create your Myynd»')
  await pagina.clic(crea.x, crea.y)

  const onboarding = await aspetta(async () => (await pagina.testo()).includes('This mind is empty.'), 30_000)
  segna(!!onboarding, 'dopo la registrazione compare il primo avvio',
    onboarding ? '' : `visto: ${(await pagina.testo()).split('\n').filter(Boolean).slice(0, 4).join(' / ')}`)

  // il token, dalla stessa chiave che usa il renderer (src/api.ts)
  const token = await pagina.valuta(`return localStorage.getItem('myynd.token')`)
  segna(!!token, 'la sessione è salvata nella pagina')

  const api = async (via, corpo) => {
    const r = await fetch(`${origine}${via}`, {
      method: corpo ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`${via}: HTTP ${r.status} ${j.errore ?? ''}`)
    return j
  }

  const stato = await api('/api/stato')
  segna(stato.app === true, '`/api/stato` dice `app: true`', `app: ${JSON.stringify(stato.app)}`)

  // il desktop, collegato a una cartella con tre file, e letto fino in fondo
  const collegato = await api('/api/connettori/desktop', { cartelle: [cartella] })
  segna(collegato.ok === true, 'il desktop si collega alla cartella della prova')
  const fine = await sincronizza(origine, token, 'desktop')
  const desktop = fine.conteggi?.perFonte?.find(f => f.fonte === 'desktop')?.n ?? 0
  segna(desktop === 3, 'la lettura trova i tre file (md, txt, pdf)', `desktop: ${desktop}, totale: ${fine.conteggi?.totale}`)

  // il ponte
  const chiavi = await pagina.valuta(`
    if (!window.myynd) return null
    return { tutte: Object.keys(window.myynd), aggiornamenti: Object.keys(window.myynd.aggiornamenti ?? {}),
      richiamo: Object.keys(window.myynd.richiamo ?? {}), dentro: window.myynd.dentroIlRichiamo }`)
  segna(!!chiavi, '`window.myynd` c’è nella pagina')
  if (chiavi) {
    const mancano = CHIAVI.filter(k => !chiavi.tutte.includes(k))
    segna(!mancano.length, 'il ponte ha tutte le chiavi del contratto', mancano.length ? `mancano: ${mancano.join(', ')}` : '')
    const mancanoA = CHIAVI_AGGIORNAMENTI.filter(k => !chiavi.aggiornamenti.includes(k))
    segna(!mancanoA.length, '`aggiornamenti` ha controlla, installa, stato', mancanoA.length ? `mancano: ${mancanoA.join(', ')}` : '')
    const mancanoR = CHIAVI_RICHIAMO.filter(k => !chiavi.richiamo.includes(k))
    segna(!mancanoR.length, '`richiamo` ha chiudi, apri, misura, mostrato', mancanoR.length ? `mancano: ${mancanoR.join(', ')}` : '')
    segna(chiavi.dentro === false, 'la finestra grande sa di non essere il richiamo', `dentroIlRichiamo: ${chiavi.dentro}`)
  }

  /*
   * Fuori dal primo avvio, che copre tutta la finestra: quello che c'è da
   * misurare qui sotto — le due colonne — esiste solo dopo.
   */
  await api('/api/profilo', { onboarding: true })
  await pagina.valuta('location.reload(); return 1')
  const casa = await aspetta(async () => pagina.valuta(`
    const c = document.getElementById('root')?.firstElementChild?.firstElementChild
    return !!(c && [...c.children].some(e => getComputedStyle(e).overflowY === 'auto'))`), 30_000)
  segna(!!casa, 'chiuso il primo avvio si arriva alle due colonne')

  /*
   * Niente da scorrere di lato, e la colonna comincia sotto i semafori.
   *
   * Sono i due difetti che si vedevano solo dentro la finestra vera: le
   * macchie del fondo sbordavano e rendevano scorribile in orizzontale
   * l'applicazione intera — il trackpad la portava via mentre si leggeva il
   * feed — e i tre cerchi cadevano sull'angolo della colonna. Tutti e due si
   * misurano, quindi si misurano.
   */
  const stanza = await pagina.valuta(`
    const cornice = document.getElementById('root').firstElementChild.firstElementChild
    const colonna = [...cornice.children].find(e => getComputedStyle(e).backdropFilter !== 'none')
    const centro = [...cornice.children].find(e => getComputedStyle(e).overflowY === 'auto')
    if (!colonna || !centro) return null
    const prima = Math.round(centro.firstElementChild.getBoundingClientRect().x)
    centro.scrollTop = 1200
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const dopo = Math.round(centro.firstElementChild.getBoundingClientRect().x)
    centro.scrollTop = 0
    return {
      daScorrere: cornice.scrollWidth - cornice.clientWidth,
      colonnaY: Math.round(colonna.getBoundingClientRect().y),
      prima, dopo
    }`)
  if (stanza) {
    segna(stanza.daScorrere === 0, 'non c’è niente da scorrere di lato', `${stanza.daScorrere}px oltre la finestra`)
    segna(stanza.prima === stanza.dopo, 'scorrendo, il contenuto non si sposta di lato', `da ${stanza.prima} a ${stanza.dopo}`)
    // i semafori stanno fra 15 e 27 pixel dall'alto (desktop/finestra.ts)
    segna(process.platform !== 'darwin' || stanza.colonnaY >= 32,
      'la colonna comincia sotto i semafori', `la scheda parte a ${stanza.colonnaY}px`)
  } else {
    segna(false, 'l’impaginato si lascia misurare')
  }

  const guai = await pagina.guai()
  segna(!guai.length, 'nessun errore in console mentre si lavorava', guai.slice(0, 3).join(' | '))

  // il registro del guscio, e dentro niente lavoratore dei PDF caduto
  segna(existsSync(registro), 'il registro del guscio esiste', registro)
  if (existsSync(registro)) {
    const nuovo = readFileSync(registro, 'utf8')
    segna(nuovo.includes('il server ascolta su'), 'il registro racconta questo avvio')
    segna(!nuovo.includes('il lavoratore non parte'), 'il lavoratore dei PDF è partito dentro il pacchetto')
    // il binario di canvas è quello di questa architettura, o pdf-parse lo dice qui
    const moduli = nuovo.split('\n').filter(r => /Cannot find module|Failed to load native binding|canvas/i.test(r))
    segna(!moduli.length, 'nessun modulo mancante nel registro', moduli.slice(0, 2).join(' | '))
  }
} catch (e) {
  segna(false, 'la prova è arrivata in fondo', e instanceof Error ? e.message : String(e))
} finally {
  try { pagina?.chiudi() } catch { /* già chiusa */ }

  // la chiusura: SIGTERM all'app, e dopo nessuno deve restare in ascolto
  const primaDiChiudere = portaServer ? inAscolto(portaServer) : []
  if (uscito === null) {
    app.kill('SIGTERM')
    const chiusa = await aspetta(async () => uscito !== null, 15_000, 250)
    segna(!!chiusa, 'l’app esce con SIGTERM', chiusa ? `codice ${uscito.codice ?? uscito.segnale}` : 'ancora viva dopo 15 s')
    if (!chiusa) app.kill('SIGKILL')
  } else {
    segna(false, 'l’app è rimasta aperta fino alla fine della prova', `uscita prima: ${JSON.stringify(uscito)}`)
  }
  await pausa(800)
  if (portaServer) {
    const dopo = inAscolto(portaServer)
    let risponde = false
    try { await fetch(`http://127.0.0.1:${portaServer}/`, { signal: AbortSignal.timeout(1500) }); risponde = true } catch { /* bene */ }
    segna(!dopo.length && !risponde, 'nessun server rimasto in ascolto',
      dopo.length ? `pid ${dopo.join(', ')} ancora sulla porta ${portaServer} (prima: ${primaDiChiudere.join(', ')})` : '')
    for (const pid of dopo) { try { process.kill(Number(pid), 'SIGKILL') } catch { /* già via */ } }
  }

  /*
   * La seconda apertura, sugli stessi dati.
   *
   * È qui che si vede il guasto più facile da non vedere: la sessione sta in
   * `localStorage`, legato all'origine, cioè alla porta. Un'app che riparte
   * su una porta a caso è un'app che chiede l'accesso a ogni apertura — e
   * la prima apertura, da sola, non lo dice mai.
   */
  if (portaServer && uscito !== null) {
    let uscita2 = null
    const app2 = spawn(BINARIO, [`--remote-debugging-port=${PORTA_CDP}`], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    app2.on('exit', (codice, segnale) => { uscita2 = { codice, segnale } })
    try {
      const pagina2 = await attacca(PORTA_CDP, /./)
      const origine2 = await aspetta(async () => {
        const o = await pagina2.valuta('return location.origin')
        return /^http:\/\/127\.0\.0\.1:\d+$/.test(o) ? o : null
      }, 60_000)
      segna(origine2 === `http://127.0.0.1:${portaServer}`, 'alla seconda apertura la porta è la stessa', `${origine2} (prima: ${portaServer})`)
      const ancoraDentro = await aspetta(async () => {
        const token2 = await pagina2.valuta(`return localStorage.getItem('myynd.token')`)
        const t = await pagina2.testo()
        return token2 && !t.includes('Create an account') ? t : null
      }, 20_000)
      segna(!!ancoraDentro, 'alla seconda apertura si è ancora dentro, senza rifare l’accesso',
        ancoraDentro ? '' : `visto: ${(await pagina2.testo()).split('\n').filter(Boolean).slice(0, 4).join(' / ')}`)
      pagina2.chiudi()
    } catch (e) {
      segna(false, 'la seconda apertura risponde', e instanceof Error ? e.message : String(e))
    }
    if (uscita2 === null) {
      app2.kill('SIGTERM')
      const chiusa2 = await aspetta(async () => uscita2 !== null, 15_000, 250)
      if (!chiusa2) app2.kill('SIGKILL')
      segna(!!chiusa2, 'anche la seconda apertura esce con SIGTERM')
    }
    await pausa(500)
    for (const pid of inAscolto(portaServer)) { try { process.kill(Number(pid), 'SIGKILL') } catch { /* già via */ } }
  }

  rmSync(dati, { recursive: true, force: true })
  rmSync(cartella, { recursive: true, force: true })
  if (guasti) {
    const righe = uscita.split('\n').filter(Boolean).slice(-15)
    if (righe.length) console.log(`\nle ultime righe dell'app:\n  ${righe.join('\n  ')}`)
  }
  console.log(guasti ? `\n${guasti} cos${guasti === 1 ? 'a' : 'e'} da guardare.` : '\nTutto a posto.')
  process.exit(guasti ? 1 : 0)
}
