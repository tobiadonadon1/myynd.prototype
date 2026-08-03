/**
 * `preparing` è un campo additivo lato motore su `DashboardState`, vero
 * mentre le bozze si rigenerano in background (dopo una modifica al
 * corpus, per 40-90s). Va letto in modo difensivo — con un'intersezione
 * locale invece di assumere che `@shared/types` lo dichiari già — così
 * questo file compila anche se il tipo condiviso non è ancora stato
 * aggiornato, e continua a funzionare identico quando lo sarà (la forma è
 * la stessa, un opzionale in più non è mai un conflitto strutturale).
 */
import type { DashboardState } from '@shared/types'

type DashboardStateConPreparazione = DashboardState & { preparing?: boolean }

export function inPreparazione(stato: DashboardState): boolean {
  return (stato as DashboardStateConPreparazione).preparing === true
}

/**
 * Vero quando la dashboard mostra davvero lo stato finale: il modello
 * pronto da solo non basta — se le bozze si stanno ancora rigenerando in
 * background la lista d'attesa (e il conteggio/punto nel rail, che
 * dipendono dagli stessi dati) non riflette ancora la realtà. Un sondaggio
 * che si fermasse al primo "modello pronto" smetterebbe di aggiornare
 * proprio mentre l'unica cosa che conta — quante proposte aspettano —
 * cambia da 0 a qualcosa 40-90s dopo.
 */
export function dashboardPronta(stato: DashboardState): boolean {
  return stato.model.ready && !inPreparazione(stato)
}

/**
 * Budget per il sondaggio della dashboard: deve coprire non solo lo spawn
 * a freddo del modello (~7s) ma anche l'intera finestra di rigenerazione
 * delle bozze (40-90s documentati), con margine — altrimenti il sondaggio
 * si arrende proprio mentre `preparing` è ancora vero, e la schermata
 * resta bloccata su "sto preparando" anche quando il lavoro è pronto da
 * tempo.
 */
export const BUDGET_DASHBOARD_PRONTA = { attempts: 60, intervalMs: 2000 } as const
