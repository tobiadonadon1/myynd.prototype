// Il timone: come si indirizza Myynd.
//
// Il feed, da solo, è un monologo — legge i tuoi documenti e ti dice cosa
// pensa. Ma i documenti sono in ritardo sulla realtà quasi sempre: il deck è
// più avanti di come lo vede, la cosa è già stata mandata, quel cliente non
// conta più. Chi lo sa sei tu, e finora non c'era modo di dirglielo.
//
// Due modi, che è bene tenere distinti:
//
//   · rispondere a una voce — «questo è fatto», «l'ho aggiornato, non è sul
//     desktop». Riguarda quella cosa lì, e cambia subito la prima pagina.
//   · dare un fuoco — «questa settimana guarda solo i preventivi». Riguarda
//     tutto quello che verrà, e resta finché non lo cambi.
//
// Quello che dici qui non si perde in un menù di stati: resta con le tue
// parole, perché «l'ho già mandato ieri» dice molto più di «fatto».

import { nellaLingua } from './config.ts'
import { chiediJSON } from './modello.ts'
import * as store from './store.ts'

/** L'etichetta del blocco dove vive il fuoco: uno solo, si riscrive. */
const FUOCO = 'fuoco'

export function fuoco(): string {
  return store.blocchi().find(b => b.etichetta === FUOCO)?.valore ?? ''
}

export function scriviFuoco(testo: string) {
  store.scriviBlocco({
    etichetta: FUOCO,
    descrizione: 'Su cosa vuole che Myynd si concentri adesso.',
    valore: testo.trim(),
    tetto: 400
  })
}

export type Esito = {
  /** aperto = resta lì; fatto = sparisce fra le fatte; scartato = non ripropormelo. */
  stato: 'aperto' | 'fatto' | 'scartato' | 'piu_tardi'
  /** Le tue parole, ripulite: è questo che si rivede dopo, non l'etichetta. */
  motivo: string
  /** Vero se hai detto che il documento su cui si basa non è aggiornato. */
  fonteVecchia: boolean
  /** Una cosa da ricordare per sempre, se ce n'è una. */
  daRicordare: string
}

// Una funzione: `nellaLingua()` dentro un const di modulo si congela al
// caricamento, e la descrizione continuerebbe a chiedere l'italiano a chi ha
// scelto l'inglese finché non riavvia il server.
const schema = () => ({
  type: 'object',
  properties: {
    stato: {
      type: 'string',
      enum: ['aperto', 'fatto', 'scartato', 'piu_tardi'],
      description:
        "'fatto' se dice che è già stato fatto o mandato. 'scartato' se dice che non conta, " +
        "non è vero, o non gli interessa. 'piu_tardi' se lo rimanda. 'aperto' se sta solo " +
        'aggiungendo un dettaglio senza chiudere niente.'
    },
    motivo: {
      type: 'string',
      description:
        `Una riga sola, in ${nellaLingua()}, con le SUE parole quanto possibile: quello che ` +
        'rivedrà accanto alla voce fra un mese. Non «completato»: «l\'ho mandato lunedì».'
    },
    fonteVecchia: {
      type: 'boolean',
      description:
        'Vero solo se dice che il documento è vecchio, superato, o che la versione buona ' +
        'sta altrove — non semplicemente che il compito è finito.'
    },
    daRicordare: {
      type: 'string',
      description:
        'Se ha detto qualcosa di valido oltre questa voce — una preferenza, una regola, ' +
        'come lavora — mettila qui in una frase al presente. Vuota se non c\'è niente: ' +
        'una stringa vuota è una risposta giusta e frequente.'
    }
  },
  required: ['stato', 'motivo', 'fonteVecchia', 'daRicordare'],
  additionalProperties: false
})

const ISTRUZIONI = `Stai leggendo la risposta di una persona a una voce del suo feed.

Il tuo compito è capire cosa vuole che succeda a quella voce, non giudicare se ha
ragione. Lei sa com'è andata; il documento su cui la voce è nata quasi sempre no.

Sul motivo: tienilo con le sue parole. «Fatto» non dice niente fra un mese;
«l'ho mandato lunedì con il listino nuovo» sì.

Sul ricordare: solo quello che varrà ancora fra mesi e che non sta già scritto in
un documento. «Il deck è a metà» è un fatto di oggi, non si ricorda. «Non vuole
essere avvisata dei rinnovi sotto i mille euro» è una regola, si ricorda. Nel
dubbio, lascia vuoto.`

/**
 * Capisce cosa vuoi da una voce e lo esegue: cambia lo stato, tiene il perché,
 * e — solo se c'era qualcosa che vale oltre oggi — lo affida alla memoria.
 *
 * Se Claude non è collegato non si blocca: la voce si chiude comunque con le
 * tue parole come motivo. Una risposta scritta non deve andare persa perché
 * manca una chiave API.
 */
export async function rispondiAVoce(id: string, risposta: string, statoDato?: string): Promise<Esito> {
  const voce = store.voceFeed(id)
  const pulita = risposta.trim()
  if (!pulita) throw new Error('Scrivi qualcosa.')

  // Se lo stato arriva già deciso — è un tocco su una delle risposte pronte,
  // non una frase da interpretare — non si disturba il modello. È istantaneo,
  // non costa niente, e su una cosa che si fa dieci volte al giorno la
  // differenza fra "subito" e "un secondo e mezzo" è tutto.
  if (statoDato) {
    // 'fonte_vecchia' non è uno stato del feed, è una *ragione*: la voce si
    // chiude come le altre, ma segnala anche che l'indice è indietro
    const fonteVecchia = statoDato === 'fonte_vecchia'
    const stato: Esito['stato'] =
      fonteVecchia ? 'fatto'
      : statoDato === 'piu_tardi' ? 'aperto'
      : (['aperto', 'fatto', 'scartato'].includes(statoDato) ? statoDato : 'fatto') as Esito['stato']
    store.cambiaStatoFeed(id, stato, pulita)
    return { stato, motivo: pulita, fonteVecchia, daRicordare: '' }
  }

  /** Senza modello, o se non ci riesce: si prende alla lettera. Meglio grezzo che perso. */
  const allaLettera = (): Esito => {
    store.cambiaStatoFeed(id, 'fatto', pulita)
    return { stato: 'fatto', motivo: pulita, fonteVecchia: false, daRicordare: '' }
  }
  if (!voce) return allaLettera()

  const esito = await chiediJSON<Esito>({
    lavoro: 'giudizio',
    max_tokens: 1000,
    system: ISTRUZIONI,
    formato: schema(),
    messages: [{
      role: 'user',
      content:
        `La voce diceva:\n` +
        `tipo: ${voce.tipo}\n` +
        `titolo: ${voce.titolo}\n` +
        `testo: ${voce.testo}\n` +
        (voce.urgenza ? `urgenza: ${voce.urgenza}\n` : '') +
        `\nLei ha risposto:\n${pulita}`
    }]
  })
  // uno stato fuori dall'elenco è peggio di nessuno stato: la voce finirebbe
  // in un limbo da cui non esce più
  if (!esito || !['aperto', 'fatto', 'scartato', 'piu_tardi'].includes(esito.stato)) return allaLettera()

  const motivo = esito.motivo?.trim() || pulita
  // 'scartato' e 'piu_tardi' non sono 'fatto': la prima sparisce e non torna,
  // la seconda deve poter ricomparire domani
  const stato = esito.stato === 'piu_tardi' ? 'aperto' : esito.stato
  store.cambiaStatoFeed(id, stato, motivo)

  if (esito.daRicordare?.trim()) {
    store.ricorda({
      enunciato: esito.daRicordare.trim(),
      ambito: 'persona',
      genere: 'esplicita',   // te l'ha detto lei, rispondendo
      fiducia: 0.95,
      prova: { doc: voce.doc ?? undefined, citazione: pulita },
      origine: 'feed'
    })
  }

  return { ...esito, motivo, stato: stato as Esito['stato'] }
}
