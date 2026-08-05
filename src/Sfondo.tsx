/** Le macchie di colore che si muovono dietro l'interfaccia, più la grana. */
export function Sfondo() {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, opacity: 'var(--fi,1.25)' as unknown as number, transition: 'opacity .6s ease', pointerEvents: 'none' }}>
        <div className="wash" style={{ background: 'conic-gradient(from 20deg at 50% 50%, rgba(196,98,59,.34), rgba(216,164,110,.28) 22%, rgba(126,156,130,.36) 46%, rgba(216,164,110,.24) 68%, rgba(196,98,59,.34) 100%)', filter: 'blur(72px)' }} />
        <div className="fl" style={{ width: 560, height: 470, top: -140, right: -70, filter: 'blur(48px)', background: 'radial-gradient(circle at 45% 45%, rgba(196,98,59,.85), rgba(196,98,59,.26) 56%, transparent 74%)', animation: 'flA 34s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 640, height: 520, bottom: -200, left: -140, filter: 'blur(50px)', background: 'radial-gradient(circle at 55% 45%, rgba(96,138,106,.86), rgba(116,150,122,.28) 56%, transparent 74%)', animation: 'flB 42s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 460, height: 400, top: '24%', left: '31%', filter: 'blur(52px)', background: 'radial-gradient(circle at 50% 50%, rgba(216,164,110,.78), rgba(216,164,110,.2) 58%, transparent 76%)', animation: 'flC 30s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 420, height: 360, top: -70, left: '7%', filter: 'blur(54px)', background: 'radial-gradient(circle at 50% 50%, rgba(126,156,130,.6), transparent 72%)', animation: 'flD 38s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 440, height: 380, bottom: -110, right: '5%', filter: 'blur(52px)', background: 'radial-gradient(circle at 50% 50%, rgba(163,78,45,.62), transparent 73%)', animation: 'flE 33s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 320, height: 290, top: '41%', right: -30, filter: 'blur(44px)', background: 'radial-gradient(circle at 50% 50%, rgba(216,164,110,.66), transparent 72%)', animation: 'flB 28s ease-in-out infinite reverse' }} />
        <div className="fl" style={{ width: 360, height: 310, top: '4%', left: '45%', filter: 'blur(50px)', background: 'radial-gradient(circle at 50% 50%, rgba(104,142,112,.56), transparent 74%)', animation: 'flC 44s ease-in-out infinite reverse' }} />
        <div className="fl" style={{ width: 300, height: 270, bottom: '10%', left: '35%', filter: 'blur(42px)', background: 'radial-gradient(circle at 50% 50%, rgba(196,98,59,.56), transparent 73%)', animation: 'flA 26s ease-in-out infinite reverse' }} />
        <div className="fl" style={{ width: 280, height: 250, top: '53%', left: '9%', filter: 'blur(40px)', background: 'radial-gradient(circle at 50% 50%, rgba(216,164,110,.58), transparent 74%)', animation: 'flE 36s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 220, height: 200, top: '14%', left: '22%', filter: 'blur(34px)', background: 'radial-gradient(circle at 50% 50%, rgba(196,98,59,.5), transparent 72%)', animation: 'flD 24s ease-in-out infinite, puls 18s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 240, height: 220, bottom: '24%', right: '22%', filter: 'blur(36px)', background: 'radial-gradient(circle at 50% 50%, rgba(110,148,118,.54), transparent 72%)', animation: 'flC 32s ease-in-out infinite reverse, puls 22s ease-in-out infinite' }} />
        <div className="fl" style={{ width: 200, height: 190, top: '66%', left: '52%', filter: 'blur(32px)', background: 'radial-gradient(circle at 50% 50%, rgba(216,164,110,.5), transparent 72%)', animation: 'flA 29s ease-in-out infinite, puls 26s ease-in-out infinite' }} />
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(34,39,31,.13) .9px, transparent 1px),radial-gradient(rgba(34,39,31,.07) .8px, transparent .9px)',
        backgroundSize: '5px 5px,3px 3px', backgroundPosition: '0 0,1.5px 1.5px', pointerEvents: 'none'
      }} />
    </>
  )
}
