// La richiesta per l'amministratore, già scritta.
//
// Quando a chiudere la porta è l'azienda, chi collega non può fare niente da
// solo: può solo chiedere. E la richiesta è il punto in cui queste cose si
// arenano — «cosa devo abilitare?», «cosa legge quell'app?», «dove finiscono
// i dati?» — cioè le tre domande che un amministratore fa sempre, e a cui chi
// chiede quasi mai sa rispondere. Qui sono scritte tutte e tre, più la voce
// esatta della console che va cambiata, così che il messaggio si possa
// mandare così com'è e l'amministratore possa fare quello che serve senza
// scrivere indietro.
//
// Il testo è nella lingua dell'interfaccia di chi la manda: le coppie
// `{ it, en }` sono come quelle dell'aiuto, perché un testo lungo non sta nel
// dizionario. Le voci delle console restano come le mostrano Google,
// Microsoft e GitHub, che sono le parole che l'amministratore cercherà.

import type { CasoAmministratore, ServizioAmministrato } from '../server/connettori/amministratore.ts'

type Due = { it: string; en: string }

/** L'oggetto della mail: cosa si chiede, e che è in sola lettura. */
const OGGETTO: Record<ServizioAmministrato, Due> = {
  'gmail': { it: 'Richiesta: permettere a Myynd di leggere la mia posta Gmail', en: 'Request: let Myynd read my Gmail' },
  'calendario': { it: 'Richiesta: permettermi di collegare la mia agenda a Myynd (sola lettura)', en: 'Request: let me connect my calendar to Myynd (read-only)' },
  'google-oauth': { it: 'Richiesta: approvare Myynd nel nostro Google Workspace', en: 'Request: approve Myynd in our Google Workspace' },
  'microsoft-oauth': { it: 'Richiesta: consenso dell’amministratore per Myynd in Microsoft 365 (sola lettura)', en: 'Request: admin consent for Myynd in Microsoft 365 (read-only)' },
  'github-org': { it: 'Richiesta: approvare il mio token GitHub per Myynd (sola lettura)', en: 'Request: approve my GitHub token for Myynd (read-only)' }
}

/** Cosa si vuole collegare, e perché serve lui. */
const PERCHE: Record<ServizioAmministrato, Due> = {
  'gmail': { it: 'vorrei collegare la mia posta Gmail di lavoro a Myynd, un assistente che uso per il mio lavoro. Le impostazioni del nostro Google Workspace per ora non lo permettono.', en: 'I would like to connect my work Gmail to Myynd, an assistant app I use for my work. Our Google Workspace settings do not allow it at the moment.' },
  'calendario': { it: 'vorrei collegare la mia agenda di lavoro a Myynd, un assistente che uso per il mio lavoro. Le nostre impostazioni non mi lasciano condividere l’agenda con il suo indirizzo privato.', en: 'I would like to connect my work calendar to Myynd, an assistant app I use for my work. Our settings do not let me share my calendar through its private address.' },
  'google-oauth': { it: 'vorrei collegare il mio account Google di lavoro a Myynd, un assistente che uso per il mio lavoro. Google dice che la nostra organizzazione deve prima approvare l’app.', en: 'I would like to connect my work Google account to Myynd, an assistant app I use for my work. Google says our organization has to approve the app first.' },
  'microsoft-oauth': { it: 'vorrei collegare il mio account Microsoft 365 di lavoro a Myynd, un assistente che uso per il mio lavoro. Microsoft dice che un amministratore deve prima approvare l’app.', en: 'I would like to connect my work Microsoft 365 account to Myynd, an assistant app I use for my work. Microsoft says an administrator has to approve the app first.' },
  'github-org': { it: 'vorrei collegare i repository GitHub della nostra organizzazione a Myynd, un assistente che uso per il mio lavoro. Ho creato un token a grana fine per l’organizzazione, e serve l’approvazione di un amministratore.', en: 'I would like to connect our organization’s GitHub repositories to Myynd, an assistant app I use for my work. I created a fine-grained personal access token for the organization, and it needs an owner’s approval.' }
}

/** Cosa legge, detto con il nome della strada: è la cosa che l'amministratore valuta. */
const LEGGE: Record<ServizioAmministrato, Due> = {
  'gmail': { it: 'i messaggi della mia casella, via IMAP, con una password per le app', en: 'the messages in my own mailbox, over IMAP, with an app password' },
  'calendario': { it: 'gli eventi della mia agenda, dal suo indirizzo privato in formato iCal', en: 'the events in my own calendar, from its private iCal address' },
  'google-oauth': { it: 'la mia posta, la mia agenda e i miei file, con l’accesso di Google', en: 'my own mail, calendar and files, through Google sign-in' },
  'microsoft-oauth': { it: 'la mia posta, la mia agenda e i miei file, con l’accesso di Microsoft', en: 'my own mail, calendar and files, through Microsoft sign-in' },
  'github-org': { it: 'pull request, issue e commit', en: 'pull requests, issues and commits' }
}

/**
 * Cosa può fare con quell'accesso, detto esatto.
 *
 * «In sola lettura» per tutti sarebbe stato più corto e falso due volte: via
 * IMAP Myynd salva le bozze e archivia i messaggi quando la persona preme il
 * bottone, e il consenso di Google chiede `gmail.modify` e `calendar.events`
 * (`google.ts`). Un amministratore che legge «sola lettura» e poi vede quei
 * permessi smette di fidarsi di tutta la richiesta. Dove l'accesso è davvero
 * di sola lettura — l'indirizzo iCal, i permessi di Microsoft, il token di
 * GitHub — lo si dice con i nomi dei permessi.
 */
const ACCESSO: Record<ServizioAmministrato, Due> = {
  'gmail': { it: '. Non manda, non sposta e non cancella niente da solo: una bozza o un messaggio archiviato solo quando premo io un bottone nell’app.', en: '. It never sends, moves or deletes anything on its own: a draft or an archived message only happens when I press a button in the app.' },
  'calendario': { it: '. In sola lettura: l’indirizzo privato non permette di cambiare niente.', en: '. Read-only: the private address cannot change anything.' },
  'google-oauth': { it: '. Chiede a Google gmail.modify e calendar.events, e li usa solo quando premo io un bottone nell’app: da solo non manda, non sposta e non cancella niente.', en: '. It asks Google for gmail.modify and calendar.events, and uses them only when I press a button in the app: on its own it never sends, moves or deletes anything.' },
  'microsoft-oauth': { it: '. Permessi di sola lettura: Mail.Read e Calendars.Read, e per i file Files.Read.All e Sites.Read.All.', en: '. Read-only permissions: Mail.Read and Calendars.Read, and for files Files.Read.All and Sites.Read.All.' },
  'github-org': { it: '. Permessi di sola lettura: Contents, Issues, Pull requests e Metadata.', en: '. Read-only permissions: Contents, Issues, Pull requests and Metadata.' }
}

/** La voce esatta da cambiare, con i nomi che mostra la console. */
function cosaCambiare(caso: CasoAmministratore): Due {
  switch (caso.servizio) {
    case 'gmail': return {
      it: 'nella Console di amministrazione Google, Apps › Google Workspace › Gmail › End User Access › POP and IMAP access: attivare «Enable IMAP access for all users» e scegliere «Allow any mail client». Le password per le app vogliono anche la verifica in due passaggi: Security › Authentication › 2-step verification › «Allow users to turn on 2-Step Verification».',
      en: 'in the Google Admin console, Apps › Google Workspace › Gmail › End User Access › POP and IMAP access: turn on “Enable IMAP access for all users” and choose “Allow any mail client”. App passwords also need 2-Step Verification: Security › Authentication › 2-step verification › “Allow users to turn on 2-Step Verification”.'
    }
    case 'calendario': return {
      it: 'con Google Workspace, Admin console › Apps › Google Workspace › Calendar › Sharing settings › «External sharing options for primary calendars»: scegliere una delle opzioni «Share all information». Con Microsoft 365, Exchange admin center › Organization › Sharing › Individual Sharing: aggiungere il dominio «Anonymous» ai miei criteri di condivisione, così compare «Publish a calendar».',
      en: 'with Google Workspace, Admin console › Apps › Google Workspace › Calendar › Sharing settings › “External sharing options for primary calendars”: choose one of the “Share all information” options. With Microsoft 365, Exchange admin center › Organization › Sharing › Individual Sharing: add the “Anonymous” domain to my sharing policy, so that “Publish a calendar” appears.'
    }
    case 'google-oauth': {
      const id = caso.app ? ` (${caso.app})` : ''
      return {
        it: `Admin console › Security › Access and data control › API controls › Manage Third-Party App Access › «Configure new app»: cercare Myynd${id} e impostarla su «Trusted».`,
        en: `Admin console › Security › Access and data control › API controls › Manage Third-Party App Access › “Configure new app”: search for Myynd${id} and set it to “Trusted”.`
      }
    }
    case 'microsoft-oauth': {
      const url = caso.consenso ?? ''
      if (url) return {
        it: `aprire questo indirizzo con un account da amministratore e accettare: ${url}`,
        en: `open this link with an administrator account and accept: ${url}`
      }
      return {
        it: 'Microsoft Entra admin center › Enterprise applications › Myynd › Permissions › «Grant admin consent».',
        en: 'Microsoft Entra admin center › Enterprise applications › Myynd › Permissions › “Grant admin consent”.'
      }
    }
    case 'github-org': return {
      it: 'Organization settings › Personal access tokens › Pending requests: approvare il mio token che si chiama «Myynd».',
      en: 'Organization settings › Personal access tokens › Pending requests: approve my token named “Myynd”.'
    }
  }
}

/** Le righe fisse della richiesta, nelle due lingue. */
const SALUTO: Due = { it: 'Ciao,', en: 'Hi,' }
const COSA_LEGGE: Due = { it: 'Cosa legge Myynd: ', en: 'What Myynd reads: ' }
const DOVE_RESTANO: Due = { it: 'Dove restano i dati: ', en: 'Where the data stays: ' }
const COSA_CAMBIARE: Due = { it: 'Cosa va cambiato: ', en: 'What needs to change: ' }
const GRAZIE: Due = { it: 'Grazie.', en: 'Thank you.' }
const IN_CASA: Due = {
  it: 'sul mio computer. Quando chiedo qualcosa a Myynd, solo i passaggi che servono vanno al modello di intelligenza artificiale che ho collegato.',
  en: 'on my computer. When I ask Myynd something, only the passages it needs go to the AI model I have connected.'
}
function ospitatoSu(host: string): Due {
  return {
    it: `nel mio account sul server Myynd di ${host}. Quando chiedo qualcosa a Myynd, solo i passaggi che servono vanno al modello di intelligenza artificiale collegato.`,
    en: `in my account on the Myynd server at ${host}. When I ask Myynd something, only the passages it needs go to the AI model connected to it.`
  }
}

export type Richiesta = { oggetto: string; corpo: string }

/**
 * La richiesta intera: oggetto e corpo.
 *
 * `ospitato` cambia una riga sola, quella che dice dove restano i dati: in
 * casa restano su questo computer, ospitati stanno sul server di chi ospita.
 * È la riga su cui un amministratore si ferma, e deve essere vera.
 */
export function richiestaAmministratore(caso: CasoAmministratore, o: { inglese: boolean; ospitato?: string | null }): Richiesta {
  const l = (d: Due) => o.inglese ? d.en : d.it
  const dominio = caso.dominio ? ` (${caso.dominio})` : ''
  const righe = [
    l(SALUTO),
    '',
    l(PERCHE[caso.servizio]) + dominio,
    '',
    l(COSA_LEGGE) + l(LEGGE[caso.servizio]) + l(ACCESSO[caso.servizio]),
    l(DOVE_RESTANO) + l(o.ospitato ? ospitatoSu(o.ospitato) : IN_CASA),
    l(COSA_CAMBIARE) + l(cosaCambiare(caso)),
    '',
    l(GRAZIE)
  ]
  return { oggetto: l(OGGETTO[caso.servizio]), corpo: righe.join('\n') }
}

/**
 * La mail già pronta nel programma di posta, senza destinatario.
 *
 * L'indirizzo dell'amministratore Myynd non lo sa, e non deve provare a
 * indovinarlo: lo scrive chi manda. Gli a capo vanno come `%0D%0A`, che è
 * quello che i programmi di posta si aspettano dentro un `mailto:`.
 */
export function mailto(r: Richiesta): string {
  const cod = (s: string) => encodeURIComponent(s).replace(/%0A/g, '%0D%0A')
  return `mailto:?subject=${cod(r.oggetto)}&body=${cod(r.corpo)}`
}

/** Il caso che un errore del server porta con sé, se lo porta. */
export function casoDaErrore(e: unknown): CasoAmministratore | null {
  const c = (e as { amministratore?: unknown } | null)?.amministratore
  return c && typeof c === 'object' && typeof (c as { servizio?: unknown }).servizio === 'string' ? c as CasoAmministratore : null
}
