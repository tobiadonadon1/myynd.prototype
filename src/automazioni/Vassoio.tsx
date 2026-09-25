// Il vassoio di prova (P6): quello che le automazioni nuove farebbero, in attesa.
//
// In cima alla pagina, solo quando c'è qualcosa. Un gruppo per automazione; per
// ogni risultato la riga come la leggerebbe in lista, la data, l'inizio della
// bozza, «Metti in lista» e ×. Tutti e due spariscono subito; se il server dice
// di no tornano, tranne quando lui ha già risposto: allora resta via, e lo dice.

import { apiP6, type EsitoVista, type GruppoVassoio } from '../api'
import { t } from '../lingua'
import { data, frasiProva } from '../prova'

function primoParagrafo(s: string): string {
  return s.split(/\n\s*\n/).map(x => x.trim()).find(Boolean) ?? ''
}

export function Vassoio({ gruppi, cambia, listaCambiata, avvisa, guaio }: {
  gruppi: GruppoVassoio[]
  cambia: (g: GruppoVassoio[]) => void
  /** La lista è cambiata: chi guarda le automazioni la rilegge. */
  listaCambiata: () => void
  avvisa: (testo: string) => void
  guaio: (testo: string) => void
}) {
  if (!gruppi.some(g => g.esiti.length)) return null
  const senza = (id: string) => gruppi.map(g => ({ ...g, esiti: g.esiti.filter(e => e.id !== id) })).filter(g => g.esiti.length)

  const inLista = async (e: EsitoVista) => {
    const prima = gruppi
    cambia(senza(e.id))
    try {
      const r = await apiP6.inLista(e.id)
      cambia(r.vassoio)
      listaCambiata()
    } catch (err) {
      const x = err as Error & { codice?: string; quando?: string }
      if (x.codice === 'superata') { avvisa(frasiProva.giaRisposto(x.quando ?? new Date().toISOString())); return }
      cambia(prima); guaio(x.message)
    }
  }
  const scarta = async (e: EsitoVista) => {
    const prima = gruppi
    cambia(senza(e.id))
    try { cambia((await apiP6.scartaEsito(e.id)).vassoio) }
    catch (err) { cambia(prima); guaio(err instanceof Error ? err.message : String(err)) }
  }

  return <section className="vassoio" aria-labelledby="vassoio-titolo">
    <h2 id="vassoio-titolo">{t('Vassoio di prova')}</h2>
    {gruppi.filter(g => g.esiti.length).map(g => <div key={g.automazione} className="vassoio-gruppo">
      <h3>{g.nome}</h3>
      <ul>
        {g.esiti.map(e => <li key={e.id} className="vassoio-voce">
          <div className="vassoio-testo">
            <div className="vassoio-riga"><span>{e.testo}</span><time>{data(e.quando)}</time></div>
            {e.bozza && <p>{primoParagrafo(e.bozza)}</p>}
          </div>
          <button type="button" className="auto-button" onClick={() => inLista(e)}>{t('Metti in lista')}</button>
          <button type="button" className="vassoio-no" aria-label={`${t('Non serve')}: ${e.testo}`} title={t('Non serve')} onClick={() => scarta(e)}>×</button>
        </li>)}
      </ul>
    </div>)}
  </section>
}
