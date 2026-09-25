import { useEffect, useState } from 'react'
import { saluteFonti } from '../api'
import { record, striscia, type Cella } from '../salute-fonti'

/**
 * I trenta giorni di una fonte, nel suo pannello: una riga e una striscia.
 *
 * «28 giorni su 29 senza guai», e sotto una cella per giorno: verde se si è
 * letta per bene (anche se non è arrivato niente: il silenzio non è un
 * guasto), rame se ha avuto un guaio, vuota se non si è letta. Oggi è
 * l'ultima, più tenue, perché non è ancora finito. Finché si carica, o se
 * la rotta non risponde, non c'è niente: meglio niente che un numero finto.
 * Con meno di due giorni misurati non c'è ancora niente da dire.
 */
export function SaluteFonte({ id, rileggi }: { id: string; rileggi?: string }) {
  const [celle, setCelle] = useState<Cella[] | null>(null)
  useEffect(() => {
    let vivo = true
    saluteFonti(30, id).then(r => { if (vivo) setCelle(striscia(r, id)) }).catch(() => { if (vivo) setCelle(null) })
    return () => { vivo = false }
  }, [id, rileggi])
  const riga = celle ? record(celle) : null
  if (!celle || !riga) return null
  return (
    <div className="connection-health">
      <p>{riga}</p>
      <div role="img" aria-label={riga} className="connection-health-strip" style={{ gridTemplateColumns: `repeat(${celle.length},minmax(0,1fr))` }}>
        {celle.map(c => <span key={c.giorno} title={c.titolo} className={`is-${c.stato}${c.oggi ? ' is-oggi' : ''}`} />)}
      </div>
    </div>
  )
}
