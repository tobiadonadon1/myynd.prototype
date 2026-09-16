/**
 * Le prime parole di Myynd quando lui preme «Parliamone» su un progetto.
 *
 * Prima il bottone apriva una chat nuova con un *suo* messaggio già scritto
 * nel campo — «Let's discuss «Myynd». The saved goal is: «…»» — che lui
 * doveva mandare: una frase non sua, con le virgolette a caporale, che il
 * campo non riusciva nemmeno a mostrare per intero. «Preferirei che Myynd mi
 * scrivesse: parliamone, qual è il tuo obiettivo, su cosa stai lavorando
 * adesso.» Quindi scrive lui, per primo: un messaggio scritto qui, non
 * generato, perché deve arrivare all'istante e anche senza un modello, e
 * poi la conversazione va avanti come tutte le altre.
 *
 * Tre aperture, per i tre motivi per cui una carta compare: manca un passo
 * concordato, c'è un passo aperto, oppure i passi sono fatti e l'obiettivo
 * è ancora attivo. Niente lineette: è testo che parla con lui.
 */
import type { ProjectInitiative } from './project-initiative.ts'

export function aperturaProgetto(item: ProjectInitiative, lingua: 'it' | 'en'): string {
  const it = lingua === 'it'
  const nome = item.projectName
  const obiettivo = item.goal.trim()
  const apertura = it ? `Parliamo di ${nome}.` : `Let’s talk about ${nome}.`
  const scritto = obiettivo
    ? (it ? `L’obiettivo che hai scritto è: “${obiettivo}”.` : `The goal you wrote down is: “${obiettivo}”.`)
    : (it ? 'Non ho ancora un obiettivo scritto per questo progetto.' : 'I don’t have a written goal for this project yet.')
  if (item.taskId) {
    const passo = item.title.trim()
    return [apertura, scritto,
      it ? `C’è un passo aperto: “${passo}”. A che punto è, e come vuoi procedere?`
        : `There’s an open step: “${passo}”. Where does it stand, and how do you want to proceed?`
    ].join(' ')
  }
  // la carta lo dice nel perché: «passi segnati come fatti». Non nella
  // domanda: tutte e due le domande finiscono con «completato»
  if (item.kind === 'question' && /marked done|segnati come fatti/i.test(item.description)) {
    return [apertura, scritto,
      it ? 'Alcuni passi sono segnati come fatti. L’obiettivo è raggiunto, o cosa resta da fare?'
        : 'Some steps are marked done. Is the goal reached, or what remains to be done?'
    ].join(' ')
  }
  return [apertura, scritto,
    it ? 'Su cosa stai lavorando adesso? E qual è il prossimo risultato concreto che vuoi ottenere?'
      : 'What are you working on right now? And what’s the next concrete result you want to reach?'
  ].join(' ')
}
