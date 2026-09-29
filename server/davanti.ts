// Chi ha usato per ultimo la finestra di questo Mac.
//
// Una cosa sola, e non per richiesta: serve alla barra dei menu, che non
// porta con sé un gettone e non sa di chi è il clic. «Stop the night shift»
// fermava il turno di tutti i conti del Mac quando nessuno aveva acceso
// l'osservatore; adesso ferma quello di chi c'era davanti per ultimo. Non
// decide niente su dati di nessuno: dice solo a chi appartiene il Mac adesso.

let ultimo: string | null = null

/** La guardia lo segna a ogni richiesta con una sessione (non con un gettone a ambito). */
export function segna(utente: string): void { ultimo = utente }

/** Chi c'era davanti per ultimo, se qualcuno c'è stato da quando l'app è partita. */
export function chi(): string | null { return ultimo }

/** Solo per le prove. */
export function azzera(): void { ultimo = null }
