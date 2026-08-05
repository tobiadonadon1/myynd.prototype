import type { Vals } from '../vals'

/** Le automazioni non esistono ancora davvero: questa schermata lo dice,
 *  invece di mostrare regole finte che non girano. */
export function Automazioni({ v }: { v: Vals }) {
  return (
    <div style={{ width: 720, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 4px 0' }}>
        <span style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>Automazioni</span>
        <span style={{ fontSize: 13, color: 'rgba(34,39,31,.65)' }}>nessuna ancora</span>
      </div>

      <div style={{
        marginTop: 26, borderRadius: '24px 20px 24px 20px', padding: '30px 28px',
        background: 'rgba(255,253,249,.72)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 22px 52px rgba(84,64,44,.12)'
      }}>
        <div style={{ fontSize: 17, lineHeight: 1.6, color: 'rgba(34,39,31,.82)', textWrap: 'pretty' }}>
          Un'automazione è una routine che Myynd esegue da sola — archiviare le
          fatture che tornano, preparare il brief prima di una call, scrivere il
          sollecito dopo quindici giorni.
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.65, color: 'rgba(34,39,31,.65)', marginTop: 16, textWrap: 'pretty' }}>
          Perché possa proporne una deve prima vedere la stessa cosa ripetersi
          nel tuo materiale. Continua a usarla: le prime arrivano da sole, e
          niente parte senza il tuo sì.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
          <button onClick={v.goMyynd} style={{
            padding: '11px 20px', borderRadius: 99, border: 'none',
            background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
            fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
          }}>Torna al feed</button>
        </div>
      </div>
    </div>
  )
}
