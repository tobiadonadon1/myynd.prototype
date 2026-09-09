/** Le macchie di colore che si muovono dietro l'interfaccia, più la grana. */
export function Sfondo() {
  return (
    <>
      {/*
        `overflow: hidden` non è una rifinitura: senza, tutta l'app scivola di lato.

        Le macchie sbordano apposta — `.wash` sta a `inset: -28%`, le altre
        hanno `top: -140`, `right: -70` — e finché le tagliava soltanto la
        radice sembrava tutto a posto. Ma il contenitore delle due colonne ha
        `overflow-x: auto` (serve alle finestre più strette di 360), e per lui
        quel debordare era *pagina vera*: `scrollWidth` 1798 contro 1280 di
        finestra. Il risultato è che il trackpad, che manda sempre un filo di
        movimento orizzontale insieme a quello verticale, portava di lato
        l'intera applicazione — colonna, schede, tutto — mentre si scorreva il
        feed. Sembrava che il riquadro delle cose da fare si allargasse; in
        realtà scivolava via lo schermo intero.

        Tagliate qui, le macchie restano identiche a prima — la radice le
        tagliava già nello stesso punto — e non c'è più niente da scorrere.
      */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 'var(--fi,1.25)' as unknown as number, transition: 'opacity .6s ease', pointerEvents: 'none' }}>
        {/* La stessa luce del primo avvio, ma di giorno: rame, ambra e sabbia
            su avorio. Il verde non c'è più — era il secondo colore di due,
            e due colori che si contendono il fondo sono la ragione per cui
            l'app sembrava un'altra cosa rispetto al palco. */}
        <div className="wash" style={{ background: 'conic-gradient(from 20deg at 50% 50%, rgba(196,98,59,.30), rgba(217,138,90,.26) 24%, rgba(228,205,176,.30) 48%, rgba(244,233,220,.24) 70%, rgba(196,98,59,.30) 100%)', filter: 'blur(76px)' }} />
        <div className="fl" style={{ width: 620, height: 500, top: -160, right: -90, filter: 'blur(52px)', background: 'radial-gradient(circle at 45% 45%, rgba(196,98,59,.72), rgba(196,98,59,.22) 56%, transparent 74%)', animation: 'flA 34s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 640, height: 520, bottom: -220, left: -160, filter: 'blur(54px)', background: 'radial-gradient(circle at 55% 45%, rgba(228,205,176,.9), rgba(228,205,176,.3) 56%, transparent 74%)', animation: 'flB 42s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 480, height: 420, top: '22%', left: '30%', filter: 'blur(56px)', background: 'radial-gradient(circle at 50% 50%, rgba(217,138,90,.62), rgba(217,138,90,.16) 58%, transparent 76%)', animation: 'flC 30s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 440, height: 380, bottom: -120, right: '6%', filter: 'blur(54px)', background: 'radial-gradient(circle at 50% 50%, rgba(163,78,45,.5), transparent 73%)', animation: 'flE 33s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 360, height: 320, top: '6%', left: '44%', filter: 'blur(52px)', background: 'radial-gradient(circle at 50% 50%, rgba(244,233,220,.8), transparent 74%)', animation: 'flC 44s ease-in-out infinite reverse' }} />
        <div className="fl" style={{ width: 300, height: 270, bottom: '12%', left: '36%', filter: 'blur(44px)', background: 'radial-gradient(circle at 50% 50%, rgba(196,98,59,.42), transparent 73%)', animation: 'flA 26s ease-in-out infinite reverse' }} />
        <div className="fl" style={{ width: 260, height: 240, top: '52%', left: '8%', filter: 'blur(42px)', background: 'radial-gradient(circle at 50% 50%, rgba(217,138,90,.5), transparent 74%)', animation: 'flE 36s ease-in-out infinite' }} />
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(34,39,31,.13) .9px, transparent 1px),radial-gradient(rgba(34,39,31,.07) .8px, transparent .9px)',
        backgroundSize: '5px 5px,3px 3px', backgroundPosition: '0 0,1.5px 1.5px', pointerEvents: 'none'
      }} />
    </>
  )
}
