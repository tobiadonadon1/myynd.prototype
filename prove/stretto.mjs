import { attacca, pausa } from './guida.mjs'
const p = await attacca()
await p.valuta(`localStorage.setItem('mind2do.giro','fatto'); return 1`)
const api = (via, opz) => p.valuta(`
  const r = await fetch(${JSON.stringify(via)}, Object.assign({ headers: { authorization: 'Bearer sviluppo-non-in-produzione', 'content-type':'application/json' } }, ${JSON.stringify(opz ?? {})}))
  return await r.json()`)
const l0 = await api('/api/compiti')
for (const c of [...l0.compiti, ...l0.chiusi]) await api('/api/compiti/' + c.id, { method: 'DELETE' })
for (const t of ['mandare il preventivo aggiornato a Rossi entro venerdì', 'richiamare lo studio']) {
  await api('/api/compiti', { method: 'POST', body: JSON.stringify({ testo: t, quando: 'oggi' }) })
}
await p.valuta(`location.reload(); return 1`); await pausa(2500)

for (const w of [800, 620, 500, 440, 380]) {
  await p.manda('Emulation.setDeviceMetricsOverride', { width: w, height: 640, deviceScaleFactor: 1, mobile: false })
  await pausa(700)
  const m = await p.valuta(`
    const d = document.documentElement
    const col = [...document.querySelectorAll('li')][0]
    const testo = col?.querySelector('button')
    return {
      finestra: window.innerWidth,
      scorreDiLato: d.scrollWidth > d.clientWidth + 1,
      contenuto: Math.round(document.querySelector('h1')?.parentElement?.parentElement?.getBoundingClientRect().width ?? 0),
      rigaLarga: col ? Math.round(col.getBoundingClientRect().width) : 0,
      testoTagliato: testo ? testo.scrollWidth > testo.clientWidth + 1 : null
    }
  `)
  console.log(`  ${String(w).padStart(4)}px →`, JSON.stringify(m))
}
await p.manda('Emulation.setDeviceMetricsOverride', { width: 440, height: 640, deviceScaleFactor: 2, mobile: false })
await pausa(700)
await p.scatto(process.argv[2])
await p.manda('Emulation.clearDeviceMetricsOverride')
p.chiudi(); process.exit(0)
