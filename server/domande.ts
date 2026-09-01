// Quando Myynd chiede.
//
// È la parte più facile da sbagliare di tutto il prodotto, e si sbaglia sempre
// nella stessa direzione: chiedendo troppo. Un assistente che domanda a ogni
// gesto diventa rumore in una settimana, e da lì non torna più — chiuderesti
// l'app e avresti ragione.
//
// Quindi il valore di questo file non è la domanda: è tutto quello che c'è
// prima, e che serve a *non* farla. Cinque cancelli, in ordine di costo:
//
//   1. c'è una ricorrenza? uno scarto è rumore, tre sono un segnale
//   2. è davvero ambigua? se il perché l'hai già scritto, non si chiede
//   3. si può dedurre invece di chiedere? allora si deduce e basta
//   4. il budget lo consente? una domanda per volta, e non più di una a settimana
//   5. su questo tema si è già chiesto? allora mai più, per sempre
//
// Solo chi passa tutti e cinque diventa una domanda. In pratica: pochissime.

import { nellaLingua } from './config.ts'
import { chiediJSON } from './modello.ts'
import * as store from './store.ts'

/**
 * Quanti scarti muti sullo stesso tema prima di considerarlo un segnale.
 *
 * Tre è il valore giusto per l'uso vero: sotto, si scambia il rumore per un
 * segnale. Si può abbassare con MYYND_RICORRENZE per vedere il meccanismo
 * scattare senza aspettare due settimane di uso — serve a guardarlo, non a
 * cambiarlo.
 */
const RICORRENZE = Number(process.env.MYYND_RICORRENZE) || 3

/** Il respiro fra una domanda e l'altra. Sette giorni non è timidezza: è il
 *  numero che decide se dopo un mese l'app è ancora aperta. */
const GIORNI_FRA_DOMANDE = 7

// Una funzione, non un const: `nellaLingua()` in cima al modulo si congela al
// caricamento e la domanda continuerebbe a nascere in italiano per chi ha
// scelto l'inglese.
const schema = () => ({
  type: 'object',
  properties: {
    vaChiesto: {
      type: 'boolean',
      description:
        'Falso se dai titoli si capisce già perché li scarta — in quel caso la ' +
        'domanda è una seccatura e la deduzione basta. Vero solo se il motivo è ' +
        'davvero opaco e la risposta cambierebbe cosa gli proponi.'
    },
    deduzione: {
      type: 'string',
      description:
        'Se vaChiesto è falso: la conclusione che tiri da solo, una frase al ' +
        'presente, come una convinzione su come lavora. Vuota se vaChiesto è vero.'
    },
    domanda: {
      type: 'string',
      description:
        `Se vaChiesto è vero: UNA domanda, in ${nellaLingua()}, breve, concreta, che si ` +
        'possa liquidare in cinque parole. Nomina la cosa vera che ha scartato, ' +
        'non l\'astrazione. Niente preamboli, niente scuse, niente «ho notato che ' +
        'forse potrebbe darsi». Vuota se vaChiesto è falso.'
    }
  },
  required: ['vaChiesto', 'deduzione', 'domanda'],
  additionalProperties: false
})

const ISTRUZIONI = `Una persona continua a togliere di mezzo le stesse cose senza dire perché.

Il tuo compito è decidere se vale la pena chiederglielo — e la risposta giusta è
quasi sempre NO. Chiedere costa la sua attenzione; dedurre non costa niente.

Chiedi solo se tutte e tre valgono:
— dai titoli non si capisce cosa abbiano in comune, o si capisce ma non perché
  non gli interessino;
— la risposta cambierebbe davvero cosa gli proponi domani;
— non è una cosa che chiunque scarterebbe (le notifiche di sistema, i rinnovi
  automatici, le newsletter: quelle si deducono).

Se invece è leggibile — sono tutte dello stesso cliente, o dello stesso tipo, o
è chiaro che se ne occupa qualcun altro — non chiedere: scrivi la deduzione.

La domanda, se la fai, deve suonare come un collega che alza la testa dalla
scrivania, non come un modulo. Una sola, corta, e che si possa liquidare in
cinque parole.

NON INVENTARE NIENTE. Nomi di persone, di clienti, di strumenti, ruoli, squadre:
puoi usare solo quelli che compaiono nei titoli che ti ho dato. Se non sai chi
altro potrebbe occuparsene, non tirare fuori un nome — chiedi in modo aperto
(«di chi è adesso?», «lo segui ancora?»). Una domanda che nomina un collega che
non esiste è peggio di nessuna domanda: si perde la fiducia in un colpo solo, e
non torna.`

export type Proposta = { chiesta: boolean; deduzione?: string }

/**
 * Guarda se c'è qualcosa che vale la pena chiedere, e nel caso lo apre.
 *
 * Gira dopo la lettura del feed, mai davanti a un'attesa dell'utente: se non
 * conclude niente non se ne accorge nessuno, ed è il caso normale.
 */
/**
 * Un messaggio nella chat, da Myynd.
 *
 * Vive in una conversazione sola, che si chiama come lui: è il posto dove ti
 * scrive quando ha notato qualcosa. Non è una notifica — non suona, non salta
 * davanti — è una riga che trovi quando apri la chat, come un collega educato.
 */
function scriviInChat(testo: string) {
  const CHAT = 'myynd'
  if (!store.esisteChat(CHAT)) store.creaChat(CHAT, 'Myynd')
  store.salvaMessaggio({
    id: `mm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    chat: CHAT,
    ruolo: 'a',
    testo
  })
}

export async function forseChiedi(): Promise<Proposta> {
  // 1 · c'è già una domanda in giro? allora si tace
  if (store.domandaAperta()) return { chiesta: false }

  // 2 · il budget
  const ultima = store.ultimaDomanda()
  if (ultima) {
    const giorni = (Date.now() - Date.parse(ultima)) / 86_400_000
    if (giorni < GIORNI_FRA_DOMANDE) return { chiesta: false }
  }

  // 3 · c'è una ricorrenza, e non è già stata affrontata?
  const temi = store.temiScartati(RICORRENZE).filter(t => !store.domandaGiaFatta(t.tema))
  if (!temi.length) return { chiesta: false }
  const tema = temi[0]

  /**
   * «Mai piu, per sempre» vale per la cosa, non per la parola.
   *
   * `domande.tema` è unico, e questo bastava a non chiedere due volte sulla
   * stessa *radice*. Ma le stesse identiche voci scartate producono più
   * radici — «fattura», «rinnovo», «abbonamento» sullo stesso gruppo di
   * voci — e ognuna è un tema diverso. Quindi chiedeva, la settimana dopo
   * ripescava le stesse voci sotto un'altra radice, e richiedeva. Da fuori
   * si vede una cosa sola: un assistente che continua a domandare della
   * stessa roba a cui hai già risposto, che è il modo più rapido di farsi
   * chiudere.
   *
   * Qui si segnano affrontate anche le radici che coprono le stesse voci.
   */
  const chiudiIVicini = () => {
    const sue = new Set(tema.ids)
    for (const altro of temi) {
      if (altro.tema === tema.tema) continue
      const comuni = altro.ids.filter(i => sue.has(i)).length
      // la maggioranza delle voci in comune: è la stessa domanda con
      // un'altra parola davanti
      if (!altro.ids.length || comuni / altro.ids.length < 0.6) continue
      const a = store.apriDomanda({ tema: altro.tema, testo: tema.tema, spunto: altro.titoli })
      if (a) store.chiudiDomanda(a.id, 'ignorata', undefined, 'stessa cosa di «' + tema.tema + '»')
    }
  }

  const e = await chiediJSON<{ vaChiesto: boolean; deduzione: string; domanda: string }>({
    lavoro: 'giudizio',
    max_tokens: 700,
    system: ISTRUZIONI,
    formato: schema(),
    messages: [{
      role: 'user',
      content:
        `Ha tolto di mezzo queste ${tema.quanti} voci senza spiegare perché:\n` +
        tema.titoli.map(t => `— ${t}`).join('\n') +
        `\n\nHanno in comune la radice «${tema.tema}».`
    }]
  })
  if (!e) return { chiesta: false }

  // 4 · si può dedurre? allora si deduce, e non si disturba nessuno
  if (!e.vaChiesto || !e.domanda?.trim()) {
    if (e.deduzione?.trim()) {
      store.ricorda({
        enunciato: e.deduzione.trim(),
        ambito: 'persona',
        genere: 'indotta',            // l'ha notata lui, non gliel'ha detta lei
        fiducia: 0.55,
        premesse: tema.titoli.slice(0, 5),
        origine: 'scarti'
      })
      // anche quello che ha capito da solo glielo si dice: un sistema che
      // impara in silenzio è indistinguibile da uno che non impara
      scriviInChat(`Ho notato una cosa: ${e.deduzione.trim()} Me la segno, e smetto di riproportela.`)
      // il tema si segna come già affrontato: dedotto una volta, basta.
      // `apriDomanda` può tornare null se il tema c'era già — e chiudere la
      // stringa vuota non chiude niente, ma non rompe nulla: il controllo qui
      // sotto evita di chiamarla per niente.
      const aperta = store.apriDomanda({ tema: tema.tema, testo: e.deduzione.trim(), spunto: tema.titoli })
      if (aperta) store.chiudiDomanda(aperta.id, 'ignorata', undefined, 'dedotta senza chiedere')
      chiudiIVicini()
      return { chiesta: false, deduzione: e.deduzione.trim() }
    }
    return { chiesta: false }
  }

  // 5 · passa tutto: si chiede — e la domanda arriva anche in chat, come un
  // messaggio suo. Nel feed la si può non vedere per giorni; in chat è un
  // collega che ti scrive, ed è così che deve sembrare.
  //
  // Si scrive in chat solo se la domanda è stata davvero aperta: `apriDomanda`
  // torna null quando il tema era già stato chiesto, e in quel caso un
  // messaggio in chat sarebbe una domanda che non esiste da nessun'altra parte
  // e a cui non si può rispondere.
  const aperta = store.apriDomanda({ tema: tema.tema, testo: e.domanda.trim(), spunto: tema.titoli })
  if (!aperta) return { chiesta: false }
  chiudiIVicini()
  scriviInChat(e.domanda.trim())
  return { chiesta: true }
}

/**
 * La risposta. Qui si chiude il cerchio — ed è il pezzo che decide se il
 * meccanismo è intelligente o solo chiacchierone: da quello che dici deve
 * uscire una convinzione, e l'esito va restituito a parole, perché tu possa
 * vedere *cosa è cambiato*. Se rispondere non cambia niente di visibile, non
 * risponderai mai più — e avresti ragione.
 */
export async function rispondiADomanda(id: string, risposta: string): Promise<{ esito: string }> {
  const aperta = store.domandaAperta()
  const pulita = risposta.trim()
  if (!pulita) throw new Error('Scrivi qualcosa.')

  const segnatoEStop = () => {
    store.chiudiDomanda(id, 'risposta', pulita, 'Me lo sono segnato.')
    return { esito: 'Me lo sono segnato.' }
  }
  if (!aperta || aperta.id !== id) return segnatoEStop()

  const SCHEMA_R = {
    type: 'object',
    properties: {
      convinzione: {
        type: 'string',
        description: 'Quello che hai imparato, una frase al presente, che varrà ancora fra mesi.'
      },
      esito: {
        type: 'string',
        description:
          'Cosa cambia da adesso, detto a lei in una riga e al futuro concreto: ' +
          '«Da adesso i rinnovi sotto i mille euro non te li porto più». Deve poter ' +
          'controllare che sia successo davvero.'
      }
    },
    required: ['convinzione', 'esito'],
    additionalProperties: false
  } as const

  const e = await chiediJSON<{ convinzione: string; esito: string }>({
    lavoro: 'giudizio',
    max_tokens: 700,
    system:
      `Hai chiesto una cosa e ti hanno risposto. Tira fuori la regola che ne ` +
      `deriva e di' cosa cambia da adesso. Concreto: chi legge deve poter ` +
      `verificare fra una settimana che sia successo davvero. Scrivi in ${nellaLingua()}.`,
    formato: SCHEMA_R,
    messages: [{ role: 'user', content: `Domanda: ${aperta.testo}\nRisposta: ${pulita}` }]
  })
  if (!e) return segnatoEStop()

  if (e.convinzione?.trim()) {
    store.ricorda({
      enunciato: e.convinzione.trim(),
      ambito: 'persona',
      genere: 'esplicita',          // gliel'ha detto lei, rispondendo
      fiducia: 0.95,
      prova: { citazione: pulita },
      origine: 'domanda'
    })
  }
  const esito = e.esito?.trim() || 'Me lo sono segnato.'
  store.chiudiDomanda(id, 'risposta', pulita, esito)
  return { esito }
}

/** Lasciarla cadere è una risposta anche quella, e non si ripropone. */
export function ignora(id: string) {
  store.chiudiDomanda(id, 'ignorata', undefined, 'lasciata cadere')
}
