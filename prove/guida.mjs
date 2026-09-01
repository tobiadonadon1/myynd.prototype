// Un telecomando per l'app vera.
//
// Non prova i componenti a parte: apre l'applicazione impacchettata, si attacca
// al protocollo di DevTools e preme i bottoni come li premeresti tu. È l'unico
// modo in cui una prova può dire qualcosa sul prodotto invece che sul codice —
// un test unitario passa anche quando il bottone è coperto da un'altra cosa.

let id = 0

export async function attacca(porta = 9222, quale = /oggi|Oggi|127\.0\.0\.1/) {
  for (let giro = 0; giro < 40; giro++) {
    try {
      const bersagli = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json()
      const pagina = bersagli.find(b => b.type === 'page' && quale.test(b.url + b.title))
        ?? bersagli.find(b => b.type === 'page')
      if (pagina) return await apri(pagina.webSocketDebuggerUrl)
    } catch { /* l'app non è ancora su */ }
    await pausa(500)
  }
  throw new Error('Non trovo nessuna finestra a cui attaccarmi.')
}

function apri(url) {
  return new Promise((risolvi, rifiuta) => {
    const ws = new WebSocket(url)
    const attese = new Map()
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      const a = attese.get(m.id)
      if (!a) return
      attese.delete(m.id)
      m.error ? a.rifiuta(new Error(m.error.message)) : a.risolvi(m.result)
    }
    ws.onerror = () => rifiuta(new Error('connessione fallita'))
    ws.onopen = () => {
      const manda = (metodo, params = {}) => new Promise((r, x) => {
        const n = ++id
        attese.set(n, { risolvi: r, rifiuta: x })
        ws.send(JSON.stringify({ id: n, method: metodo, params }))
      })

      /** Valuta nella pagina e torna il valore vero, non un handle. */
      const valuta = async (codice) => {
        const r = await manda('Runtime.evaluate', {
          expression: `(async () => { ${codice} })()`,
          awaitPromise: true, returnByValue: true
        })
        if (r.exceptionDetails) {
          throw new Error(r.exceptionDetails.exception?.description ?? 'errore nella pagina')
        }
        return r.result.value
      }

      risolvi({
        manda, valuta,
        chiudi: () => ws.close(),

        /** Uno scatto, salvato dove dici. */
        async scatto(dove) {
          const { data } = await manda('Page.captureScreenshot', { format: 'png' })
          const { writeFileSync } = await import('node:fs')
          writeFileSync(dove, Buffer.from(data, 'base64'))
          return dove
        },

        /** Il testo visibile, per capire cosa c'è a schermo. */
        testo: () => valuta(`return document.body.innerText`),

        /** Tutti i bersagli cliccabili, come li vede chi usa la tastiera. */
        cliccabili: () => valuta(`
          const v = []
          for (const e of document.querySelectorAll('button,a,input,textarea,[role="button"]')) {
            const r = e.getBoundingClientRect()
            if (!r.width || !r.height) continue
            v.push({
              tag: e.tagName.toLowerCase(),
              testo: (e.innerText || e.value || e.placeholder || e.title || '').trim().slice(0, 44),
              x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
              w: Math.round(r.width), h: Math.round(r.height),
              disabilitato: !!e.disabled
            })
          }
          return v
        `),

        /** Un vero clic del mouse, non `.click()`: passa da dove passerebbe il dito. */
        async clic(x, y) {
          for (const type of ['mousePressed', 'mouseReleased']) {
            await manda('Input.dispatchMouseEvent', {
              type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0
            })
          }
          await pausa(180)
        },

        async passaSopra(x, y) {
          await manda('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
          await pausa(160)
        },

        async scrivi(testo) {
          // `insertText` invece di un tasto per carattere: le lettere accentate
          // e la chiocciola passano, con i tasti sintetici a volte no
          await manda('Input.insertText', { text: testo })
          await pausa(80)
        },

        async tasto(nome) {
          const codici = {
            Enter: { windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
            Escape: { windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' },
            Tab: { windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' },
            Backspace: { windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' }
          }
          const c = codici[nome]
          await manda('Input.dispatchKeyEvent', { type: 'keyDown', ...c })
          await manda('Input.dispatchKeyEvent', { type: 'keyUp', ...c })
          await pausa(200)
        },

        /** Gli errori che la pagina ha buttato fuori mentre lavoravamo. */
        async guai() {
          return valuta(`return (window.__guai || [])`)
        },

        /** Comincia a raccogliere gli errori di console. */
        async ascoltaGuai() {
          return valuta(`
            if (!window.__guai) {
              window.__guai = []
              const vero = console.error
              console.error = (...a) => { window.__guai.push(a.map(String).join(' ')); vero(...a) }
              addEventListener('error', e => window.__guai.push('eccezione: ' + e.message))
              addEventListener('unhandledrejection', e => window.__guai.push('promessa: ' + e.reason))
            }
            return true
          `)
        }
      })
    }
  })
}

export const pausa = (ms) => new Promise(r => setTimeout(r, ms))

/** Trova un bersaglio dal testo. */
export function trova(elenchi, testo) {
  const t = testo.toLowerCase()
  return elenchi.find(e => e.testo.toLowerCase().includes(t))
}
