// La scatola in cui si scrive, una sola per tutta l'app.
//
// «Una barra sola» (21 set 2026): scrivere una riga si fa sempre nella stessa
// scatola. Era scritta dentro `oggi/Barra.tsx`, e la chat ne aveva una sua
// (raggio 20, bottone tondo di rame) che le somigliava senza essere lei. Qui
// sta la ricetta, e le due barre la prendono da qui: raggio 14, la carta
// all'86% col vetro, il bordo che si accende col fuoco, il bottone quadrato
// pieno a destra che si accende quando c'è qualcosa da mandare.

import type { CSSProperties } from 'react'

export function scatolaBarra(fuoco: boolean): CSSProperties {
  return {
    borderRadius: 14, background: 'rgba(var(--carta-rgb),.86)',
    backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
    border: `1px solid ${fuoco ? 'rgba(var(--inchiostro-rgb),.26)' : 'rgba(var(--luce-rgb),.9)'}`,
    boxShadow: fuoco ? '0 8px 26px rgba(var(--ombra-rgb),.10)' : '0 4px 16px rgba(var(--ombra-rgb),.05)',
    transition: 'border-color .15s, box-shadow .15s'
  }
}

/** Il bottone a destra: pieno quando fa qualcosa, spento quando non c'è niente da mandare. */
export function bottoneBarra(acceso: boolean, lato = 30): CSSProperties {
  return {
    width: lato, height: lato, flex: 'none', borderRadius: 10, border: 'none',
    background: acceso ? 'var(--pieno)' : 'rgba(var(--inchiostro-rgb),.07)',
    color: acceso ? 'var(--avorio)' : 'rgba(var(--inchiostro-rgb),.28)',
    display: 'grid', placeItems: 'center',
    cursor: acceso ? 'pointer' : 'default', fontFamily: 'inherit',
    transition: 'background .15s, color .15s'
  }
}
