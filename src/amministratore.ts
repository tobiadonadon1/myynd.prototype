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

/** L'oggetto della mail: cosa si chiede. «Sola lettura» solo dove lo è davvero. */
const OGGETTO: Record<ServizioAmministrato, Due> = {
  'gmail': { it: 'Richiesta: collegare Myynd alla mia posta Gmail', en: 'Request: connect Myynd to my Gmail' },
  'calendario': { it: 'Richiesta: collegare la mia agenda a Myynd (sola lettura)', en: 'Request: connect my calendar to Myynd (read-only)' },
  'google-oauth': { it: 'Richiesta: approvare Myynd nel nostro Google Workspace', en: 'Request: approve Myynd in our Google Workspace' },
  'microsoft-oauth': { it: 'Richiesta: consenso dell’amministratore per Myynd in Microsoft 365 (sola lettura)', en: 'Request: admin consent for Myynd in Microsoft 365 (read-only)' },
  'microsoft-assegnazione': { it: 'Richiesta: assegnarmi Myynd in Microsoft Entra (sola lettura)', en: 'Request: assign Myynd to me in Microsoft Entra (read-only)' },
  'microsoft-accesso': { it: 'Richiesta: permettere il mio accesso a Myynd in Microsoft 365 (sola lettura)', en: 'Request: allow my sign-in to Myynd in Microsoft 365 (read-only)' },
  'github-org': { it: 'Richiesta: approvare il mio token GitHub per Myynd (sola lettura)', en: 'Request: approve my GitHub token for Myynd (read-only)' }
}

/**
 * Cosa si vuole collegare, e perché serve lui. `{d}` è dove va il dominio
 * dell'azienda, accanto all'account: in fondo alla frase, dopo il punto,
 * sembrava una nota dimenticata.
 */
const PERCHE: Record<ServizioAmministrato, Due> = {
  'gmail': { it: 'vorrei collegare la mia posta Gmail di lavoro{d} a Myynd, un assistente che uso per il mio lavoro. Le impostazioni del nostro Google Workspace per ora non lo permettono.', en: 'I would like to connect my work Gmail{d} to Myynd, an assistant app I use for my work. Our Google Workspace settings do not allow it at the moment.' },
  'calendario': { it: 'vorrei collegare la mia agenda di lavoro{d} a Myynd, un assistente che uso per il mio lavoro. Le nostre impostazioni non mi lasciano condividere l’agenda con il suo indirizzo privato.', en: 'I would like to connect my work calendar{d} to Myynd, an assistant app I use for my work. Our settings do not let me share my calendar through its private address.' },
  'google-oauth': { it: 'vorrei collegare il mio account Google di lavoro{d} a Myynd, un assistente che uso per il mio lavoro. Google dice che la nostra organizzazione deve prima approvare l’app.', en: 'I would like to connect my work Google account{d} to Myynd, an assistant app I use for my work. Google says our organization has to approve the app first.' },
  'microsoft-oauth': { it: 'vorrei collegare il mio account Microsoft 365 di lavoro{d} a Myynd, un assistente che uso per il mio lavoro. Microsoft dice che un amministratore deve prima approvare l’app.', en: 'I would like to connect my work Microsoft 365 account{d} to Myynd, an assistant app I use for my work. Microsoft says an administrator has to approve the app first.' },
  'microsoft-assegnazione': { it: 'vorrei collegare il mio account Microsoft 365 di lavoro{d} a Myynd, un assistente che uso per il mio lavoro. Microsoft dice che non sono assegnato all’app (AADSTS50105).', en: 'I would like to connect my work Microsoft 365 account{d} to Myynd, an assistant app I use for my work. Microsoft says I am not assigned to the app (AADSTS50105).' },
  'microsoft-accesso': { it: 'vorrei collegare il mio account Microsoft 365 di lavoro{d} a Myynd, un assistente che uso per il mio lavoro. Microsoft ha bloccato il mio accesso con un criterio dell’organizzazione (AADSTS53003 o 530035).', en: 'I would like to connect my work Microsoft 365 account{d} to Myynd, an assistant app I use for my work. Microsoft blocked my sign-in with an organization policy (AADSTS53003 or 530035).' },
  'github-org': { it: 'vorrei collegare i repository GitHub della nostra organizzazione{d} a Myynd, un assistente che uso per il mio lavoro. Ho creato un token a grana fine per l’organizzazione, e serve l’approvazione di un amministratore.', en: 'I would like to connect our organization’s GitHub repositories{d} to Myynd, an assistant app I use for my work. I created a fine-grained personal access token for the organization, and it needs an owner’s approval.' }
}

/*
 * Cosa fa Myynd con quell'accesso: ogni frase è un fatto del codice, e le
 * prove in `server/amministratore.test.ts` le tengono attaccate a lui.
 *
 * La posta, via IMAP e con la stessa password via SMTP (`posta.ts`):
 *   · legge, e salva nelle Bozze le risposte che prepara — anche senza un
 *     bottone, appena una bozza è pronta (`compiti.ts`, `preparaLaMail`);
 *   · manda solo dalla rotta `/api/compiti/:id/invia`, cioè da un bottone
 *     (`invio.manda`);
 *   · sposta in Archivio o nel Cestino da un bottone (`/api/compiti/:id/esegui`),
 *     e da sola solo con le regole sui mittenti che ha scritto lui, ogni
 *     quindici minuti (`sender-rules.ts`);
 *   · cancella solo la versione vecchia di una bozza che ha salvato lei.
 * Con Google (`google.ts`, `drive.ts`) lo stesso, senza mandare: non c'è una
 * chiamata di invio, e `calendar.events` si chiede ma non si usa (l'unica
 * chiamata all'agenda, `mettiInAgenda`, non la chiama nessuno).
 * Microsoft chiede solo permessi di lettura (`microsoft.ts`, `PARTI`).
 */
const MICROSOFT_AMBITI = 'User.Read, Mail.Read, Calendars.Read, Files.Read.All, Sites.Read.All'
const MICROSOFT_FA: Due = {
  it: `chiede a Microsoft Graph solo permessi di lettura (${MICROSOFT_AMBITI}), più offline_access per restare collegato: non può mandare, spostare né cancellare niente.`,
  en: `it asks Microsoft Graph only for read permissions (${MICROSOFT_AMBITI}), plus offline_access to stay signed in: it cannot send, move or delete anything.`
}
const FA: Record<ServizioAmministrato, Due> = {
  'gmail': {
    it: 'legge la mia posta via IMAP e salva nelle Bozze le risposte che prepara. Manda un’email (via SMTP, con la stessa password) solo quando premo il suo bottone. Sposta messaggi in Archivio o nel Cestino quando premo un bottone; da solo archivia soltanto la posta dei mittenti per cui ho scritto una regola. Non cancella niente, tranne le versioni vecchie delle bozze che ha salvato lui.',
    en: 'it reads my mail over IMAP and saves the replies it prepares to my Drafts. It sends an email (over SMTP, with the same password) only when I press its button. It moves messages to Archive or Trash when I press a button; on its own it only archives mail from senders I have written a rule for. It deletes nothing except older versions of drafts it saved itself.'
  },
  'calendario': {
    it: 'scarica la mia agenda dal suo indirizzo privato in formato iCal, che permette solo di leggerla.',
    en: 'it downloads my calendar from its private iCal address, which only allows reading it.'
  },
  'google-oauth': {
    it: 'chiede a Google gmail.modify, calendar.events (chiesto, non ancora usato), userinfo.email, e per Drive drive.readonly. Legge la mia posta e, con Drive, i miei file, e salva nelle Bozze le risposte che prepara. Sposta messaggi in Archivio o nel Cestino quando premo un bottone; da solo archivia soltanto la posta dei mittenti per cui ho scritto una regola. Con questo accesso non manda posta e non cambia l’agenda né i file.',
    en: 'it asks Google for gmail.modify, calendar.events (requested, not used yet), userinfo.email, and for Drive drive.readonly. It reads my mail and, with Drive, my files, and saves the replies it prepares to my Drafts. It moves messages to Archive or Trash when I press a button; on its own it only archives mail from senders I have written a rule for. Through this access it does not send mail or change my calendar or files.'
  },
  'microsoft-oauth': MICROSOFT_FA,
  'microsoft-assegnazione': MICROSOFT_FA,
  'microsoft-accesso': MICROSOFT_FA,
  'github-org': {
    it: 'un token a grana fine con accesso «Read-only» a Contents, Issues, Pull requests e Metadata. Myynd fa solo letture.',
    en: 'a fine-grained token with “Read-only” access to Contents, Issues, Pull requests and Metadata. Myynd only reads.'
  }
}

/** La voce esatta da cambiare, con i nomi che mostra la console. */
function cosaCambiare(caso: CasoAmministratore): Due {
  const id = caso.app ? ` (${caso.app})` : ''
  switch (caso.servizio) {
    case 'gmail': return {
      it: 'nella Console di amministrazione Google, Apps › Google Workspace › Gmail › End User Access › POP and IMAP access: attivare «Enable IMAP access for all users» e scegliere «Allow any mail client». Le password per le app vogliono anche la verifica in due passaggi: Security › Authentication › 2-step verification › «Allow users to turn on 2-Step Verification».',
      en: 'in the Google Admin console, Apps › Google Workspace › Gmail › End User Access › POP and IMAP access: turn on “Enable IMAP access for all users” and choose “Allow any mail client”. App passwords also need 2-Step Verification: Security › Authentication › 2-step verification › “Allow users to turn on 2-Step Verification”.'
    }
    case 'calendario': return {
      it: 'con Google Workspace, Admin console › Apps › Google Workspace › Calendar › Sharing settings › «External sharing options for primary calendars»: scegliere una delle opzioni «Share all information». Con Microsoft 365, Exchange admin center › Organization › Sharing › Individual Sharing: aggiungere il dominio «Anonymous» ai miei criteri di condivisione, così compare «Publish a calendar».',
      en: 'with Google Workspace, Admin console › Apps › Google Workspace › Calendar › Sharing settings › “External sharing options for primary calendars”: choose one of the “Share all information” options. With Microsoft 365, Exchange admin center › Organization › Sharing › Individual Sharing: add the “Anonymous” domain to my sharing policy, so that “Publish a calendar” appears.'
    }
    case 'google-oauth': return {
      it: `Admin console › Security › Access and data control › API controls › Manage Third-Party App Access › «Configure new app»: cercare Myynd${id} e impostarla su «Trusted».`,
      en: `Admin console › Security › Access and data control › API controls › Manage Third-Party App Access › “Configure new app”: search for Myynd${id} and set it to “Trusted”.`
    }
    case 'microsoft-oauth': {
      const url = caso.consenso ?? ''
      if (url) return {
        it: `aprire questo indirizzo con un account da amministratore e accettare: ${url}`,
        en: `open this link with an administrator account and accept: ${url}`
      }
      return {
        it: `Microsoft Entra admin center › Enterprise applications › Myynd${id} › Permissions › «Grant admin consent».`,
        en: `Microsoft Entra admin center › Enterprise applications › Myynd${id} › Permissions › “Grant admin consent”.`
      }
    }
    case 'microsoft-assegnazione': return {
      it: `Microsoft Entra admin center › Enterprise applications › Myynd${id} › Users and groups › «Add user/group»: assegnarmi l’app. Oppure, in Properties, mettere «Assignment required?» su No.`,
      en: `Microsoft Entra admin center › Enterprise applications › Myynd${id} › Users and groups › “Add user/group”: assign the app to me. Or, under Properties, set “Assignment required?” to No.`
    }
    case 'microsoft-accesso': return {
      it: `in Microsoft Entra admin center › Monitoring & health › Sign-in logs, il mio accesso a Myynd${id} dice quale criterio di accesso condizionale, o le impostazioni di sicurezza predefinite, lo hanno bloccato. Permettilo, o dimmi cosa deve avere il mio accesso.`,
      en: `in Microsoft Entra admin center › Monitoring & health › Sign-in logs, my sign-in to Myynd${id} shows which Conditional Access policy, or the security defaults, blocked it. Please allow it, or tell me what my sign-in needs.`
    }
    case 'github-org': return {
      it: 'Organization settings › Personal access tokens › Pending requests: approvare il mio token, il cui nome comincia con «Myynd».',
      en: 'Organization settings › Personal access tokens › Pending requests: approve my token whose name starts with “Myynd”.'
    }
  }
}

/** Chi riceve i dati, com'è su questa installazione (`/api/amministratore/dati`). */
export type DoveVanno = {
  /** L'indirizzo del server, se Myynd è ospitato; `null` in casa. */
  ospitato: string | null
  modello: { chi: string; locale: boolean } | null
  jev: boolean
}

/**
 * Dove vanno i dati: ogni pezzo secondo quello che c'è davvero.
 *
 * Il modello non riceve solo «quello che chiedo»: la prima pagina si prepara
 * in sottofondo dopo ogni lettura, e così le automazioni e la preparazione
 * discreta. Lo si dice. Se il modello sta sulla stessa macchina, nessun
 * fornitore riceve niente, e anche questo si dice — ma non se c'è Jev, che
 * riceve pezzi dei documenti per giudicarli.
 */
const IN_CASA: Due = { it: 'stanno sul mio computer.', en: 'it is stored on my computer.' }
const NESSUN_MODELLO: Due = {
  it: ' Nessun modello di intelligenza artificiale è ancora collegato; quando lo sarà, riceverà parti dei dati quando chiedo qualcosa e nei lavori in sottofondo.',
  en: ' No AI model is connected yet; once one is, it will receive parts of it when I ask something and in background jobs.'
}
const MODELLO_QUI: Due = { it: ' Il modello di intelligenza artificiale gira sul mio computer.', en: ' The AI model runs on my computer.' }
const MODELLO_SUL_SERVER: Due = { it: ' Il modello di intelligenza artificiale gira sullo stesso server.', en: ' The AI model runs on the same server.' }
const NESSUN_FORNITORE: Due = { it: ' Nessun fornitore di intelligenza artificiale li riceve.', en: ' No AI provider receives it.' }
const ESTRATTI_JEV: Due = { it: ' Brevi estratti vanno anche a TypeSafe (Jev), che giudica cosa conta.', en: ' Short excerpts also go to TypeSafe (Jev), which judges what matters.' }
const VUOTO: Due = { it: '', en: '' }
function sulServer(host: string): Due {
  return { it: `stanno nel mio account sul server Myynd di ${host}.`, en: `it is stored in my account on the Myynd server at ${host}.` }
}
function aChi(chi: string): Due {
  return {
    it: ` Parti dei dati vanno a ${chi}, il modello di intelligenza artificiale che uso, quando chiedo qualcosa e nei lavori in sottofondo, per esempio quando prepara la mia pagina del giorno.`,
    en: ` Parts of it go to ${chi}, the AI model I use, when I ask something and in background jobs, for example when it prepares my daily page.`
  }
}

function doveVanno(d: DoveVanno): Due {
  const m = d.modello
  const pezzi: Due[] = [
    d.ospitato ? sulServer(d.ospitato) : IN_CASA,
    !m ? NESSUN_MODELLO : !m.locale ? aChi(m.chi) : d.ospitato ? MODELLO_SUL_SERVER : MODELLO_QUI,
    // «nessun fornitore» solo se è vero fino in fondo: con Jev, TypeSafe riceve estratti
    m?.locale && !d.jev ? NESSUN_FORNITORE : VUOTO,
    d.jev ? ESTRATTI_JEV : VUOTO
  ]
  return { it: pezzi.map(p => p.it).join(''), en: pezzi.map(p => p.en).join('') }
}

/** Le righe fisse della richiesta, nelle due lingue. */
const SALUTO: Due = { it: 'Ciao,', en: 'Hi,' }
const COSA_FA: Due = { it: 'Cosa fa Myynd con questo accesso: ', en: 'What Myynd does with this access: ' }
const DOVE_VANNO: Due = { it: 'Dove vanno i dati: ', en: 'Where the data goes: ' }
const COSA_CAMBIARE: Due = { it: 'Cosa va cambiato: ', en: 'What needs to change: ' }
const GRAZIE: Due = { it: 'Grazie.', en: 'Thank you.' }

export type Richiesta = { oggetto: string; corpo: string }

/**
 * La richiesta intera: oggetto e corpo.
 *
 * `dati` è la risposta di `/api/amministratore/dati`: senza, la riga su dove
 * vanno i dati non si può scrivere vera, e la scheda aspetta ad offrire la
 * richiesta finché non l'ha.
 */
export function richiestaAmministratore(caso: CasoAmministratore, o: { inglese: boolean; dati: DoveVanno }): Richiesta {
  const l = (d: Due) => o.inglese ? d.en : d.it
  const perche = l(PERCHE[caso.servizio]).replace('{d}', caso.dominio ? ` (${caso.dominio})` : '')
  const righe = [
    l(SALUTO),
    '',
    perche,
    '',
    l(COSA_FA) + l(FA[caso.servizio]),
    l(DOVE_VANNO) + l(doveVanno(o.dati)),
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
