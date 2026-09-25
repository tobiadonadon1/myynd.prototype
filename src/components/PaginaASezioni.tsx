// La pagina a sezioni: le Preferenze e la Memoria hanno la stessa forma.
// Un titolo, a sinistra le sezioni con la loro nota di stato, a destra il
// pannello con il titolo della sezione e le sue schede. Solo la sezione
// scelta si monta. La sezione scelta si ricorda per conto; un biglietto
// (`v.apri(pagina, sezione, scheda)`) porta a una scheda e la cerchia di rame.

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { ascoltaSezione, chiaveRicordo, dimenticaSezione, sezioneAttesa, type Pagina, type Sezione } from '../sezioni.ts'

/** L'ultima sezione aperta, per conto. Il deposito del browser può mancare: allora niente. */
export function sezioneRicordata(pagina: Pagina, email: string | null): string | null {
  try { return localStorage.getItem(chiaveRicordo(pagina, email)) } catch { return null }
}

export function PaginaASezioni({ titolo, pagina, etichettaNav, sezioni, attuale, scegli, email, children }: {
  titolo: string
  pagina: Pagina
  etichettaNav: string
  sezioni: Sezione[]
  attuale: string
  scegli: (id: string) => void
  email: string | null
  children: ReactNode
}) {
  const pannello = useRef<HTMLElement>(null)
  const scegliRef = useRef(scegli)
  scegliRef.current = scegli
  const attualeRef = useRef(attuale)
  attualeRef.current = attuale
  const ids = sezioni.map(s => s.id).join(' ')

  const vai = (id: string) => {
    scegli(id)
    try { localStorage.setItem(chiaveRicordo(pagina, email), id) } catch { /* senza deposito si ricomincia dalla prima */ }
  }

  // il biglietto: all'apertura e mentre la pagina è già aperta
  useEffect(() => {
    let orologi: ReturnType<typeof setTimeout>[] = []
    const segui = () => {
      const b = sezioneAttesa(pagina)
      if (!b) return
      if (b.sezione && b.sezione !== attualeRef.current && ids.split(' ').includes(b.sezione)) scegliRef.current(b.sezione)
      if (!b.scheda) { dimenticaSezione(pagina); return }
      // la scheda può arrivare dopo i dati: si cerca per un paio di secondi
      let tentativi = 0
      const cerca = () => {
        const el = pannello.current?.querySelector<HTMLElement>(`[data-scheda="${b.scheda}"]`)
        if (!el) { if (++tentativi < 20) orologi.push(setTimeout(cerca, 100)); else dimenticaSezione(pagina); return }
        dimenticaSezione(pagina)
        el.scrollIntoView({ block: 'center' })
        el.setAttribute('data-acceso', '')
        // lo spegnimento non si annulla con la pagina: un anello rimasto acceso è peggio di uno che manca
        setTimeout(() => el.removeAttribute('data-acceso'), 1500)
      }
      orologi.push(setTimeout(cerca, 0))
    }
    segui()
    const smetti = ascoltaSezione(p => { if (p === pagina) segui() })
    return () => { smetti(); for (const o of orologi) clearTimeout(o); orologi = [] }
  }, [pagina, ids])

  const scelta = sezioni.find(s => s.id === attuale) ?? sezioni[0]

  return (
    <main className="f-pagina">
      <h1>{titolo}</h1>
      <div className="f-layout">
        <nav className="f-nav" aria-label={etichettaNav} style={{ '--n': sezioni.length } as CSSProperties}>
          {sezioni.map(s => (
            <button key={s.id} type="button" aria-current={scelta?.id === s.id ? 'page' : undefined} onClick={() => vai(s.id)}>
              <span>{s.titolo}</span>
              {s.nota && <small className={s.notaRame ? 'rame' : undefined}>{s.nota}</small>}
            </button>
          ))}
        </nav>
        <section ref={pannello} className="f-pannello" aria-labelledby={`sezione-${pagina}-${scelta?.id}`}>
          <h2 id={`sezione-${pagina}-${scelta?.id}`}>{scelta?.titolo}</h2>
          {children}
        </section>
      </div>
    </main>
  )
}
