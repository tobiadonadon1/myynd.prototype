// Le due lingue dell'interfaccia.
//
// Il dizionario è indicizzato sulla frase italiana, non su una sigla. Costa
// qualche byte in più e regala tre cose che valgono molto di più: il codice
// resta leggibile (`t('Fatto')` si capisce, `t('feed.hero.primary')` no), una
// chiave che manca degrada in italiano invece che in un codice a vista, e
// aggiungere una lingua è aggiungere una colonna, non riscrivere le schermate.
//
// La lingua corrente sta in una variabile di modulo invece che passare di
// componente in componente: cambia di rado, e infilarla in ogni firma avrebbe
// sporcato ogni riga dell'app per una cosa che si tocca due volte l'anno.

import type { ReactNode } from 'react'

let corrente = 'en'

/**
 * La chiave in cui si tiene la lingua scelta.
 *
 * Ha un numero in fondo, e non è pedanteria: sotto la chiave di prima c'era
 * finito un *indovinato*, non una scelta — vedi il commento qui sotto — e su
 * ogni browser che ha aperto Myynd prima di oggi quel valore è ancora lì.
 * Cambiare il ripiego non sarebbe servito a niente: la riga vecchia avrebbe
 * continuato a vincere per sempre. Cambiare chiave è l'unico modo di lasciarla
 * indietro senza andare a cancellare roba dal browser di qualcuno.
 */
const CHIAVE_LINGUA = 'myynd.lingua.2'

/**
 * Quale lingua si parla adesso.
 *
 * **`en` per tutto quello che non è esplicitamente `it`.** Prima era il
 * contrario — `l === 'en' ? 'en' : 'it'` — e quella riga da sola riportava
 * tutto in italiano: bastava chiamarla con `undefined`, cioè con una
 * configurazione non ancora arrivata dal server, ed era italiano. Cambiare il
 * valore iniziale più in alto non serviva a niente finché restava questa.
 *
 * Non scrive niente su disco, ed è l'altra metà della riparazione. Prima
 * salvava a ogni chiamata, compresa quella dell'avvio che tira a indovinare:
 * il ripiego finiva memorizzato come se fosse stato scelto da qualcuno, e da
 * lì in poi vinceva su tutto — comprese le correzioni fatte dopo. Una cosa
 * indovinata non si ricorda; si ricorda una cosa scelta, e per quella c'è
 * `ricordaLingua`.
 */
export function impostaLingua(l: string | undefined) {
  corrente = l === 'it' ? 'it' : 'en'
  // Anche la pagina deve sapere che lingua parla: da `lang` dipendono la sintesi
  // vocale, il correttore ortografico dei campi e la barra «vuoi tradurre questa
  // pagina?» del browser — che su un'app in inglese con lang="it" compare a
  // sproposito. Era scritto a mano nell'index.html, e quindi era sempre «it».
  document.documentElement.lang = corrente
}

/**
 * La lingua *scelta*, che si ricorda per la prossima volta.
 *
 * La chiamano i due posti in cui una persona decide davvero: le preferenze, e
 * l'interruttore sulla schermata di guasto. Serve perché l'accesso e il primo
 * avvio si disegnano prima che il server dica qualcosa, e senza una copia qui
 * quelle schermate ripartirebbero ogni volta dalla lingua di partenza.
 */
export function ricordaLingua(l: string | undefined) {
  impostaLingua(l)
  try { localStorage.setItem(CHIAVE_LINGUA, corrente) } catch { /* incognito */ }
}

/**
 * Quella dell'ultima volta, per le schermate che vengono prima del server.
 *
 * Se qui non c'è niente non vuol dire «italiano»: vuol dire che su questo
 * browser Myynd non è mai arrivato in fondo a un caricamento — la prima volta,
 * o dopo aver pulito i dati del sito. Prima si ripiegava sull'italiano comunque,
 * e chi ha il computer in inglese si trovava la schermata di guasto in una
 * lingua che non ha scelto. La preferenza vera sta nel profilo, sul server: fino
 * a quando risponde lui, la cosa più vicina che c'è è la lingua del browser.
 */
export function linguaSalvata(): string {
  try {
    const l = localStorage.getItem(CHIAVE_LINGUA)
    if (l === 'it' || l === 'en') return l
  } catch { /* incognito */ }
  // L'inglese, non la lingua del browser.
  //
  // Prima si guardava `navigator.language`, che sembra premuroso e non lo è:
  // Myynd si legge in due lingue e quella giusta è una scelta, non un dato
  // anagrafico del computer. Chi ha Chrome in italiano perché vive in Italia
  // ma lavora in inglese si trovava l'app in italiano *e nessun modo di dirlo*
  // finché il server non rispondeva — cioè proprio sulle schermate in cui il
  // server non risponde. Si parte da una, si cambia dove si vuole.
  return 'en'
}

/** Il locale con cui si scrivono numeri e date. Uno solo, per non farlo divergere. */
export function loc(): string {
  return corrente === 'en' ? 'en-GB' : 'it-IT'
}

export function lingua(): string {
  return corrente
}

const EN: Record<string, string> = {
  'Mostra la password': 'Show the password',
  'Nascondi la password': 'Hide the password',

  'Oppure parti da undici già pronte': 'Or start from eleven ready-made ones',

// — l'accesso con più persone: si sceglie fra entrare e crearsi un conto —
  // «Entra» esiste già e vuol dire un'altra cosa: sull'onboarding è entrare
  // *nell'app*, e in inglese «Enter» va bene lì. Su un bottone d'accesso no —
  // in inglese quello si chiama «Sign in», e usare la stessa parola per le due
  // cose faceva sembrare tradotto a macchina proprio il primo schermo.
  'Accedi': 'Sign in',
  'Crea un account': 'Create an account',
  'La tua posta, i tuoi file e le tue automazioni restano tuoi: ogni account ha la sua memoria, separata da quella di chiunque altro.':
    'Your mail, your files and your automations stay yours: every account has its own memory, separate from anyone else\u2019s.',
  'C’è già un account con questo indirizzo.': 'There is already an account with this address.',
  'Indirizzo o password non corretti.': 'Address or password is not right.',

// — ospitato, e nessuno ha ancora messo l'invito —

// — i segnaposto dentro le caselle —
//   Sono testo che si legge come tutto il resto, e restavano fuori perché
//   `placeholder=` non assomiglia a una frase da tradurre: la prova che cerca
//   l'italiano dimenticato guarda le stringhe che *sembrano* prosa, e
//   «otto caratteri» non ha nessuna delle parole spia.
  'tu@tuodominio.it': 'you@yourdomain.com',
  'otto caratteri': 'eight characters',
  'imap.tuodominio.it': 'imap.yourdomain.com',
  '/Users/…/Lavoro': '/Users/…/Work',

// — l'accesso: quale delle due cose stai facendo, e dove sta girando —
  'Bentornato.': 'Welcome back.',
  'Crea il tuo accesso.': 'Create your account.',
  'Entra con l’indirizzo con cui l’hai creato.': 'Sign in with the address you created it with.',
  'Non c’è ancora nessun account qui: quello che scrivi adesso lo crea.':
    'There is no account here yet: what you type now creates it.',
  'Questo indirizzo è un Myynd a parte, con una memoria sua. L’account che hai sul tuo computer qui non esiste: non c’è nessun accesso centrale, e ogni Myynd tiene il suo dove gira.':
    'This address is a separate Myynd, with a memory of its own. The account on your computer does not exist here: there is no central sign-in, and each Myynd keeps its own where it runs.',
  'Non c’è ancora nessun account su questo computer: quello che scrivi adesso lo crea.':
    'There is no account on this computer yet: what you type now creates it.',
  'Questo Myynd gira su un server, non sul tuo computer.':
    'This Myynd runs on a server, not on your computer.',

// — la schermata che si vede quando dietro non c'è niente —
  'Qui c’è solo l’interfaccia.': 'This is only the interface.',
  'Myynd gira sul computer di chi lo usa: legge la sua posta e i suoi file, e non esce da lì. Questa pagina è solo la finestra, e da sola non ha niente a cui collegarsi.':
    'Myynd runs on its owner’s own computer: it reads their mail and their files, and nothing leaves that machine. This page is only the window, and on its own it has nothing to connect to.',
  'smesso di riprovare': 'stopped trying',

// — quello che si scrive da solo: gli argomenti e il ritratto —
  'Scrivilo da quello che leggo': 'Write it from what I read',
  'L’ho scritto io, da quello che apri. Se lo cambi, resta tuo.':
    'I wrote this, from what you open. Change it and it stays yours.',
  'Guarda se ti torna, poi salva.': 'See if that sounds right, then save.',
  'Non ho ancora abbastanza per dire cosa ti interessa.':
    'Not enough yet to say what you are interested in.',
  'Aggiorna da quello che hai imparato': 'Update from what you have learned',
  'Ci penso…': 'Thinking…',
  'Non c’è niente di nuovo da aggiungere.': 'There is nothing new to add.',

// — le fasi della lettura, per le fonti nuove —
  'apro le conversazioni': 'opening the conversations',
  'apro i documenti': 'opening the documents',
  'apro i siti': 'opening the sites',
  'apro la cartella': 'opening the folder',

// — le automazioni: cosa troverebbe, e perché non fa niente —
  'Cosa troverebbe adesso': 'What it would find now',
  'Adesso non troverebbe niente.': 'Right now it would find nothing.',
  'Non è collegato:': 'Not connected:',
  'Guarda solo quello che è arrivato dall’ultima volta: se non è arrivato niente, è normale.':
    'It only looks at what arrived since last time: if nothing arrived, that is normal.',
  'Prova a cambiare le parole: vanno scritte come le userebbe chi ha scritto quei documenti, nella loro lingua.':
    'Try different words: they have to be the ones whoever wrote those documents would use, in their language.',
  'a breve': 'shortly',
  'aspetta che chiudi la sua riga': 'waiting for you to close its row',
  'l’ultima volta è andata storta': 'last run went wrong',
  'L’ultima volta è andata storta.': 'The last run went wrong.',
  'Uno degli attrezzi che ha dichiarato non è collegato: finché resta così, non troverà mai niente.':
    'One of the tools it declared is not connected: while that lasts, it will never find anything.',
  'C’è già una sua riga aperta in lista: finché resta lì non ne nasce un’altra. Chiudila e la prossima arriva da sé.':
    'One of its rows is still open on the list: while it sits there, no new one is created. Close it and the next arrives by itself.',
  'Riscrivile le parole': 'Rewrite its words',

// — le fonti nuove: Slack, Drive, Microsoft, Dropbox, WhatsApp —
  'Outlook e Calendario': 'Outlook and Calendar',
  'SharePoint e OneDrive': 'SharePoint and OneDrive',
  'WhatsApp Business': 'WhatsApp Business',
  'Google Drive': 'Google Drive',
  'Microsoft 365: posta e agenda. Serve un’app registrata su Entra ID.':
    'Microsoft 365: mail and calendar. Needs an app registered on Entra ID.',
  'Un token da utente: legge i canali di cui fai già parte.':
    'A user token: it reads the channels you are already in.',
  'Cloud API. Riceve i messaggi mentre arrivano: serve un indirizzo pubblico.':
    'Cloud API. Receives messages as they arrive: needs a public address.',
  'I tuoi documenti su Drive, in sola lettura.': 'Your documents on Drive, read-only.',
  'I file dei siti che segui, e il tuo OneDrive. Stessa app di Outlook.':
    'Files from the sites you follow, and your OneDrive. Same app as Outlook.',
  'La chiave dell’app, e un codice da incollare una volta sola.':
    'The app key, and a code to paste once.',

  // Slack
  'Token utente': 'User token',
  'Collega Slack': 'Connect Slack',
  'Su api.slack.com/apps: crea un’app, in «OAuth & Permissions» aggiungi gli ambiti utente channels:history, groups:history, im:history, mpim:history, channels:read e users:read, installala nel tuo spazio e copia il token che comincia per xoxp-.':
    'On api.slack.com/apps: create an app, under “OAuth & Permissions” add the user scopes channels:history, groups:history, im:history, mpim:history, channels:read and users:read, install it into your workspace, and copy the token starting with xoxp-.',
  'Legge solo i canali di cui fai già parte: non è un permesso in più di quelli che hai.':
    'It only reads the channels you are already in: it is not one permission more than you have.',
  'Serve il token di Slack.': 'The Slack token is needed.',
  'Il token di Slack non è valido.': 'That Slack token is not valid.',
  'Il token di Slack è stato revocato: rifallo.': 'That Slack token was revoked: set it up again.',
  'A questo token mancano dei permessi: rifai l’installazione dell’app.':
    'That token is missing some scopes: install the app again.',
  'Slack ha detto di rallentare. Riprovo più tardi.': 'Slack asked to slow down. I will try again later.',
  'Slack non ha risposto come mi aspettavo.': 'Slack did not answer the way I expected.',
  'Un token di Slack comincia per xoxp- o xoxb-.': 'A Slack token starts with xoxp- or xoxb-.',

  // Drive
  'Collega Drive': 'Connect Drive',
  'Su console.cloud.google.com: crea un progetto, attiva Google Drive API, poi Credenziali › ID client OAuth › Applicazione desktop.':
    'On console.cloud.google.com: create a project, turn on the Google Drive API, then Credentials › OAuth client ID › Desktop app.',
  'Stesso progetto di Gmail: riusa lo stesso ID client, e attiva anche Google Drive API. Il consenso si rifà, perché stavolta riguarda i tuoi file.':
    'Same project as Gmail: reuse the same client ID, and turn on the Google Drive API too. Consent is asked again, because this time it is about your files.',
  'Il collegamento con Google Drive è scaduto: rifallo.':
    'The Google Drive connection expired: set it up again.',
  'Google Drive non mi lascia leggere: ricollega l’account.':
    'Google Drive will not let me read: reconnect the account.',
  'Google Drive non ha risposto.': 'Google Drive did not answer.',
  'Collega Google Drive e potrò farlo.': 'Connect Google Drive and I can do it.',

  // Microsoft
  'ID applicazione': 'Application ID',
  'ID del tenant': 'Tenant ID',
  'lascia vuoto se non lo sai': 'leave blank if you do not know it',
  'Collega Microsoft': 'Connect Microsoft',
  'Su entra.microsoft.com: Registrazioni app › Nuova registrazione, piattaforma «App per dispositivi mobili e desktop», e come URI di reindirizzamento aggiungi http://localhost. Poi copia qui l’ID applicazione.':
    'On entra.microsoft.com: App registrations › New registration, platform “Mobile and desktop applications”, and add http://localhost as a redirect URI. Then copy the application ID here.',
  'L’app su Entra ID è la stessa che hai già registrato: l’ID è quello. Microsoft richiederà il consenso, perché stavolta chiede altri permessi.':
    'The Entra ID app is the one you already registered: that is the ID. Microsoft will ask for consent again, because this time it asks for different permissions.',
  'Chiederà di poter leggere la posta e il calendario. Niente altro, e niente in scrittura.':
    'It will ask to read your mail and calendar. Nothing else, and nothing that writes.',
  'Chiederà di poter leggere i file dei siti che segui. Niente altro, e niente in scrittura.':
    'It will ask to read files from the sites you follow. Nothing else, and nothing that writes.',
  'Serve l’ID applicazione di Entra ID.': 'The Entra ID application ID is needed.',
  'Non so cosa collegare di Microsoft.': 'I do not know which part of Microsoft to connect.',
  'Il collegamento con Microsoft è scaduto: rifallo.': 'The Microsoft connection expired: set it up again.',
  'L’app su Entra ID non è registrata come applicazione desktop.':
    'The Entra ID app is not registered as a desktop application.',
  'Manca il consenso dell’amministratore per questi permessi.':
    'Admin consent is missing for these permissions.',
  'Microsoft non ha dato il permesso duraturo: riprova.':
    'Microsoft did not grant the lasting permission: try again.',
  'Microsoft non mi lascia leggere: ricollega l’account.':
    'Microsoft will not let me read: reconnect the account.',
  'A questo collegamento mancano dei permessi: rifallo.':
    'This connection is missing some permissions: set it up again.',
  'Microsoft non ha risposto.': 'Microsoft did not answer.',
  'Collega Microsoft e potrò farlo.': 'Connect Microsoft and I can do it.',

  // Dropbox
  'Chiave dell’app': 'App key',
  'Apri Dropbox': 'Open Dropbox',
  'Codice': 'Code',
  'Collega Dropbox': 'Connect Dropbox',
  'apri la pagina a mano': 'open the page yourself',
  'Non si è aperto niente?': 'Nothing opened?',
  'Dropbox ti ha scritto un codice sullo schermo: incollalo qui.':
    'Dropbox wrote a code on the screen: paste it here.',
  'Su dropbox.com/developers/apps: crea un’app «Scoped access», in Permissions spunta files.metadata.read e files.content.read, poi copia qui la App key.':
    'On dropbox.com/developers/apps: create a “Scoped access” app, under Permissions tick files.metadata.read and files.content.read, then copy the App key here.',
  'Serve la chiave dell’app Dropbox.': 'The Dropbox app key is needed.',
  'La chiave dell’app Dropbox non è valida.': 'That Dropbox app key is not valid.',
  'Quel codice non è più valido: rifai il collegamento.':
    'That code is no longer valid: start the connection again.',
  'È passato troppo tempo: ricomincia il collegamento.':
    'Too much time has passed: start the connection again.',
  'Incolla il codice che ti ha dato Dropbox.': 'Paste the code Dropbox gave you.',
  'Dropbox non ha dato il permesso duraturo: riprova.':
    'Dropbox did not grant the lasting permission: try again.',
  'Dropbox non mi lascia leggere: ricollega l’account.':
    'Dropbox will not let me read: reconnect the account.',
  'Dropbox ha detto di rallentare. Riprovo più tardi.':
    'Dropbox asked to slow down. I will try again later.',
  'Dropbox non ha risposto.': 'Dropbox did not answer.',
  'Dropbox non ha dato il file.': 'Dropbox did not hand over the file.',
  'Collega Dropbox e potrò farlo.': 'Connect Dropbox and I can do it.',

  // WhatsApp
  'ID del numero di telefono': 'Phone number ID',
  'Token permanente': 'Permanent token',
  'Segreto dell’app': 'App secret',
  'Parola d’ordine del webhook': 'Webhook verify token',
  'inventala, e riscrivila su Meta': 'make one up, and write it again on Meta',
  'Collega WhatsApp': 'Connect WhatsApp',
  'WhatsApp non si può rileggere: Meta i messaggi li manda, non li fa chiedere. Vuol dire due cose — quello che è arrivato prima di oggi non ci sarà, e questo computer dev’essere raggiungibile da internet perché ne arrivino di nuovi.':
    'WhatsApp cannot be re-read: Meta pushes messages, it does not let you ask for them. That means two things — whatever arrived before today will not be there, and this computer has to be reachable from the internet for new ones to arrive.',
  'Su developers.facebook.com: nell’app WhatsApp, in Configurazione dell’API, copia l’ID del numero e crea un token permanente da utente di sistema. Il segreto dell’app sta in Impostazioni › Di base.':
    'On developers.facebook.com: in the WhatsApp app, under API Setup, copy the phone number ID and create a permanent system-user token. The app secret is under Settings › Basic.',
  'È quello che firma i messaggi in arrivo: senza, quell’indirizzo non saprebbe distinguere Meta da chiunque altro.':
    'It is what signs incoming messages: without it, that address could not tell Meta apart from anyone else.',
  'Su Meta, come URL del webhook metti il tuo indirizzo pubblico seguito da /api/whatsapp/webhook, e iscriviti al campo «messages».':
    'On Meta, set the webhook URL to your public address followed by /api/whatsapp/webhook, and subscribe to the “messages” field.',
  'Serve il token di WhatsApp Business.': 'The WhatsApp Business token is needed.',
  'Serve l’ID del numero di telefono.': 'The phone number ID is needed.',
  'Serve il segreto dell’app: è quello che firma i messaggi in arrivo.':
    'The app secret is needed: it is what signs incoming messages.',
  'Serve una parola d’ordine: la riscriverai su Meta.':
    'A verify token is needed: you will write it again on Meta.',
  'Il token di WhatsApp non è valido o è scaduto.':
    'That WhatsApp token is not valid, or it expired.',
  'Quell’ID del numero non esiste su questo account.':
    'That phone number ID does not exist on this account.',
  'Meta ha rifiutato il collegamento.': 'Meta refused the connection.',
  'Meta non ha risposto.': 'Meta did not answer.',

  // quello che è cambiato di posto
  '. Le altre no: servono le tue credenziali.': '. The others cannot: they need your credentials.',
  'Questi restano qui perché fanno parte del disegno, ma non sono ancora collegabili.':
    'These stay here because they are part of the design, but they cannot be connected yet.',
  'La risposta non è quella che aspettavo: riprova.': 'That answer is not the one I expected: try again.',

// — il catalogo delle fonti —
  'Posta': 'Mail',
  'Desktop': 'Desktop',
  'Calendario': 'Calendar',
  'Comunicazione': 'Communication',
  'File': 'Files',
  'Note': 'Notes',
  'Ragionamento': 'Reasoning',
  'Gestionale': 'Business software',
  'IMAP: host, indirizzo e password della casella.': 'IMAP: host, address and mailbox password.',
  'Google Workspace: posta e agenda, dalla loro API.': 'Google Workspace: mail and calendar, from their own API.',
  'Gmail e Calendario': 'Gmail and Calendar',
  'Su console.cloud.google.com: crea un progetto, attiva Gmail API e Calendar API, poi Credenziali › ID client OAuth › Applicazione desktop. Incolla qui quello che ti dà.':
    'On console.cloud.google.com: create a project, turn on the Gmail API and the Calendar API, then Credentials › OAuth client ID › Desktop app. Paste what it gives you here.',
  'ID client': 'Client ID',
  'Segreto del client': 'Client secret',
  'se il tuo progetto ne ha uno': 'if your project has one',
  'Collega Google': 'Connect Google',
  'Ti aspetto nel browser…': 'Waiting for you in the browser…',
  'Serve il client ID di Google.': 'The Google client ID is needed.',
  'Google ha rifiutato il collegamento.': 'Google refused the connection.',
  'Il collegamento con Google è scaduto: rifallo.': 'The Google connection expired: set it up again.',
  'Hai detto di no a Google.': 'You said no to Google.',
  'Google non ha mandato il codice.': 'Google did not send the code back.',
  'Nessuna risposta da Google: riprova.': 'No answer from Google: try again.',
  'Google non ha dato il permesso duraturo: riprova.': 'Google did not grant lasting access: try again.',
  'Collega Google e potrò farlo.': 'Connect Google and I can do it.',
  'Google non ha risposto.': 'Google did not answer.',
  'Google ha detto di rallentare. Riprovo più tardi.': 'Google asked me to slow down. I will try later.',
  'Google non mi lascia fare questa cosa: ricollega l’account.': 'Google will not let me do this: reconnect the account.',
  'Le cartelle che scegli tu, lette in sola lettura.': 'The folders you pick, read-only.',
  'Token di integrazione interna, pagine condivise con l\u2019integrazione.': 'Internal integration token, pages shared with the integration.',
  'La chiave API che fa ragionare Myynd sul tuo materiale.': 'The API key that lets Myynd reason over your material.',
  'La tua lista. Collegata da sola, sempre.': 'Your list. Connected on its own, always.',
  'Richiede un account WhatsApp Business API.': 'Needs a WhatsApp Business API account.',
  'Richiede una app registrata su Entra ID.': 'Needs an app registered on Entra ID.',
  'Richiede una app Slack con OAuth.': 'Needs a Slack app with OAuth.',
  'CalDAV o Google Calendar.': 'CalDAV or Google Calendar.',
  'Richiede OAuth Google.': 'Needs Google OAuth.',
  'Richiede OAuth Dropbox.': 'Needs Dropbox OAuth.',
  'Richiede OAuth Fatture in Cloud.': 'Needs Fatture in Cloud OAuth.',
  'collegato': 'connected',
// — il giro —
  'Scrivi la riga': 'Write the line',
  'Come la diresti a voce. Invio, e ci sta.': 'The way you would say it out loud. Enter, and it is there.',
  'Batti / per il resto': 'Type / for the rest',
  'Quando farla, o affidarla subito senza toccare il mouse.': 'When to do it, or hand it over without touching the mouse.',
  'Le tre colonne': 'The three columns',
  'Provale: decidono quanto se ne occupa lui.': 'Try them: they decide how much he takes on.',
  'Se non può, chiede': 'If it cannot, it asks',
  'Non inventa mai. Rispondi e ci riprova.': 'It never invents. Answer and it tries again.',
  'Spuntala': 'Tick it off',
  'Un clic. Quando finisci tutto, scendono i coriandoli.': 'One click. When you finish everything, the confetti comes down.',
  'La faccio io. Myynd non la tocca.': 'I do it. Myynd does not touch it.',
  'Te la scrive: rileggi e mandi tu.': 'It writes it: you read it over and send.',
  "La porta fino all'ultimo passo: testo, allegati, a chi va.": 'It carries it to the last step: text, attachments, who it goes to.',
  'mandare il preventivo a Rossi': 'send Rossi the quote',
  'mandare una mail a mio padre': 'email my father',
  'richiamare lo studio': 'call the office back',
  'Non ho la sua email e non so cosa vuoi dirgli. E la posta non è ancora collegata: collegamela e te la scrivo.':
    'I do not have his email and I do not know what you want to say. And mail is not connected yet: connect it and I will write it.',
  'Indietro': 'Back',
  'Avanti': 'Next',
  'Ho capito': 'Got it',
  'La guida': 'The guide',
  'Leggo tutto e scelgo cosa conta': 'Reading everything and picking what matters',
// — l'avanzamento della lettura —
  'apro le cartelle': 'opening the folders',
  'leggo le pagine': 'reading the pages',
  'mi collego alla casella': 'connecting to the mailbox',
  // — il tipo di una voce del feed: vocabolario chiuso —
  'Da decidere': 'To decide',
  'Da leggere': 'To read',
  'Scadenza': 'Deadline',
  'Già gestito': 'Already handled',
  // — i gruppi della mappa —
  'Documenti': 'Documents',
  'Altre fonti': 'Other sources',
  'Me lo sono segnato.': 'Noted.',
  // — quello che può dire il server —
  'Un account esiste già su questa macchina.': 'An account already exists on this machine.',
  'Indirizzo non valido.': 'Not a valid address.',
  'Almeno otto caratteri.': 'Eight characters at least.',
  'Nessun account su questa macchina.': 'No account on this machine.',
  'Email o password non corrispondono.': 'Email and password do not match.',
  'Nessun account.': 'No account.',
  'Sessione scaduta.': 'Session expired.',
  "Nessuna chiave nell'ambiente.": 'No key in the environment.',
  'Servono host, indirizzo e password.': 'Host, address and password are needed.',
  'Scegli almeno una cartella.': 'Pick at least one folder.',
  'Serve il token di integrazione.': 'The integration token is needed.',
  'Serve la chiave API.': 'The API key is needed.',
  'Connettore sconosciuto.': 'Unknown source.',
  'Chiave API non valida.': 'Not a valid API key.',
  'Token non valido.': 'Not a valid token.',
  "L'integrazione non ha accesso a nessuna pagina.": 'The integration has access to no pages.',
  'Nessuna cartella valida.': 'No valid folder.',
  'Una lettura è già in corso.': 'A reading is already running.',
  'Non trovato.': 'Not found.',
  'Scrivi la risposta.': 'Write the answer.',
  "Serve l'etichetta del blocco.": 'The block label is needed.',
  'Scrivi la convinzione.': 'Write the belief.',
  'Errore interno.': 'Something went wrong inside.',
  'La risposta si è interrotta a metà. Riprova.': 'The answer broke off halfway. Try again.',
  'Scrivi qualcosa.': 'Write something.',
  'Lettura interrotta.': 'The reading was cut off.',
  'La risposta si è interrotta.': 'The answer was cut off.',
  'Risposta illeggibile dal server.': 'Unreadable answer from the server.',
'tu': 'you',
  'Letto tutto quello che è cambiato.': 'Read everything that changed.',
  'Sincronizzazione fallita.': 'The reading failed.',
  'Non ho trovato niente da segnalare.': 'I found nothing worth flagging.',
  'La lettura non è riuscita.': 'The reading did not go through.',
  'Non sono riuscito a segnarla.': 'I could not mark it.',
  'Rimessa in cima al feed.': 'Back on top of the feed.',
  'Non sono riuscito a rimetterla.': 'I could not put it back.',
  'Non sono riuscito ad annullare.': 'I could not undo that.',
  'Chat eliminata.': 'Chat deleted.',
  'Segnato. Il documento è indietro rispetto a te: rileggo la fonte alla prossima lettura.':
    'Noted. The document is behind you: I will re-read the source next time.',
  'Niente ancora': 'Nothing yet',
  'Collega una fonte e qui comparirà quello che Myynd ha letto.': 'Connect a source and what Myynd has read will show up here.',
  "L'ho aggiornato altrove: il documento qui è indietro.": 'I updated it elsewhere: the document here is behind.',
  'Non mi interessa.': 'Not interested.',
  'ancora nessun documento': 'no documents yet',
  "Crea l'accesso": 'Create your login',
  'Su cosa mi concentro': 'What I focus on',
  'Quello che scrivi qui viene prima di tutto il resto quando scelgo cosa metterti in prima pagina.':
    'What you write here comes before everything else when I pick what to put on your front page.',
  'Vuoto vuol dire: guarda tutto.': 'Empty means: look at everything.',
  'fatta con Myynd': 'done with Myynd',
  'Da fare': 'To do',
  'Niente da segnalare.': 'Nothing to flag.',
  'Non hai collegato niente.': 'You have connected nothing.',
  'Non ho ancora letto niente.': 'I have not read anything yet.',
  'Serve Claude per scegliere cosa conta.': 'Claude is needed to pick what matters.',
  // — la lista —
  'ti chiede': 'asks you',
  'Rispondigli': 'Answer him',
  'Rispondigli e ci riprova': 'Answer and he tries again',
  'Manda': 'Send',
  'Non sono riuscito a rispondergli.': 'I could not answer him.',
  'Come funziona': 'How it works',
  // — quello che dice il server: arriva in italiano e si traduce qui —
  'Collega Claude e potrò lavorarci.': 'Connect Claude and I can work on it.',
  'Il lavoro si è interrotto. Riaffidamelo quando vuoi.': 'The work was cut off. Hand it back to me whenever.',
  'Non ho trovato niente nel tuo materiale su cui basare questo. Dimmi qualcosa in più, o collega la fonte che serve.':
    'I found nothing in your material to base this on. Tell me a bit more, or connect the source it needs.',
  'Su questo compito non posso lavorare.': 'I cannot work on this one.',
  'È tornata una risposta vuota. Riprova.': 'An empty answer came back. Try again.',
  'La chiave di Claude non è più valida.': 'The Claude key is no longer valid.',
  'La chiave non ha accesso a questo modello.': 'The key has no access to this model.',
  'Claude è sotto sforzo in questo momento. Riprova fra poco.': 'Claude is under strain right now. Try again shortly.',
  'Ci ha messo troppo e ho lasciato perdere. Riprova.': 'It took too long and I gave up. Try again.',
  'Non riesco a raggiungere Claude. Controlla la rete.': 'I cannot reach Claude. Check the network.',
  "Non ce l'ho fatta. Riprova.": "I could not manage it. Try again.",
  'Compito non trovato.': 'Task not found.',
  'Questo non è in mano a Myynd.': 'This one is not with Myynd.',
  "Scrivi cosa c'è da fare.": 'Write what needs doing.',
  'Un compito senza testo non è un compito.': 'A task with no text is not a task.',
  'Non so cosa sia questo momento.': 'I do not know what moment that is.',
  'Questa strada non esiste.': 'That route does not exist.',
  'Fatto tutto.': 'All done.',
  'Da fare adesso': 'To do now',
  'Entro venerdì': 'By Friday',
  'Quando capita': 'Whenever',
  'Chiedi la bozza': 'Ask for a draft',
  'La scrive lui, la mandi tu': 'He writes it, you send it',
  'Falla fare a lui': 'Let him do it',
  "Fino all'ultimo passo": 'Right up to the last step',
  'Le fatte': 'The done ones',
  'Mostra o nascondi': 'Show or hide',
  'io': 'me',
  'bozza': 'draft',
  'tutto': 'Myynd',
  'Myynd': 'Myynd',
  'pronta': 'ready',
  'Va bene': 'Good',
  'Tutto pronto.': 'All ready.',
  'Oggi è finito.': 'Today is done.',
  'Ti porti avanti con': 'Get a head start on',
  'Non è rimasto niente.': 'Nothing left.',
  'Scrivi la prima cosa qui sopra.': 'Write the first thing up there.',
  'Vai a fare un giro.': 'Go for a walk.',
  'Prenditi il pomeriggio.': 'Take the afternoon.',
  "Chiama qualcuno che non senti da un po'.": "Call someone you haven't spoken to in a while.",
  'Esci prima.': 'Leave early.',
  'Mettila in lista': 'Put it on the list',
  'in lista': 'to the list',
  'Messa in lista.': 'On the list.',
  'Non sono riuscito a metterla in lista.': 'I could not put it on the list.',
  'Chiudi': 'Close',
  'Chiudila': 'Close it',
  'Il testo della riga': 'The text of the line',
  'La bozza': 'The draft',
  "Com'è andata": 'How it went',
  'Rileggi': 'Read it',
  'scarta la bozza': 'discard the draft',
  "Torna com'era, senza il lavoro suo": 'Back as it was, without his work',
  'Aggiungila': 'Add it',
  'Per quando': 'For when',
  'Qualcosa non va.': 'Something is wrong.',
  'Non riesco a leggere la lista.': 'I cannot read the list.',
  'Le tue correzioni non sono ancora salvate: «Va bene così» le tiene, «Rifallo» le butta.':
    'Your edits are not saved yet: "Good as it is" keeps them, "Do it again" throws them away.',
  'Rifacendola perdi le correzioni che hai scritto.': 'Doing it again loses the edits you wrote.',
  'Non sono riuscito a salvarlo.': 'I could not save it.',
  'Il dettaglio, se serve': 'The detail, if any',
  'dettaglio': 'detail',
  'Lascia stare': 'Never mind',
  'Cambia questa riga': 'Change this line',
  'Ci sta lavorando': 'Working on it',
  'richiamalo': 'take it back',
  'Torna a occupartene tu': 'Take it back on yourself',
  'Me ne sono tolto di mezzo.': 'I got out of the way.',
  'Non sono riuscito a richiamarlo.': 'I could not take it back.',
  'niente qui': 'nothing here',
  'Oggi': 'Today',
  'Questa settimana': 'This week',
  'Prima o poi': 'Sooner or later',
  'Cosa c\'è da fare': 'What needs doing',
  'a Myynd': 'to Myynd',
  'Fallo fare a Myynd': 'Let Myynd do it',
  'Toglila': 'Remove it',
  // — una cosa della lista, quando sta in cima al feed —
  'fatta': 'done',
  'Se ne occupa Myynd': 'Myynd takes it',
  'Richiamala': 'Take it back',
  'Fanne una bozza': 'Draft it for me',
  'Riportala a oggi': 'Move it to today',
  'Rimandala a questa settimana': 'Push it to this week',
  'Rimandala a prima o poi': 'Push it to sooner or later',
  'ci sta lavorando': 'working on it',
  'bozza pronta': 'draft ready',
  'Va bene così': 'Good as it is',
  'Correggi': 'Edit',
  'Rifallo': 'Do it again',
  'Riprova, da capo': 'Try again, from scratch',
  'Mandata.': 'Sent.',
  'Fatto.': 'Done.',
  'rimettila': 'put it back',
  'Il fuoco:': 'The focus:',
  'una bozza aspetta te': 'one draft is waiting for you',
  'bozze aspettano te': 'drafts are waiting for you',
  'Niente in lista.': 'Nothing on the list.',
  'Tutto pronto, tocca a te.': 'All ready, over to you.',
  'Una cosa da fare.': 'One thing to do.',
  'cose da fare.': 'things to do.',
  'La lista è vuota. Scrivi la prima cosa qui sopra.': 'The list is empty. Write the first thing up there.',
  'Non è rimasto niente. Buona giornata.': 'Nothing left. Have a good day.',
  'Scrivila come la diresti. Poi puoi farla tu, oppure passarla a Myynd: legge quello che hai già e la prepara.':
    'Write it the way you would say it. Then do it yourself, or hand it to Myynd: it reads what you already have and prepares it.',
  'Vale anche per l\'altra schermata: è la stessa testa. Lascialo vuoto per farmi tornare a guardare tutto.':
    'It applies to the other screen too: it is the same head. Leave it empty to make me look at everything again.',
  'Non sono riuscito a chiuderlo.': 'I could not close it.',
  'Non sono riuscito a rimetterlo.': 'I could not put it back.',
  'Non sono riuscito ad affidarlo.': 'I could not hand it over.',
  'Non sono riuscito a spostarlo.': 'I could not move it.',
  'Non sono riuscito a toglierlo.': 'I could not remove it.',
  'Tolto dalla lista.': 'Off the list.',

  // — la colonna di sinistra —
  'Cerca  ⌘K': 'Search  ⌘K',
  'Chat': 'Chat',
  'Automazioni': 'Automations',
  'Mappa': 'Map',
  'Connettori': 'Sources',
  'Preferenze': 'Preferences',
  'Esci': 'Sign out',
  'Nuova chat': 'New chat',
  'Connessioni': 'Connections',

  // — il feed —
  'Fatto': 'Done',
  'di più': 'more',
  'meno': 'less',
  'Chiedi a Myynd': 'Ask Myynd',
  'Più tardi': 'Later',
  'Rimandala in fondo': 'Push it to the back',
  'Apri il documento': 'Open the document',
  'Non è così?': 'Not right?',
  'Già fatto': 'Already done',
  'Aggiornato altrove': 'Updated elsewhere',
  'Non mi interessa': 'Not relevant',
  'Altro…': 'Something else…',
  'Il documento qui è indietro': 'The document here is behind',
  'Non me la riproporre': "Don't bring it back",
  'Quando nessuna delle due basta': "When neither of those fits",
  'Altro': 'More',
  "Com'è andata?": 'What actually happened?',
  "L'ho mandato lunedì col listino nuovo": 'Sent it Monday with the new price list',
  'Segno…': 'Saving…',
  'Annulla (Esc)': 'Cancel (Esc)',
  'Fatte': 'Done',
  'Vedi': 'View',
  'Nascondi': 'Hide',
  'Rimetti in cima': 'Put it back on top',
  'Vedi tutto': 'Show all',
  'Richiudi': 'Collapse',
  'fonti': 'sources',
  'documenti': 'documents',
  'Dimmi su cosa concentrarmi': 'Tell me what to focus on',
  'Guardo prima:': 'I look here first:',
  'Questa settimana solo i preventivi e i pagamenti': 'This week only quotes and payments',
  'Salva': 'Save',
  'Niente che richieda te, adesso.': 'Nothing needs you right now.',
  'Una cosa da chiarire.': 'One thing to clear up.',
  'La tua mente è ancora vuota.': 'Your mind is still empty.',
  'Fai una lettura': 'Read now',
  'Leggi adesso': 'Read now',
  'Vai ai connettori': 'Go to sources',
  'Rileggi tutto': 'Read everything again',
  'Scollega': 'Disconnect',
  'Collega': 'Connect',
  'Torna al feed': 'Back to the feed',

  // — quando è lui a chiedere —
  'Myynd chiede': 'Myynd asks',
  'Bastano cinque parole': 'Five words is plenty',
  'Rispondi': 'Answer',
  'Perché me lo chiedi?': 'Why are you asking?',
  'Hai tolto di mezzo queste senza dirmi perché:': "You pushed these away without telling me why:",
  'Lascia perdere: non te lo richiedo': "Drop it: I won't ask again",

  // — la chat —
  'Cerco tra le fonti': 'Looking through the sources',
  'Cosa vuoi sapere?': 'What do you want to know?',
  'Chiedi qualcosa al tuo materiale…': 'Ask your material something…',
  'Collega Claude per fare domande': 'Connect Claude to ask questions',

  // — le preferenze —
  'Autonomia': 'Autonomy',
  'Tono': 'Tone',
  'Con quale modello ragiona': 'Which model it thinks with',
  'Lingua': 'Language',
  'Traduco…': 'Translating…',
  'Non sono riuscito a cambiare lingua.': "I couldn't change the language.",
  'Quanto restano le cose fatte': 'How long done things stay',
  'Sfondo in movimento': 'Moving background',
  'Le tue fonti': 'Your sources',
  'Apri': 'Open',
  'Un giorno': 'One day',
  'Due giorni': 'Two days',
  'Una settimana': 'One week',
  'Sempre': 'Forever',
  'Più avanti': 'Later on',
  'Attivi': 'Active',
  'Da collegare': 'To connect',

  // — gli avvisi —
  'Segnata come fatta.': 'Marked as done.',
  'Segnato.': 'Noted.',
  'Non trovo più il documento.': "I can't find that document any more.",
  'Da adesso guardo prima lì.': "From now on I'll look there first.",
  'Fuoco tolto.': 'Focus cleared.',
  'Non sono riuscito a segnarlo.': "I couldn't save that.",
  'Non sono riuscito a rispondere.': "I couldn't answer.",

  // — i moduli per collegare le fonti —
  'Usa la chiave che c\'è già': "Use the key that's already here",
  'Ne ho trovata una in ANTHROPIC_API_KEY. Oppure incollane un\'altra qui sotto.':
    'I found one in ANTHROPIC_API_KEY. Or paste a different one below.',
  'Chiave API': 'API key',
  'Collega Claude': 'Connect Claude',
  'La password resta su questa macchina.': 'The password stays on this machine.',
  'Indirizzo': 'Address',
  'Password della casella': 'Mailbox password',
  'Cerco il tuo server…': 'Looking for your server…',
  'Server trovato:': 'Server found:',
  'non è questo': "that's not it",
  'Server IMAP': 'IMAP server',
  'Giorni': 'Days',
  'Collega la posta': 'Connect mail',
  'PDF, Word, testo. Solo lettura, solo dove dici tu.':
    'PDF, Word, plain text. Read-only, and only where you say.',
  'Oppure un percorso': 'Or a path',
  'Collega il desktop': 'Connect the desktop',
  'Token da notion.so/my-integrations. Poi condividi con l\'integrazione le pagine da leggere.':
    'Token from notion.so/my-integrations. Then share the pages to read with the integration.',
  'Token di integrazione': 'Integration token',
  'Collega Notion': 'Connect Notion',
  'Provo…': 'Trying…',

  // — le preferenze, i paragrafi —
  'Se lo schermo tremola, spegnilo: restano i colori, si ferma il movimento.':
    'If the screen flickers, switch it off: the colours stay, the motion stops.',
  'In che lingua ti risponde e scrive il feed. I documenti li legge comunque nella lingua in cui sono.':
    'The language it answers and writes the feed in. It still reads documents in whatever language they are.',
  'Poi spariscono dalla pagina. Non si cancellano: servono comunque a non riproporti quello che hai già liquidato.':
    "Then they leave the page. They aren't deleted: they still keep me from bringing back what you've already dealt with.",
  'Dove stanno i tuoi dati': 'Where your data lives',
  'Collega o scollega quando vuoi, senza rifare tutto.':
    'Connect or disconnect whenever you like, without starting over.',

  // — il feed, i paragrafi —
  'Vale per tutte le letture che verranno, finché non lo cambi. Lascialo vuoto per farmi tornare a guardare tutto.':
    'It applies to every reading from now on, until you change it. Leave it empty to make me look at everything again.',
  'Quello che mi hai detto rispondendo me lo tengo: non te lo ripropongo, e la prossima lettura parte da lì.':
    "What you told me in your replies I keep: I won't bring it back, and the next reading starts from there.",
  'Hai sistemato tutto. Alla prossima lettura guardo se nel frattempo è cambiato qualcosa.':
    'You have cleared everything. At the next reading I will check whether anything changed.',
  'Ho letto tutto, ma non ho ancora tirato fuori niente da segnalarti.':
    "I have read everything, but nothing has come up worth flagging yet.",
  'Ho letto tutto. Per farmi scegliere cosa conta serve Claude collegato.':
    'I have read everything. To let me choose what matters, Claude needs to be connected.',
  'Non hai ancora collegato niente. Myynd non ha nulla da leggere.':
    'You have not connected anything yet. Myynd has nothing to read.',
  'Le fonti sono collegate ma non ho ancora letto niente.':
    'The sources are connected but I have not read anything yet.',

  // — le altre schermate —
  'Niente che corrisponda.': 'Nothing matches.',
  'Non c\u2019è ancora niente da cercare.': 'There is nothing to search yet.',
  'Annulla': 'Cancel',
  'Elimina': 'Delete',
  'Aggiungi qualcosa, se serve': 'Add anything else, if it helps',
  'Salvala come documento…': 'Save it as a document…',
  'Falla fare a Claude Code…': 'Hand it to Claude Code…',
  'In quale progetto': 'Which project',
  'Guarda e dimmi cosa faresti': 'Look, and tell me what you would do',
  'Guardo il progetto…': 'Reading the project…',
  'Fallo davvero': 'Do it for real',
  'Lo sto facendo…': 'Doing it…',
  'Legge il progetto e scrive cosa farebbe. Non tocca niente.': 'It reads the project and writes what it would do. It touches nothing.',
  'Adesso cambia i file davvero, come nel piano qui sopra.': 'Now it changes the files for real, following the plan above.',
  'Claude Code non è installato su questo computer.': 'Claude Code is not installed on this computer.',
  'Claude Code non è collegato: apri un terminale e fai «claude» una volta.': 'Claude Code is not signed in: open a terminal and run “claude” once.',
  'Claude Code non ce l’ha fatta.': 'Claude Code could not do it.',
  'Posso lavorare solo nelle cartelle che hai collegato.': 'I can only work in the folders you connected.',
  'Collega una cartella del desktop e potrò lavorarci.': 'Connect a Desktop folder and I can work there.',
  'Dimmi in quale cartella lavorare.': 'Tell me which folder to work in.',
  'Non c’è niente da chiedergli.': 'There is nothing to ask it.',
  'Si è fermato dopo il tempo massimo: quello che ha fatto è qui sopra.': 'It stopped at the time limit: what it did is above.',
  'Come si chiama': 'What it is called',
  'Dove': 'Where',
  'Salva e apri': 'Save and open',
  'Word, Pages': 'Word, Pages',
  'testo semplice': 'plain text',
  'Non c’è ancora niente da salvare.': 'There is nothing to save yet.',
  'Collega una cartella del desktop e potrò scriverci.': 'Connect a Desktop folder and I can write there.',
  'Posso scrivere solo nelle cartelle che hai collegato.': 'I can only write in the folders you connected.',
  'Non so scrivere quel tipo di file.': 'I do not know how to write that kind of file.',
  'So aprire i file solo su Mac, per ora.': 'I can only open files on a Mac, for now.',
  'Vai': 'Go',
  'Cerca automazioni nuove': 'Check for new automations',
  'Guardo…': 'Checking…',
  'Nessuna novità.': 'Nothing new.',
  'Non è impostato nessun repository di ricette.': 'No recipe repository is set.',
  'Il repository si scrive «proprietario/nome».': 'The repository is written “owner/name”.',
  'Da mettere nel cestino': 'To move to the bin',
  'Da archiviare': 'To archive',
  'Li sposto…': 'Moving them…',
  'si spostano, non si cancellano': 'they are moved, not deleted',
  'Myynd non risponde.': 'Myynd is not responding.',
  'Myynd non è riuscito ad avviarsi.': 'Myynd could not start.',
  'Non risponde su questo computer. Sto riprovando da solo: se non torna, chiudi Myynd e riaprilo.':
    'It is not answering on this computer. I keep trying on my own: if it does not come back, quit Myynd and open it again.',
  'Riprova adesso': 'Try now',
  'riprovo…': 'trying…',
  'nessuna ancora': 'none yet',
  'Niente da mostrare: collega una fonte e fai leggere qualcosa a Myynd.':
    'Nothing to show: connect a source and let Myynd read something.',
  'Espandi': 'Expand',
  'trascina per girare · rotella per lo zoom': 'drag to turn · scroll to zoom',
  'Rimetti a fuoco': 'Recentre',
  "Questi hanno bisogno di un'app registrata o di un OAuth: restano qui perché fanno parte del disegno, ma non sono ancora collegabili.":
    'These need a registered app or an OAuth flow: they stay here because they are part of the design, but they cannot be connected yet.',

  "Un'automazione è una routine che Myynd esegue da sola: archiviare le fatture che tornano, preparare il brief prima di una call, scrivere il sollecito dopo quindici giorni.":
    'An automation is a routine Myynd runs on its own: filing the invoices that come back, preparing the brief before a call, writing the chaser after fifteen days.',
  'Perché possa proporne una deve prima vedere la stessa cosa ripetersi nel tuo materiale. Continua a usarla: le prime arrivano da sole, e niente parte senza il tuo sì.':
    'Before it can propose one it has to see the same thing repeat in your material. Keep using it: the first ones arrive on their own, and nothing starts without your yes.',

  // — le opzioni delle preferenze —
  'Solo osservare': 'Watch only',
  'Legge e indicizza. Risponde solo se le chiedi.': 'Reads and indexes. Answers only when asked.',
  'Preparare e aspettare': 'Prepare and wait',
  'Scrive bozze e brief, niente esce senza il tuo Invia.': 'Writes drafts and briefs; nothing goes out without your Send.',
  'Agire sulla routine': 'Act on the routine',
  'Archivia e risponde dove hai già confermato tre volte.': "Files and replies where you've already confirmed three times.",
  'Diretto': 'Direct',
  'Cordiale': 'Warm',
  'Formale': 'Formal',
  'Il più rapido e il più economico. Basta finché le domande sono semplici.':
    'The fastest and cheapest. Enough while the questions stay simple.',
  'Il predefinito. Quasi la qualità di Opus sul tuo materiale, a meno della metà.':
    'The default. Nearly Opus quality on your material, at under half the cost.',
  'Il più capace. Si sente sulle domande che intrecciano più documenti; costa cinque volte tanto.':
    'The most capable. It shows on questions that weave several documents together; it costs five times as much.',
  '"Ciao Marta, ti mando il preventivo aggiornato. Consegna quattro settimane dalla conferma."':
    '"Hi Marta, sending the updated quote. Delivery four weeks from confirmation."',
  '"Ciao Marta, come promesso ti mando il preventivo aggiornato: spero sia tutto chiaro, fammi sapere."':
    '"Hi Marta, as promised here is the updated quote, hope it all makes sense. Let me know."',
  '"Gentile Dott.ssa Ferri, in allegato il preventivo aggiornato come da Sua richiesta. Resto a disposizione."':
    '"Dear Ms Ferri, please find attached the updated quote as requested. I remain at your disposal."',

  // — le domande pronte della chat —
  'Cosa è arrivato oggi?': 'What came in today?',
  'Chi aspetta una mia risposta?': "Who is waiting on me?",
  'Riassumimi la settimana': 'Sum up the week',

  // — accesso e primo avvio —
  'Resta su questo computer.': 'Stays on this computer.',
  'Restano su questo computer.': 'They stay on this computer.',
  'Questa mente è vuota.': 'This mind is empty.',
  'Riempila con quello che leggi e scrivi.': 'Fill it with what you read and write.',
  'Cominciamo': 'Get started',
  'Come ti chiami?': 'What is your name?',
  'Per scrivere come scrivi tu.': 'So it writes the way you do.',
  'Nome': 'Name',
  'Ruolo': 'Role',
  'Titolare': 'Owner',
  'Salta': 'Skip',
  'Collega Claude.': 'Connect Claude.',
  'Senza, resta solo un archivio.': 'Without it, this is only an archive.',
  'Lo collego dopo': "I'll connect it later",
  'Cosa le fai leggere?': 'What do you let it read?',
  'Prima lettura.': 'First reading.',
  'Fai la prima lettura': 'Run the first reading',
  'Pronta.': 'Ready.',
  'Entra': 'Enter',
  'Collegato.': 'Connected.',
  'mi collego…': 'connecting…',
  'Email': 'Email',
  'Password': 'Password',

  // — la ricerca —
  'Niente da cercare ancora': 'Nothing to search yet',
  'Nessun risultato.': 'No results.',

  // — la memoria: quello che Myynd sa di te —
  'Memoria': 'Memory',
  'Quello che Myynd sa di te, separato da quello che ha letto. I documenti sono fatti; qui sta il giudizio, e puoi cambiarlo.':
    'What Myynd knows about you, kept apart from what it has read. Documents are facts; this is judgement, and you can change it.',
  'Come lavori': 'How you work',
  'Cinque domande. Quello che scrivi qui sta in cima a ogni ragionamento, sempre.':
    'Five questions. What you write here sits at the top of every answer, always.',
  'Non gliel’hai ancora detto.': 'You have not told it yet.',
  'caratteri rimasti': 'characters left',
  'Salvo…': 'Saving…',
  'carico…': 'loading…',
  'Quello che ha capito': 'What it has worked out',
  'Ancora niente. Impara parlandoti, e da quello che correggi delle sue bozze.':
    'Nothing yet. It learns by talking with you, and from what you correct in its drafts.',
  'Aggiungine una tu: «non faccio sconti sotto i mille euro»': 'Add one yourself: “no discounts under a thousand euros”',
  'Aggiungi': 'Add',
  'Scordala': 'Forget it',
  'Quello che pensava prima': 'What it used to think',
  'Non si cancella niente: quando cambia idea, alla vecchia mette una data di fine. Così «fino a marzo pensavo X» resta una domanda con una risposta.':
    'Nothing is deleted: when it changes its mind, the old belief gets an end date. So “until March I thought X” stays a question with an answer.',
  'Com’è scritto nel suo prompt': 'How it reads in the prompt',
  'Alla lettera: è questo il testo che sta in cima a ogni domanda che gli fai.':
    'Word for word: this is the text that sits above every question you ask it.',
  'Ancora niente da dire su di te.': 'Nothing to say about you yet.',

  // il genere di una convinzione, e quanto ci crede
  'esplicita': 'told to it',
  'dedotta': 'inferred',
  'indotta': 'noticed',
  'certo': 'certain',
  'probabile': 'likely',
  'da confermare': 'unconfirmed',
  'da': 'from',
  'perché': 'why',
  'dedotta da': 'inferred from',
  'fino al': 'until',

  // da dove viene una convinzione: sono chiavi dinamiche, il test non le vede
  'onboarding': 'setup',
  'conversazione': 'a conversation',
  'correzione': 'a correction',
  'chiusura': 'closing a task',
  'abbandono': 'dropping a task',
  'domanda': 'a question it asked',
  'scarti': 'what you keep dismissing',
  'mano': 'you, by hand',

  // le cinque domande, come le scrive il server in BLOCCHI_BASE
  'Come questa persona prende una decisione: cosa pesa, in che ordine.':
    'How this person makes a decision: what they weigh, and in what order.',
  'Cosa verifica sempre prima di dire di sì o di firmare.':
    'What they always check before saying yes or signing.',
  'Il tono e le abitudini di scrittura: come apre, come chiude, cosa non dice mai.':
    'Tone and writing habits: how they open, how they close, what they never say.',
  'Gli sbagli che ha già visto fare e che non vuole rivedere.':
    'Mistakes they have already seen made and do not want to see again.',
  'Le persone, i clienti e i fornitori che ricorrono, e come si sta con ciascuno.':
    'The people, clients and suppliers who come up often, and where things stand with each.',
  'Su cosa vuole che Myynd si concentri adesso.': 'What they want Myynd to focus on right now.',
  // — il primo avvio e il pannello delle connessioni —
  'Leggo.': 'Reading.',
  'La prima volta è la più lunga.': 'The first time is the longest.',
  'mi collego': 'connecting',
  'Collegane almeno una': 'Connect at least one',
  'Serve Claude. Puoi saltarla.': 'Claude is needed. You can skip this.',
  'Metto da parte quello che sembra richiedere te.': 'Setting aside whatever looks like it needs you.',
  'Ancora vuota.': 'Still empty.',
  'Da console.anthropic.com.': 'From console.anthropic.com.',
  'La chiave da console.anthropic.com. Senza, Myynd non ragiona.':
    'The key from console.anthropic.com. Without it, Myynd cannot reason.',
  'Consenti': 'Allow',
  'Collego…': 'Connecting…',
  'leggo…': 'reading…',
  'Scrivania, Documenti e Download in sola lettura': 'Desktop, Documents and Downloads, read-only',
  ', e ': ', and ',
  'la chiave di Claude che è già qui': 'the Claude key already on this machine',
  '. Posta e Notion no: servono le tue credenziali.': '. Not Mail or Notion: those need your credentials.',
  'Chiedi…': 'Ask…',
  // — il modello che gira su questa macchina —
  'Il lavoro piccolo, su questo computer': 'The small work, on this computer',
  'Acceso': 'On',
  'Spento: fa tutto Claude.': 'Off: Claude does everything.',
  'Nessun modello trovato su questa macchina.': 'No model found on this machine.',
  'Titoli delle chat, traduzioni, e quello che si segna di te: se qui c’\u00e8 un modello acceso lo fa lui e non costa niente. Le risposte e le bozze restano a Claude, perch\u00e9 \u00e8 l\u00ec che sbagliare costa.':
    'Chat titles, translations, and what it notes down about you: if a model is running here it does that work, for nothing. Answers and drafts stay with Claude \u2014 that is where being wrong costs.',
  'Trascina per spostarla': 'Drag to move it',
  // — mandare per email —
  'Mandala per email…': 'Send it by email…',
  'Preparo l’email…': 'Preparing the email…',
  'A': 'To',
  'Oggetto': 'Subject',
  'Quello che riceve': 'What they receive',
  'nome@dominio.it': 'name@domain.com',
  'Nel materiale non ho trovato un indirizzo: scrivilo tu.':
    'I found no address in the material: write it yourself.',
  'Non ho mai visto questo indirizzo nella tua posta. Controllalo.':
    'I have never seen this address in your mail. Check it.',
  'Mando…': 'Sending…',
  'parte dalla tua casella': 'sent from your own mailbox',
  '‹ tutte le fonti': '‹ all sources',
  'Riordina': 'Tidy it up',
  'Riordino…': 'Tidying…',
  'Rimetti com’era': 'Put it back',
  'Le rimetto nella tua lingua…': 'Putting them into your language…',
  'azienda': 'the company',
  // — le automazioni —
  'quando arriva qualcosa di nuovo': 'when something new arrives',
  'ogni giorno alle': 'every day at',
  'ogni': 'every',
  'alle': 'at',
  'lunedì': 'Monday',
  'martedì': 'Tuesday',
  'mercoledì': 'Wednesday',
  'giovedì': 'Thursday',
  'venerdì': 'Friday',
  'sabato': 'Saturday',
  'domenica': 'Sunday',
  'mette una riga in': 'puts a line in',
  'prepara la bozza e la mette in': 'writes the draft and puts it in',
  'Non è ancora girata.': 'Has not run yet.',
  'l’ultima': 'last',
  'Falla girare adesso': 'Run it now',
  'Gira…': 'Running…',
  'Spegnila': 'Turn it off',
  'Accendila': 'Turn it on',
  'Fatto: guarda in lista.': 'Done: look in your list.',
  'Ce n’è già una in lista da questa.': 'There is already one in your list from this.',
  'Ha guardato, e non c’era niente.': 'It looked, and there was nothing.',
  'Non ce l’ha fatta.': 'It could not.',
  'Su questa installazione non ce n’è nessuna.': 'There are none on this installation.',
  'Le automazioni arrivano insieme all’app, disegnate sul lavoro della tua azienda. Se qui è vuoto, chiedile a chi te l’ha installata.':
    'Automations come with the app, designed around your company\u2019s work. If this is empty, ask whoever installed it for you.',
  'Quello che leggono resta su questo computer. Le automazioni descrivono solo cosa guardare e cosa farne: non contengono niente di tuo.':
    'What they read stays on this computer. An automation only describes what to look at and what to do with it: it contains nothing of yours.',

// — la rassegna —
  'La rassegna': 'The briefing',
  'oggi': 'today',
  'la settimana': 'the week',
  'ieri': 'yesterday',
  'Guarda i giornali': 'Check the papers',
  'Sto guardando i giornali…': 'Reading the papers…',
  'Hai finito la rassegna di oggi. La settimana è qui accanto.': 'You are through today’s briefing. The week is right there.',
  'Hai letto tutto. I giornali tornano fra qualche ora.': 'You have read it all. The papers come back in a few hours.',
  'Letta': 'Read',
  'Da come leggi': 'From how you read',
  'Con il tuo abbonamento': 'With your own subscription',
  'Claude Code non è su questa macchina.': 'Claude Code is not on this machine.',
  'Claude Code ci ha messo troppo.': 'Claude Code took too long.',
  'Claude Code ha risposto in un modo che non capisco.': 'Claude Code answered in a way I do not understand.',
  'Acceso: il lavoro grosso passa da Claude Code.': 'On: the heavy work goes through Claude Code.',
  'Spento: si paga a consumo con la chiave.': 'Off: paid per use with the API key.',
  'Claude Code è su questo computer ed è già entrato con il tuo account. Acceso, le risposte e le bozze passano di lì e non costano niente oltre a quello che paghi già. Myynd non vede le tue credenziali: lancia il programma che hai tu.':
    'Claude Code is on this computer and already signed in with your account. Switched on, answers and drafts go through it and cost nothing beyond what you already pay. Myynd never sees your credentials: it runs the program you have.',
  'L’ultima volta non ha risposto: per qualche minuto uso la chiave.':
    'It did not answer last time: for a few minutes I will use the key.',
  'Con il tuo abbonamento.': 'On your own subscription.',
  'Usa il tuo abbonamento': 'Use your subscription',
  'Ho una chiave API': 'I have an API key',
  'Un momento…': 'One moment…',
  'Claude Code è su questo computer, già entrato con il tuo account. Myynd può ragionare di lì: non costa niente oltre all’abbonamento che paghi già, e le tue credenziali restano dove sono.':
    'Claude Code is on this computer, already signed in with your account. Myynd can reason through it: nothing to pay beyond the subscription you already have, and your credentials stay where they are.',
  'Claude Code non ha risposto niente.': 'Claude Code returned nothing.',
  'Installato, ma non ci sei ancora entrato.': 'Installed, but you have not signed in yet.',
  'Apri il Terminale, scrivi «claude» e fai l’accesso. Da lì in poi Myynd può ragionare con l’abbonamento che paghi già, invece che a consumo con la chiave.':
    'Open Terminal, type “claude” and sign in. From then on Myynd can reason on the subscription you already pay for, instead of per use with the API key.',
  'Hai Claude Code su questo computer. Se fai l’accesso — Terminale, scrivi «claude» — Myynd può ragionare con l’abbonamento che paghi già, e non ti serve nessuna chiave.':
    'You have Claude Code on this computer. Sign in — Terminal, type “claude” — and Myynd can reason on the subscription you already pay for, with no API key at all.',
  'Claude Code è installato ma non ci sei ancora entrato. Apri il Terminale, scrivi «claude» e fai l’accesso.':
    'Claude Code is installed but you have not signed in yet. Open Terminal, type “claude” and sign in.',
  'Claude Code non ha risposto, e non c’è una chiave di riserva.':
    'Claude Code did not answer, and there is no API key to fall back on.',
// — quello che il server dice quando qualcosa va storto —
//
//   Non erano qui, e per questo comparivano in italiano sotto una riga inglese:
//   un messaggio d'errore nasce nel server, dove si scrive in italiano, e il
//   client lo passa da t() sperando di trovarlo. `lingua.test.ts` adesso
//   controlla che ce li siano tutti, così il prossimo non può sfuggire.
  'macOS non mi lascia usare Calendario. Concedilo in Impostazioni › Privacy › Automazione.': 'macOS will not let me use Calendar. Allow it in Settings › Privacy › Automation.',
  'Calendario non è disponibile su questo Mac.': 'Calendar is not available on this Mac.',
  'Calendario non ha risposto.': 'Calendar did not answer.',
  'Non ho capito la data.': 'I did not understand the date.',
  'Dimmi cosa vuoi cambiare.': 'Tell me what you want to change.',
  'Gli attrezzi devono essere un elenco.': 'The tools must be a list.',
  'Non sono riuscito a cambiarla. Riprova dicendola in un altro modo.': 'I could not change it. Try saying it a different way.',
  'Le ore devono essere un numero fra 0 e un anno.': 'The hours must be a number between 0 and a year.',
  'Non c\'è ancora niente da mandare.': 'There is nothing to send yet.',
  'Collega la posta e potrò mandarla.': 'Connect mail and I can send it.',
  'Non sono riuscito a ricavarne un\'email.': 'I could not turn it into an email.',
  'Manca un indirizzo valido.': 'A valid address is missing.',
  'Il messaggio è vuoto.': 'The message is empty.',
  'Non c\'è niente da eseguire.': 'There is nothing to run.',
  'Collega la posta e potrò farlo.': 'Connect mail and I can do it.',
  'Non ce n\'è nessuno che si possa spostare.': 'There is nothing that can be moved.',
  'Non c\'è ancora niente da salvare.': 'There is nothing to save yet.',
  'Questa automazione non è tua da buttare.': 'This automation is not yours to throw away.',
  'Non conosco questa automazione.': 'I do not know this automation.',
  'Questa cartella non c’è.': 'That folder is not there.',
  'Ce n’è già una che si chiama così.': 'There is already one called that.',
  'Non si può: o non c’è, o ce n’è già una con quel nome.': 'Cannot: either it is not there, or one with that name already exists.',
  'Non c\'è niente da riordinare.': 'There is nothing to tidy.',
  'Non sono riuscito a riordinarla.': 'I could not tidy it.',
  'Per svuotare la mente serve la conferma con la tua email.': 'Emptying the mind needs confirmation with your email address.',
  'La chiave di Claude è senza credito. Ricaricala su console.anthropic.com.': 'The Claude key is out of credit. Top it up at console.anthropic.com.',
  'Il modello ha rifiutato la richiesta. Prova a cambiarlo nelle preferenze.': 'The model refused the request. Try changing it in Preferences.',
  'Collega Claude e potrò ragionare sul tuo materiale.': 'Connect Claude and I can reason over your material.',
  'Non c’è niente da salvare.': 'There is nothing to save.',
// — gli attrezzi di un'automazione (src/automazioni/) —
//   Quattro chiavi che quel pezzo usa e che qui non c'erano: senza, quelle
//   parole restano italiane con l'app in inglese.
  'Staccalo': 'Detach it',
  'cosa può aprire': 'what it can open',
  'da collegare': 'to connect',
  'non è collegato': 'not connected',
// — le automazioni —
  'Guardano i tuoi documenti a un’ora che decidi tu e ti lasciano una riga in lista. Non mandano niente a nessuno.':
    'They look through your documents at an hour you choose and leave you a line in your list. They send nothing to anyone.',
  'Scrivine una tua': 'Write your own',
  'Dilla a parole tue, la scrivo io.': 'Say it in your own words, I will write it.',
  'Ogni lunedì mattina dimmi quali preventivi sono ancora senza risposta':
    'Every Monday morning tell me which quotes are still unanswered',
  'Dille quando guardare, cosa cercare e cosa fartene. Al resto penso io: nasce in pausa, la provi, e la accendi quando ti convince.':
    'Tell it when to look, what to look for and what to make of it. I will handle the rest: it starts paused, you try it, and you switch it on when it convinces you.',
  'Creala': 'Create it',
  'La scrivo…': 'Writing it…',
  'Provala adesso': 'Try it now',
  'Modificala': 'Edit it',
  'Buttala': 'Throw it away',
  'In pausa': 'Paused',
  'Gira da sola': 'Runs on its own',
  'non gira finché non la riaccendi': 'it will not run until you switch it back on',
  'Mettila in pausa': 'Pause it',
  'Falla girare da sola': 'Let it run on its own',
  'Cosa fa, in una riga': 'What it does, in one line',
  'Quando gira': 'When it runs',
  'In che giorno': 'On which day',
  'A che ora': 'At what time',
  'Che parole cercare': 'Which words to look for',
  'Cosa deve farne': 'What it should do with them',
  'Cosa ne fa': 'What it makes of it',
  'Dove la mette': 'Where it puts it',
  'ogni giorno': 'every day',
  'ogni settimana': 'every week',
  'quando arriva qualcosa': 'when something comes in',
  'le parole da cercare nei tuoi documenti — vuoto: guarda tutto':
    'the words to look for in your documents — empty: it looks at everything',
  'mette solo una riga': 'just leaves a line',
  'prepara anche la bozza': 'writes the draft too',
  'in Oggi': 'in Today',
  'in Questa settimana': 'in This week',
  'in Prima o poi': 'in Sooner or later',
  'Non ce n’è ancora nessuna. Scrivine una qui sotto.': 'There are none yet. Write one below.',
  'Scrive': 'Writes',
  'Segnala': 'Flags',
  'Mette via': 'Tidies',
  'E poi': 'And then',
  'Cosa deve fare': 'What it should do',
  'Salvata.': 'Saved.',
  'Quando arriva una fattura, controlla l’importo e mettimela in lista':
    'When an invoice arrives, check the amount and put it on my list',
  'Ogni sera prepara la risposta a chi mi ha scritto e aspetta ancora':
    'Every evening draft the reply to whoever wrote to me and is still waiting',
  'Dimmi in una frase cosa dovrebbe fare.': 'Tell me in one sentence what it should do.',
  'Non sono riuscito a scriverla. Riprova dicendola in un altro modo.':
    'I could not write it. Try saying it a different way.',
  'Non la trovo.': 'I cannot find it.',
  'Niente di nuovo dai giornali.': 'Nothing new from the papers.',
  'Non ho ancora guardato i giornali.': 'I have not looked at the papers yet.',
  'Non sono riuscito a raggiungere nessun giornale.': 'I could not reach any of the papers.',
  'Di cosa ti tengo aggiornato': 'What I keep you up to date on',
  'I giornali li leggo io ogni mattina. Scrivi qui cosa ti interessa e scelgo quelle: se lasci vuoto, ti do un po’ di tutto.':
    'I read the papers every morning. Write what you care about and I will pick those: leave it empty and you get a bit of everything.',
  'intelligenza artificiale, startup, Medio Oriente, mercati': 'artificial intelligence, startups, the Middle East, markets',
  'Vuoto vuol dire: dammi un po’ di tutto.': 'Empty means: give me a bit of everything.',
  'Salvato': 'Saved',

  // — le automazioni: la griglia, le cartelle, la chiocciola —
  'Nuova': 'New',
  'Tutte': 'All',
  'cartelle': 'folders',
  'Nuova cartella': 'New folder',
  'come si chiama': 'what it’s called',
  'Rinominala': 'Rename it',
  'Butta la cartella': 'Delete the folder',
  'in nessuna cartella': 'in no folder',
  'In che cartella': 'Which folder',
  'Questa cartella è vuota. Trascinacene dentro una.': 'This folder is empty. Drag one into it.',
  'Guardano quello che gli hai concesso di guardare, all’ora che decidi tu, e ti lasciano una riga in lista. Non mandano niente a nessuno.': 'They look at what you let them look at, at a time you choose, and leave you a line on your list. They never send anything to anyone.',
  'Non ce n’è ancora nessuna. Scrivine una a parole: dille quando guardare e cosa può aprire.': 'There aren’t any yet. Write one in words: tell it when to look and what it may open.',
  'Scrivine una a parole': 'Write one in words',
  'manca una connessione': 'a connection is missing',
  'A parole': 'In words',
  'I campi': 'The fields',
  'Ottimizza': 'Optimise',
  'Falla guardare a Claude e falla scrivere meglio': 'Have Claude look at it and write it better',
  'Riscritta. Guarda cosa è cambiato prima di accenderla.': 'Rewritten. Look at what changed before you switch it on.',
  'Fatto. Guarda com’è venuta.': 'Done. See how it turned out.',
  'Cosa vuoi cambiare': 'What do you want to change',
  'Dillo come lo diresti a voce. Tengo tutto il resto com’è. Con @ aggiungi cosa può aprire.': 'Say it the way you’d say it out loud. I keep everything else as it is. Use @ to add what it may open.',
  'falla girare anche il sabato, e guarda pure in @': 'run it on Saturdays too, and look in @ as well',
  'Riscrivila': 'Rewrite it',
  'La riscrivo…': 'Rewriting…',
  'Cosa può aprire': 'What it may open',
  'Solo quello che le serve: ognuno è un permesso.': 'Only what it needs: each one is a permission.',
  'Uno di questi non è collegato: finché non lo colleghi, quell’automazione non troverà niente.': 'One of these isn’t connected: until you connect it, that automation will never find anything.',
  'In che cartella lavora Claude Code': 'Which folder Claude Code works in',
  'Legge il progetto e scrive cosa farebbe. Non tocca un file: quello lo decidi tu.': 'It reads the project and writes what it would do. It touches no file: that’s your call.',
  'Collega una cartella del desktop e potrà lavorarci.': 'Connect a desktop folder and it will be able to work there.',
  '— scegline una —': '— pick one —',
  'Le parole di chi ha scritto quei documenti, nella loro lingua. Vuoto: guarda tutto.': 'The words of whoever wrote those documents, in their language. Empty: it looks at everything.',
  'Scrivi @ per dirle cosa può aprire — la posta, il desktop, l’agenda. Al resto penso io: nasce in pausa, la provi, e la accendi quando ti convince.': 'Type @ to tell it what it may open — your email, your desktop, your calendar. I’ll do the rest: it starts paused, you try it, and you switch it on when it convinces you.',
  'Fuori dalle cartelle': 'Outside every folder',
  'Nessuna apre questo, per ora.': 'None of them opens this, for now.',
  'Sicuro?': 'Sure?',
  'per cosa aprono': 'by what they open',
  'Ogni lunedì dimmi quali preventivi in @ sono ancora senza risposta': 'Every Monday tell me which quotes in @ are still unanswered',
}

/** La frase nella lingua scelta. Se manca la traduzione resta l'italiano. */
export function t(s: string): string {
  return corrente === 'en' ? (EN[s] ?? s) : s
}

/**
 * Le frasi che contengono un numero o un nome.
 *
 * Tenerle intere invece di incollare pezzi è quello che permette all'inglese di
 * mettere le parole nel suo ordine: «2 fonti» e «2 sources» combaciano, ma
 * «Due cose, da guardare» e «Two things to look at» no.
 */
export const frasi = {
  // — la rassegna —
  //
  // Le età stanno corte apposta: sono la seconda cosa su una riga di testata,
  // accanto al nome del giornale, e «due ore e mezza fa» in quel posto pesa più
  // della notizia.
  minutiFa: (n: number) => corrente === 'en' ? `${n} min ago` : `${n} min fa`,
  oreFa: (n: number) => corrente === 'en' ? `${n}h ago` : `${n} h fa`,
  daLeggere: (n: number) => corrente === 'en' ? `${n} to read` : `${n} da leggere`,
  leggiSu: (fonte: string) => corrente === 'en' ? `Read on ${fonte}` : `Leggi su ${fonte}`,
  guardatiIGiornali: (quando: string) => corrente === 'en'
    ? `Papers checked ${quando}` : `Giornali guardati ${quando}`,

  // — le automazioni —
  //
  // La riga che toglie il dubbio fra l'interruttore e il bottone: acceso vuol
  // dire che gira da sola, e questa dice quando.
  giraDaSolaProssima: (quando: string) => corrente === 'en'
    ? `Runs on its own · next ${quando}` : `Gira da sola · la prossima ${quando}`,

  daFare: (n: number) => corrente === 'en'
    ? (n === 1 ? 'One thing to do.' : `${n} things to do.`)
    : (n === 1 ? 'Una cosa da fare.' : `${n} cose da fare.`),
  bozzeInAttesa: (n: number) => corrente === 'en'
    ? (n === 1 ? 'one draft is waiting for you' : `${n} drafts are waiting for you`)
    : (n === 1 ? 'una bozza aspetta te' : `${n} bozze aspettano te`),

  fontiEDocumenti: (fonti: number, docs: string) =>
    corrente === 'en' ? `${fonti} sources · ${docs} documents` : `${fonti} fonti · ${docs} documenti`,

  daGuardare: (n: number, parola: string) =>
    corrente === 'en'
      ? (n === 1 ? 'One thing to look at.' : `${n} things to look at.`)
      : `${parola}, da guardare.`,

  cartelleNonLette: (n: number) => corrente === 'en'
    ? (n === 1 ? '1 folder could not be read' : `${n} folders could not be read`)
    : (n === 1 ? '1 cartella non letta' : `${n} cartelle non lette`),

  /**
   * L'automazione che gira e non trova mai niente.
   *
   * Il numero c'è apposta: «non trova niente» una volta è la risposta normale
   * — è quello che succede quasi sempre, ed è giusto — mentre sette volte di
   * fila è un'automazione che sta cercando parole che in quei documenti non
   * compaiono. Senza il conto, le due frasi si leggono uguali.
   */
  maiTrovatoNiente: (n: number) => corrente === 'en'
    ? `Nothing found ${n} times running` : `Non trova niente da ${n} giri`,

  /**
   * La stessa diagnosi, con lo spazio per dire cosa fare.
   *
   * Sulla scheda è una riga di sei parole, perché lì serve a scegliere quale
   * automazione aprire. Qui è aperta, e la frase corta diventerebbe un'accusa
   * senza rimedio: quello che serve è la causa più probabile, che nove volte
   * su dieci sono le parole della ricerca scritte nella lingua sbagliata.
   */
  maiTrovatoNienteLungo: (n: number) => corrente === 'en'
    ? `It has run ${n} times and never had anything to look at. Nearly always this is the search words: they have to be the words whoever wrote those documents would use, in their language.`
    : `È girata ${n} volte senza mai avere niente da guardare. Quasi sempre sono le parole della ricerca: devono essere quelle di chi ha scritto quei documenti, nella loro lingua.`,

  /**
   * Una risposta andata storta di cui il server non ha detto niente.
   *
   * Il numero c'è apposta. Senza, questa riga è la stessa per un 400, per un
   * 403 di un proxy davanti e per una risposta che non era JSON — tre cose che
   * si riparano in tre modi diversi, e nessun modo di sapere quale sia.
   */
  nonRiuscito: (stato: number) => corrente === 'en'
    ? `I could not manage it (${stato}). Try again.` : `Non ce l’ho fatta (${stato}). Riprova.`,

  /** Chi ha scritto quella riga del ritratto, e quando. */
  scrittoDaMe: (quando: string) => corrente === 'en'
    ? `Written by Myynd on ${quando}, from what it has learned` : `Scritto da Myynd il ${quando}, da quello che ha imparato`,

  ritrattoAggiornato: (blocchi: number, da: number) => corrente === 'en'
    ? `${blocchi === 1 ? '1 line' : `${blocchi} lines`} rewritten, from ${da} things it has noticed`
    : `${blocchi === 1 ? '1 riga riscritta' : `${blocchi} righe riscritte`}, da ${da} cose che ha notato`,

  /** Quanti documenti guarderebbe adesso: la risposta dell'anteprima. */
  neGuarderebbe: (n: number) => corrente === 'en'
    ? (n === 1 ? 'It would look at 1 document' : `It would look at ${n} documents`)
    : (n === 1 ? 'Ne guarderebbe 1' : `Ne guarderebbe ${n}`),

  girataVolte: (n: number) => corrente === 'en'
    ? (n === 1 ? 'Ran once' : `Ran ${n} times`)
    : (n === 1 ? 'Girata una volta' : `Girata ${n} volte`),
  /**
   * La via d'uscita da un filtro che non mostra niente.
   *
   * Porta il numero apposta: «Mostra tutte» non dice se dietro c'è qualcosa,
   * «Mostra tutte e tre» sì — ed è l'informazione che serve a chi in quel
   * momento sta pensando di averle cancellate tutte.
   */
  mostraTutte: (n: number) => corrente === 'en'
    ? `Show all ${n}` : `Mostra tutte e ${n}`,

  acceseSu: (accese: number, tutte: number) => corrente === 'en'
    ? `${accese} of ${tutte} on` : `${accese} di ${tutte} accese`,

  fatteConteggio: (n: number) => corrente === 'en' ? `Done · ${n}` : `Fatte · ${n}`,

  // — frasi con un numero o un nome dentro: non si possono mettere nel dizionario
  //   come chiavi, perché la chiave cambierebbe a ogni valore —
  scollegato: (nome: string) => corrente === 'en' ? `${nome} disconnected.` : `${nome} scollegato.`,
  coseNuove: (n: number) => corrente === 'en'
    ? (n === 1 ? 'One new thing in the feed.' : `${n} new things in the feed.`)
    : (n === 1 ? 'Una cosa nuova nel feed.' : `${n} cose nuove nel feed.`),
  segnatoRicordo: (cosa: string) => corrente === 'en'
    ? `Noted. And I will remember: ${cosa}` : `Segnato. E me lo ricordo: ${cosa}`,
  documentiEGruppi: (docs: string, gruppi: number) => corrente === 'en'
    ? `${docs} documents · ${gruppi} groups` : `${docs} documenti · ${gruppi} gruppi`,
  tuttoDa: (fonte: string) => corrente === 'en'
    ? `Everything that came from ${fonte}. Click a node to filter, or ask below.`
    : `Tutto quello che è arrivato da ${fonte}. Clicca un nodo per filtrare, o chiedi qui sotto.`,
  chiediSu: (fonte: string) => corrente === 'en' ? `Ask about ${fonte}…` : `Chiedi su ${fonte}…`,
  certificatoAltroNome: (nome: string) => corrente === 'en'
    ? `The certificate is issued to ${nome}: normal with this provider.`
    : `Il certificato è intestato a ${nome}: normale su questo provider.`,
  collegabiliOra: (n: number) => corrente === 'en'
    ? (n === 1 ? 'I can connect one right now' : `I can connect ${n} right now`)
    : (n === 1 ? 'Posso collegarne uno adesso' : 'Posso collegarne due adesso'),
  avantiCollegate: (n: number) => corrente === 'en'
    ? (n === 1 ? 'Next · 1 connected' : `Next · ${n} connected`)
    : (n === 1 ? 'Avanti · 1 collegata' : `Avanti · ${n} collegate`),
  documenti: (n: number) => corrente === 'en'
    ? (n === 1 ? '1 document.' : `${n} documents.`)
    : (n === 1 ? '1 documento.' : `${n} documenti.`),
  documentiDentro: (n: string) => corrente === 'en'
    ? `${n} documents inside. Ask it something.` : `${n} documenti dentro. Chiedile qualcosa.`,
  messeDaParte: (n: number) => corrente === 'en'
    ? (n === 1 ? '1 thing set aside.' : `${n} things set aside.`)
    : (n === 1 ? '1 cosa messa da parte.' : `${n} cose messe da parte.`),

  documentiLetti: (n: string) => corrente === 'en' ? `${n} documents read` : `${n} documenti letti`,

  attiviDaCollegare: (attivi: number, da: number) =>
    corrente === 'en' ? `${attivi} active · ${da} to connect` : `${attivi} attivi · ${da} da collegare`,

  /** Frasi che contengono un pezzo di interfaccia — un percorso, un comando. */
  doveStannoIDati: (dir: ReactNode, db: ReactNode, cfg: ReactNode): ReactNode[] =>
    corrente === 'en'
      ? ['Everything Myynd reads lives in ', dir, ' on this computer: the index in ', db,
         ' and the credentials in ', cfg, ', readable only by you. The only thing that leaves ' +
         'are the questions you ask Claude, with the pieces of document needed to answer.']
      : ['Tutto quello che Myynd legge sta in ', dir, " su questo computer: l'indice in ", db,
         ' e le credenziali in ', cfg, ', leggibile solo da te. ' +
         "L'unica cosa che esce sono le domande che fai a Claude, con i pezzi di documento che servono a rispondere."],

  riprovoFra: (s: number) => corrente === 'en' ? `Trying again in ${s}s` : `Riprovo fra ${s}s`,

  guardatoIl: (quando: string) => corrente === 'en' ? `last checked ${quando}` : `guardato il ${quando}`,
  salvatoIn: (nome: string) => corrente === 'en' ? `Saved as “${nome}”.` : `Salvato come «${nome}».`,
  /** Quello che è arrivato davvero: si dicono solo i numeri che non sono zero. */
  ricetteArrivate: (nuove: number, cambiate: number, tolte: number) => {
    const en = corrente === 'en'
    const p: string[] = []
    if (nuove) p.push(en ? `${nuove} new` : `${nuove} nuov${nuove === 1 ? 'a' : 'e'}`)
    if (cambiate) p.push(en ? `${cambiate} changed` : `${cambiate} cambiat${cambiate === 1 ? 'a' : 'e'}`)
    if (tolte) p.push(en ? `${tolte} removed` : `${tolte} tolt${tolte === 1 ? 'a' : 'e'}`)
    return p.join(' · ')
  },

  spostati: (n: number, dove: string) => corrente === 'en'
    ? (n === 1 ? `One message moved to “${dove}”.` : `${n} messages moved to “${dove}”.`)
    : (n === 1 ? `Un messaggio spostato in «${dove}».` : `${n} messaggi spostati in «${dove}».`),
  mettiViaTutti: (n: number, cestino: boolean) => corrente === 'en'
    ? (cestino ? `Move ${n} to the bin` : `Archive ${n}`)
    : (cestino ? `Mettine ${n} nel cestino` : `Archiviane ${n}`),

  /** Solo nel build di sviluppo: chi usa Myynd non ha un terminale aperto. */
  motoreGiuDev: (cmd: ReactNode): ReactNode[] =>
    corrente === 'en'
      ? ['Development build: the local server is not listening. ', cmd]
      : ['Build di sviluppo: il server locale non è in ascolto. ', cmd],

  letto: (docs: string, fonti: number) =>
    corrente === 'en'
      ? `I have read ${docs} documents from ${fonti} sources. Ask me anything: I will tell you where the answer comes from.`
      : `Ho letto ${docs} documenti da ${fonti} fonti. Chiedimi qualsiasi cosa: ti dico anche da dove viene la risposta.`,

  nienteLetto: () =>
    corrente === 'en'
      ? 'I have not read anything yet. Connect a source and come back.'
      : 'Non ho ancora letto niente. Collega una fonte e poi torna qui.',

  statoConnettore: (docs: number) =>
    corrente === 'en'
      ? (docs ? `${docs} documents` : 'connected')
      : (docs ? `${docs} documenti` : 'collegato'),

  nDocumenti: (n: string) => corrente === 'en' ? `${n} documents` : `${n} documenti`,

  cercaFra: (n: string) =>
    corrente === 'en' ? `Search ${n} documents…` : `Cerca fra ${n} documenti…`
}
