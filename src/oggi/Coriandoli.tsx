// I coriandoli di quando finisci.
//
// Un'app che non festeggia mai è un'app che ti chiede e basta. Questa lo fa
// una volta sola, quando l'ultima riga del giorno se ne va, e dura poco più di
// un secondo: una festa che si ripete a ogni salvataggio smette di essere una
// festa entro mercoledì.
//
// È un canvas e non un mucchio di div perché sono duecento pezzi che ruotano:
// col DOM sarebbero duecento elementi da comporre a ogni fotogramma, e su una
// finestra già piena di vetro sfocato si vedrebbe.

import { useEffect, useRef } from 'react'

const COLORI = ['#C4623B', '#7E9C82', '#D8A46E', '#8E3F1F', '#FFF7F0']
const DURATA = 2600

type Pezzo = {
  x: number; y: number; vx: number; vy: number
  giro: number; velGiro: number; largo: number; alto: number; colore: string
}

export function Coriandoli({ quando, finito }: { quando: number; finito: () => void }) {
  const tela = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!quando) return
    // chi ha chiesto meno movimento al sistema non vuole nemmeno questo
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finito(); return }

    const c = tela.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const L = c.clientWidth
    const A = c.clientHeight
    c.width = L * dpr
    c.height = A * dpr
    ctx.scale(dpr, dpr)

    // Una pioggia da tutta la larghezza, non due scoppi dagli angoli. Gli
    // scoppi sembravano due sbuffi in un angolo; una cascata che attraversa la
    // finestra si legge come «hai finito» senza doverci pensare. Partono sopra
    // il bordo, così entrano già cadendo invece di comparire dal nulla.
    const pezzi: Pezzo[] = []
    for (let i = 0; i < 150; i++) {
      pezzi.push({
        x: Math.random() * L,
        y: -20 - Math.random() * A * 0.55,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2.4 + Math.random() * 3.2,
        giro: Math.random() * Math.PI * 2,
        velGiro: (Math.random() - 0.5) * 0.3,
        largo: 5 + Math.random() * 5,
        alto: 8 + Math.random() * 6,
        colore: COLORI[(Math.random() * COLORI.length) | 0]
      })
    }

    let vivo = true
    const inizio = performance.now()

    const disegna = (ora: number) => {
      if (!vivo) return
      const passato = ora - inizio
      if (passato > DURATA) { vivo = false; finito(); return }

      ctx.clearRect(0, 0, L, A)
      // svaniscono verso la fine invece di sparire di colpo
      const resta = Math.min(1, (DURATA - passato) / 620)

      for (const p of pezzi) {
        p.vy += 0.05               // peso, poco: devono planare, non precipitare
        p.x += p.vx + Math.sin((p.y + p.giro * 40) / 46) * 0.8   // il pendolo della carta
        p.y += p.vy
        p.giro += p.velGiro

        ctx.save()
        ctx.globalAlpha = resta
        ctx.translate(p.x, p.y)
        ctx.rotate(p.giro)
        ctx.fillStyle = p.colore
        // il pezzo si assottiglia mentre gira: è quello che lo fa sembrare
        // un pezzetto di carta invece di un rettangolo che ruota
        ctx.fillRect(-p.largo / 2, -p.alto / 2, p.largo * Math.abs(Math.cos(p.giro)), p.alto)
        ctx.restore()
      }
      requestAnimationFrame(disegna)
    }
    const n = requestAnimationFrame(disegna)
    return () => { vivo = false; cancelAnimationFrame(n) }
  }, [quando, finito])

  if (!quando) return null
  return (
    <canvas
      ref={tela}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 70
      }} />
  )
}
