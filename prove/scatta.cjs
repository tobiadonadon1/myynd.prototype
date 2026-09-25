// Fotografie dell'app nella cornice vera, da una finestra che non si vede mai.
//
//   URL=http://127.0.0.1:18700/ OUT=<cartella> TEMA=chiaro LARGA=1280 PASSI=<passi.json> \
//     node_modules/.bin/electron prove/scatta.cjs
//
// Di solito lo lancia `prove/scena.sh`. La finestra è `show: false`, con la
// barra del titolo `hiddenInset` e i semafori disegnati sopra (la finestra
// nascosta non li ha), il Dock nascosto, i dati di Electron in una cartella
// temporanea, e un cane da guardia che chiude tutto dopo 120 secondi (su
// questo Mac non c'è `timeout`). Mai una finestra visibile, mai un tasto
// simulato fuori da questa finestra.
//
// I passi sono un elenco JSON; senza, uno solo: la prima pagina.
//   { "vai": "Memory" }                 preme la voce di navigazione con quel nome
//   { "clicca": "Add a task" }          preme il primo bottone/link con quel nome accessibile
//   { "scrivi": "testo", "in": "Ask" }  scrive nel campo con quell'etichetta/segnaposto (senza «in»: quello col fuoco)
//   { "premi": "Enter" }                un tasto, dentro questa finestra
//   { "passa": "testo" }                porta il mouse sopra l'elemento che contiene quel testo
//   { "aspetta": 800 }                  millisecondi
//   { "scorri": 600 }                   scorre il contenitore principale (0 = in cima)
//   { "scatta": "nome" }                una fotografia: <OUT>/<nome>-<tema>-<larga>.png
//   { "testo": "nome" }                 il testo della pagina: <OUT>/<nome>-<tema>-<larga>.txt
//   { "js": "espressione" }             valuta un'espressione nella pagina e la stampa
//   { "chiudi": true }                  chiude le finestre modali aperte (all'arrivo lo fa da sé)
// Un nome si cerca in aria-label, poi nel testo visibile, senza badare alle maiuscole.

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const URL = process.env.URL
const OUT = process.env.OUT || process.cwd()
const TEMA = process.env.TEMA || 'chiaro'
const LARGA = Number(process.env.LARGA || 1280)
const ALTA = Number(process.env.ALTA || 900)
const TOKEN = process.env.TOKEN || 'sviluppo-non-in-produzione'
const PASSI = process.env.PASSI ? JSON.parse(fs.readFileSync(process.env.PASSI, 'utf8')) : [{ scatta: 'prima' }, { testo: 'prima' }]

if (!URL) { console.error('scatta · manca URL'); process.exit(1) }

// il cane da guardia: qualunque cosa succeda, fra due minuti si esce (col passo a passo di P5, dieci minuti per passo)
let cane = setTimeout(() => { console.error('scatta · 120 s passati: esco'); app.exit(1) }, 120_000)
cane.unref()

// i dati di Electron: nella cartella che dà scena.sh (che la butta alla fine),
// o in una temporanea che si butta uscendo
const DATI = process.env.DATI_ELECTRON || fs.mkdtempSync(path.join(os.tmpdir(), 'myynd-scatta-'))
fs.mkdirSync(DATI, { recursive: true })
app.setPath('userData', DATI)
process.on('exit', () => { if (!process.env.DATI_ELECTRON) try { fs.rmSync(DATI, { recursive: true, force: true }) } catch { /* pazienza */ } })
if (app.dock) app.dock.hide()

const pausa = ms => new Promise(r => setTimeout(r, ms))
const SEMAFORI = `(() => { if (document.getElementById('prova-semafori')) return 1; const d=document.createElement('div'); d.id='prova-semafori'; d.style.cssText='position:fixed;left:19px;top:15px;z-index:99999;display:flex;gap:8px;pointer-events:none'; for (const c of ['#FF5F57','#FEBC2E','#28C840']) { const p=document.createElement('i'); p.style.cssText='display:block;width:12px;height:12px;border-radius:50%;background:'+c+';box-shadow:0 0 0 .5px rgba(0,0,0,.25)'; d.appendChild(p) } document.body.appendChild(d); return 1 })()`
const VIA_TUTORIAL = `(() => { const lab=[...document.querySelectorAll('*')].find(x=>x.children.length===0 && /^(TUTORIAL|GUIDA)/i.test((x.textContent||'').trim())); if(!lab) return false; let root=lab; for(let i=0;i<8 && root;i++){ const b=[...root.querySelectorAll('button')].find(x=>/^(Avanti|Next|Salta|Skip|Fine|Done|Ho capito|Got it|Chiudi|Close)$/.test((x.textContent||'').trim())); if(b){ b.click(); return true } root=root.parentElement } return false })()`

/**
 * Le finestre che si aprono da sole all'arrivo (il punto di oggi, per
 * esempio): si chiudono col loro bottone «Chiudi», come farebbe lui. Con
 * LASCIA_FINESTRE=1 restano, per fotografarle.
 */
const VIA_DIALOGHI = `(() => { const d=[...document.querySelectorAll('[role=dialog][aria-modal=true]')].find(x => x.getBoundingClientRect().width > 0); if(!d) return false; const b=[...d.querySelectorAll('button')].find(x=>/^(Chiudi|Close)$/i.test((x.getAttribute('aria-label')||x.textContent||'').trim())); if(!b) return false; b.click(); return true })()`
const LASCIA_FINESTRE = process.env.LASCIA_FINESTRE === '1'

/** L'elemento con quel nome accessibile: aria-label, poi testo, prima esatto poi contenuto. */
const TROVA = (nome, sel) => `(() => {
  const n = ${JSON.stringify(String(nome).toLowerCase())}
  const tutti = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
  const nomeDi = e => ((e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('placeholder') || e.textContent || '').trim().toLowerCase())
  return tutti.find(e => nomeDi(e) === n) || tutti.find(e => nomeDi(e).includes(n)) || null
})()`
const PREMIBILI = 'a,button,[role=button],[role=tab],[role=menuitem],[role=link],summary'

async function main() {
  const w = new BrowserWindow({
    show: false, width: LARGA, height: ALTA, titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 19, y: 15 },
    backgroundColor: TEMA === 'scuro' ? '#1F1A17' : '#F2E9DC',
    // — P5: inizio — (una finestra nascosta non deve rallentare: le misure dei tempi sarebbero false)
    webPreferences: { preload: path.join(__dirname, 'finto-guscio.cjs'), contextIsolation: false, sandbox: false, backgroundThrottling: false }
    // — P5: fine —
  })
  const js = codice => w.webContents.executeJavaScript(codice)
  await w.loadURL(URL)
  await js(`localStorage.setItem('myynd.token', ${JSON.stringify(TOKEN)}); localStorage.setItem('myynd.tema', ${JSON.stringify(TEMA)});` +
    (process.env.AGENDA_FINTA === '1' ? "localStorage.setItem('myynd.agenda.finta','1');" : '') + ' 1')
  await w.loadURL(URL)
  await pausa(Number(process.env.ATTESA || 5000))
  for (let i = 0; i < 8 && await js(VIA_TUTORIAL); i++) await pausa(500)
  if (!LASCIA_FINESTRE) for (let i = 0; i < 4 && await js(VIA_DIALOGHI); i++) await pausa(500)

  const file = (nome, est) => path.join(OUT, `${nome}-${TEMA}-${LARGA}.${est}`)
  for await (const p of p5Passi(PASSI, OUT, () => { clearTimeout(cane); cane = setTimeout(() => { console.error('scatta · 10 min senza un passo: esco'); app.exit(1) }, 600_000); cane.unref() })) {
    if (await p5Passo(p, { w, js, OUT, TEMA, LARGA, pausa, TROVA, PREMIBILI, SEMAFORI })) continue
    if (p.vai || p.clicca) {
      const nome = p.vai || p.clicca
      let ok = false
      for (let i = 0; i < 10 && !ok; i++) {
        ok = await js(`(() => { const e = ${TROVA(nome, PREMIBILI)}; if (e) e.click(); return !!e })()`)
        if (!ok) await pausa(500)
      }
      console.log(`scatta · ${p.vai ? 'vai' : 'clicca'} «${nome}»: ${ok ? 'fatto' : 'NON TROVATO'}`)
      await pausa(p.vai ? 1500 : 500)
      for (let i = 0; i < 4 && await js(VIA_TUTORIAL); i++) await pausa(400)
    } else if (p.scrivi !== undefined) {
      const ok = await js(`(() => {
        const e = ${p.in ? TROVA(p.in, 'input,textarea,[contenteditable=true]') : 'document.activeElement'}
        if (!e) return false
        e.focus()
        if (e.isContentEditable) { e.textContent = ${JSON.stringify(p.scrivi)}; e.dispatchEvent(new InputEvent('input', { bubbles: true })); return true }
        const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(p.scrivi)})
        e.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      console.log(`scatta · scrivi in «${p.in || 'fuoco'}»: ${ok ? 'fatto' : 'NON TROVATO'}`)
      await pausa(300)
    } else if (p.premi) {
      for (const type of ['keyDown', 'char', 'keyUp']) {
        if (type === 'char' && p.premi.length !== 1) continue
        w.webContents.sendInputEvent({ type, keyCode: p.premi })
      }
      await pausa(400)
    } else if (p.passa) {
      const c = await js(`(() => { const it=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while((n=it.nextNode())){ if((n.textContent||'').includes(${JSON.stringify(p.passa)})) break } if(!n) return null; let e=n.parentElement; for(let i=0;i<6 && e && e.getBoundingClientRect().height<28;i++) e=e.parentElement; if(!e) return null; e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:Math.round(r.left+Math.min(r.width/2,300)), y:Math.round(r.top+r.height/2)} })()`)
      if (c) w.webContents.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y })
      console.log(`scatta · passa su «${p.passa}»: ${c ? 'fatto' : 'NON TROVATO'}`)
      await pausa(700)
    } else if (p.aspetta) {
      await pausa(Number(p.aspetta))
    } else if (p.scorri !== undefined) {
      await js(`(() => { const s=[...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a,b)=>b.clientHeight-a.clientHeight)[0]; if (s) s.scrollTop = ${Number(p.scorri)}; else window.scrollTo(0, ${Number(p.scorri)}); return 1 })()`)
      await pausa(300)
    } else if (p.scatta) {
      await js(SEMAFORI)
      await pausa(350)
      fs.writeFileSync(file(p.scatta, 'png'), (await w.webContents.capturePage()).toPNG())
      console.log(`scatta · ${file(p.scatta, 'png')}`)
    } else if (p.testo) {
      fs.writeFileSync(file(p.testo, 'txt'), await js('document.body.innerText'))
    } else if (p.chiudi) {
      for (let i = 0; i < 4 && await js(VIA_DIALOGHI); i++) await pausa(400)
    } else if (p.js) {
      console.log(`scatta · js: ${JSON.stringify(await js(p.js))}`)
    }
  }
  app.quit()
}

// — P5: inizio —
// Tre passi nuovi e il passo a passo, per le prove di chiarezza (P5):
//   { "elenco": "nome" }    <OUT>/<nome>-<tema>-<larga>.json: gli elementi che si premono o si scrivono, visibili, col nome accessibile
//   { "misura": "nome" }    preme quell'elemento e aggiunge a <OUT>/misure.jsonl i ms fino al primo cambio dentro la sua scheda
//   { "metriche": "nome" }  cinque secondi fermi, poi <OUT>/<nome>-<tema>-<larga>-metriche.json: CPU e GPU sommate di Electron
// MODO=passo: niente PASSI; dopo ogni azione passo-N.png e passo-N.json in OUT, poi si aspetta OUT/azione-N.json
// ({ "clicca": "…" } | { "scrivi": "…", "in": "…" } | { "premi": "Enter" } | { "fine": true }), ogni 200 ms, per dieci minuti al più.
// Chi cammina vede solo le foto e l'elenco: niente indirizzi, niente codice nella pagina.
const ELENCO = `(() => {
  const sel = 'a,button,input,textarea,select,[role=button],[role=switch],[role=radio],[role=menuitem],[role=tab],[role=link],summary'
  return [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.opacity !== '0' && r.bottom > 0 && r.top < innerHeight }).map(e => {
    const r = e.getBoundingClientRect()
    const ruolo = e.getAttribute('role') || (e.tagName === 'A' ? 'link' : e.tagName === 'INPUT' ? (e.type === 'checkbox' ? 'checkbox' : 'campo') : e.tagName === 'TEXTAREA' ? 'campo' : e.tagName.toLowerCase())
    const lab = e.getAttribute('aria-labelledby') ? (document.getElementById(e.getAttribute('aria-labelledby')) || {}).textContent : ''
    const perLabel = e.id ? (document.querySelector('label[for="' + e.id + '"]') || {}).textContent : ''
    const nome = (e.getAttribute('aria-label') || lab || perLabel || e.getAttribute('title') || e.getAttribute('placeholder') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120)
    const stato = e.getAttribute('aria-checked') ?? e.getAttribute('aria-current') ?? e.getAttribute('aria-expanded')
    return { ruolo, nome, testo: ('value' in e && e.tagName !== 'BUTTON' ? String(e.value) : '').slice(0, 200), ...(stato != null ? { stato } : {}), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
  })
})()`
const MISURA = (nome, trova) => `new Promise(fatto => {
  const e = ${trova}
  if (!e) return fatto(null)
  const casa = e.closest('[data-scheda],article,section,main') || document.body
  const t0 = performance.now()
  const o = new MutationObserver(() => { o.disconnect(); fatto(Math.round((performance.now() - t0) * 10) / 10) })
  o.observe(casa, { subtree: true, childList: true, attributes: true, characterData: true })
  setTimeout(() => { o.disconnect(); fatto(-1) }, 3000)
  e.click()
})`

async function* p5Passi(passi, out, rinnova) {
  if (process.env.MODO !== 'passo') { yield* passi; return }
  for (let n = 0; ; n++) {
    yield { p5Foto: `passo-${n}` }
    const f = path.join(out, `azione-${n}.json`)
    rinnova()
    let a = null
    for (let i = 0; i < 3000 && !a; i++) {
      try { a = JSON.parse(fs.readFileSync(f, 'utf8')) } catch { await new Promise(r => setTimeout(r, 200)) }
    }
    if (!a || a.fine) return
    yield a
    yield { aspetta: 700 }
  }
}

async function p5Passo(p, { w, js, OUT, TEMA, LARGA, pausa, TROVA, PREMIBILI, SEMAFORI }) {
  const file = (nome, est) => path.join(OUT, `${nome}-${TEMA}-${LARGA}.${est}`)
  if (p.elenco) {
    fs.writeFileSync(file(p.elenco, 'json'), JSON.stringify(await js(ELENCO), null, 1))
    console.log(`scatta · elenco ${p.elenco}`)
    return true
  }
  if (p.misura) {
    const ms = await js(MISURA(p.misura, TROVA(p.misura, PREMIBILI + ',[role=switch],[role=radio]')))
    fs.appendFileSync(path.join(OUT, 'misure.jsonl'), JSON.stringify({ nome: p.misura, ms, tema: TEMA, larga: LARGA }) + '\n')
    console.log(`scatta · misura «${p.misura}»: ${ms === null ? 'NON TROVATO' : ms + ' ms'}`)
    await pausa(400)
    return true
  }
  if (p.metriche) {
    const somma = () => app.getAppMetrics().reduce((a, m) => { a.cpu += m.cpu.percentCPUUsage; if (m.type === 'GPU') a.gpu += m.cpu.percentCPUUsage; return a }, { cpu: 0, gpu: 0 })
    somma()
    await pausa(5000)
    const s = somma()
    fs.writeFileSync(file(`${p.metriche}-metriche`, 'json'), JSON.stringify({ cpu: Math.round(s.cpu * 10) / 10, gpu: Math.round(s.gpu * 10) / 10 }))
    console.log(`scatta · metriche ${p.metriche}: cpu ${s.cpu.toFixed(1)}%, gpu ${s.gpu.toFixed(1)}%`)
    return true
  }
  if (p.p5Foto) {
    await js(SEMAFORI)
    await pausa(350)
    fs.writeFileSync(path.join(OUT, `${p.p5Foto}.png`), (await w.webContents.capturePage()).toPNG())
    fs.writeFileSync(path.join(OUT, `${p.p5Foto}.json`), JSON.stringify(await js(ELENCO), null, 1))
    console.log(`scatta · ${p.p5Foto}`)
    return true
  }
  return false
}
// — P5: fine —

app.whenReady().then(main).catch(e => { console.error('scatta ·', e && e.message ? e.message : e); app.exit(1) })
