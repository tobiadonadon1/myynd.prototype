// La posta che esce da chi ospita: due messaggi, e nient'altro.
//
// **Non è il connettore «Posta».** Quello è la casella di chi usa Myynd, e
// serve a leggere la sua. Questa è la casella del *server*, e manda due sole
// cose: il collegamento che conferma un indirizzo appena registrato, e quello
// che rimette una password dimenticata. Nessun contenuto, nessun allegato,
// nessuna newsletter.
//
// **Senza queste variabili non cambia niente, ed è la parte importante.** Sul
// computer di una persona non c'è nessun server di posta da configurare e non
// deve essercene bisogno: chi si registra entra subito, e la password si
// cambia dalle preferenze o con `npm run password`, che gira dove sta il
// database. La verifica dell'indirizzo e il «l'ho dimenticata» esistono dove
// servono davvero — su un server, con più persone che non si conoscono e
// nessuno a cui telefonare.
//
//   MYYND_SMTP_HOST      il server di posta di chi ospita
//   MYYND_SMTP_PORTA     587 se non si dice (465 = TLS dal primo byte)
//   MYYND_SMTP_UTENTE    e password: solo se il server le chiede
//   MYYND_SMTP_PASSWORD
//   MYYND_SMTP_DA        da che indirizzo arrivano. Senza, l'utente SMTP.

import { OSPITATO, DOMINIO, PORTA } from './ospitato.ts'

export const HOST = (process.env.MYYND_SMTP_HOST ?? '').trim()
export const PORTA_SMTP = Number((process.env.MYYND_SMTP_PORTA ?? '').trim() || 587) || 587
export const UTENTE = (process.env.MYYND_SMTP_UTENTE ?? '').trim()
const PASSWORD = process.env.MYYND_SMTP_PASSWORD ?? ''
export const DA = (process.env.MYYND_SMTP_DA ?? '').trim() || UTENTE

/**
 * C'è un modo di far uscire posta da qui?
 *
 * L'host e il mittente bastano: l'autenticazione è facoltativa perché un relay
 * interno spesso non la chiede, e pretenderla vorrebbe dire rifiutare una
 * configurazione che funziona.
 */
export function configurata(): boolean {
  return !!HOST && !!DA
}

/**
 * La verifica dell'indirizzo è obbligatoria qui?
 *
 * Solo ospitati e solo con la posta configurata. In casa la persona è una e si
 * è appena seduta davanti alla macchina: chiederle di confermare il proprio
 * indirizzo sarebbe una porta chiusa a chiave dall'interno. Su un server senza
 * posta configurata sarebbe peggio — nessuno potrebbe mai entrare.
 */
export function verificaObbligatoria(): boolean {
  return configurata() && OSPITATO
}

/**
 * Da dove si arriva qui, per scriverlo dentro un collegamento.
 *
 * Ospitati è il dominio pubblico in https. In casa è l'indirizzo su cui questo
 * server ascolta davvero — e in casa la posta non è configurata, quindi questa
 * riga serve solo a non lasciare un buco nel caso in cui qualcuno la configuri
 * lo stesso per provarla.
 */
export function origine(): string {
  return DOMINIO ? `https://${DOMINIO}` : `http://127.0.0.1:${PORTA}`
}

export type Messaggio = { a: string; oggetto: string; testo: string }

/**
 * Manda, e basta. Testo semplice: quello che arriva è quello che si legge, e
 * un collegamento in chiaro non si può travestire da un altro.
 *
 * `await import` come fa il connettore della posta: chi gira in casa non deve
 * nemmeno avere nodemailer in memoria.
 */
/**
 * Chi spedisce davvero. `null` = nodemailer.
 *
 * Esiste per le prove, e per una ragione precisa: quello che va provato è
 * *quando* parte una mail e cosa c'è dentro il collegamento — non che
 * nodemailer sappia parlare SMTP. Un finto server di posta dentro le prove
 * sarebbe cento righe per verificare una libreria di qualcun altro.
 */
let spedisci: ((m: Messaggio) => Promise<void>) | null = null

/** Forzata dalle prove: `null` vuol dire «guarda davvero». */
let saluteFinta: boolean | null = null

export const perProva = {
  intercetta(f: ((m: Messaggio) => Promise<void>) | null) { spedisci = f },
  // per provare il caso che conta: la posta del server è rotta, e la risposta
  // deve restare la stessa per un indirizzo iscritto e per uno che non c'è
  salute(s: boolean | null) { saluteFinta = s; salute = null }
}

async function trasporto() {
  const { createTransport } = await import('nodemailer')
  return createTransport({
    host: HOST,
    port: PORTA_SMTP,
    // 465 è TLS dal primo byte; 587 comincia in chiaro e sale con STARTTLS
    secure: PORTA_SMTP === 465,
    ...(UTENTE ? { auth: { user: UTENTE, pass: PASSWORD } } : {}),
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000
  })
}

export async function manda(m: Messaggio): Promise<void> {
  if (!configurata()) throw new Error('La posta di questo server non è configurata.')
  if (spedisci) return spedisci(m)
  const posta = await trasporto()
  try {
    await posta.sendMail({ from: DA, to: m.a, subject: m.oggetto, text: m.testo })
  } finally {
    posta.close()
  }
}

/**
 * La posta di questo server funziona? — e la domanda è proprio quella, non
 * «è arrivata la mail a quell'indirizzo».
 *
 * Serve a «rimandamela», che deve rispondere la stessa cosa a un indirizzo
 * iscritto e a uno che non c'è: dire «non è partita» solo per il primo
 * sarebbe un modo di chiedere al server chi è iscritto qui, cioè esattamente
 * quello che quella rotta è scritta per non fare. Questa risposta parla del
 * server e non di nessuna persona, quindi si può dare a chiunque.
 *
 * Un minuto di memoria: chi preme «rimandamela» tre volte di fila non deve
 * aprire tre connessioni SMTP, e un guasto che dura meno di un minuto non è
 * un guasto che qualcuno noterà.
 */
let salute: { sana: boolean; quando: number } | null = null
export async function funziona(): Promise<boolean> {
  if (saluteFinta !== null) return saluteFinta
  if (!configurata()) return false
  if (spedisci) return true
  if (salute && Date.now() - salute.quando < 60_000) return salute.sana
  let sana = false
  try {
    const posta = await trasporto()
    try { await posta.verify(); sana = true } finally { posta.close() }
  } catch (e) {
    console.error('myynd · la posta del server non risponde:', e instanceof Error ? e.message : e)
  }
  salute = { sana, quando: Date.now() }
  return sana
}

/** Le prove non devono aspettare un minuto per rivedere lo stato della posta. */
export function scordaLaSalute() { salute = null }

/*
 * I due messaggi, in tutte e due le lingue nello stesso corpo.
 *
 * Non passano da `src/lingua.ts` e non devono: quel dizionario lo legge il
 * browser, e qui non c'è nessun browser — c'è una casella di posta e una
 * persona che non ha ancora un conto aperto, quindi nemmeno una lingua scelta.
 * Indovinarla dal nulla vorrebbe dire scrivere in italiano a metà dei
 * destinatari; scriverle tutte e due costa quattro righe e non sbaglia mai.
 */
export function mailDiVerifica(collegamento: string): Messaggio {
  return {
    a: '',
    oggetto: 'Myynd — conferma il tuo indirizzo / confirm your address',
    testo:
      'Apri questo collegamento per confermare il tuo indirizzo ed entrare:\n\n' +
      `  ${collegamento}\n\n` +
      'Vale ventiquattro ore, e una volta sola. Se non ti sei registrato tu, non fare niente: senza questo passo il conto resta chiuso.\n\n' +
      '—\n\n' +
      'Open this link to confirm your address and sign in:\n\n' +
      `  ${collegamento}\n\n` +
      'It lasts twenty-four hours and works once. If you did not sign up, do nothing: without this step the account stays closed.\n'
  }
}

export function mailDiReimpostazione(collegamento: string): Messaggio {
  return {
    a: '',
    oggetto: 'Myynd — rimetti la password / reset your password',
    testo:
      'Apri questo collegamento per scegliere una password nuova:\n\n' +
      `  ${collegamento}\n\n` +
      'Vale un\'ora, e una volta sola. Tutte le sessioni aperte si chiuderanno. Se non l\'hai chiesto tu, non fare niente: la password di adesso resta quella buona.\n\n' +
      '—\n\n' +
      'Open this link to choose a new password:\n\n' +
      `  ${collegamento}\n\n` +
      'It lasts one hour and works once. All open sessions will be closed. If you did not ask for this, do nothing: your current password stays valid.\n'
  }
}

/*
 * Una riga all'avvio, e solo a chi ospita.
 *
 * Su un server la differenza fra «configurata» e «no» è enorme e invisibile:
 * senza posta, `MYYND_DOMINI` non è più un controllo — chiunque può scrivere
 * un indirizzo di quell'azienda senza averlo — e chi dimentica la password
 * deve scrivere a qualcuno. Va detto una volta, all'accensione, dove chi ha
 * messo su il server sta già guardando. In casa non si dice niente: non manca
 * niente.
 */
if (OSPITATO) {
  if (configurata()) {
    console.log(`myynd · la posta del server esce da ${DA} via ${HOST}:${PORTA_SMTP}: gli indirizzi si verificano, e la password si può rimettere.`)
  } else {
    console.log(
      'myynd · MYYND_SMTP_HOST non c’è: nessuno verifica il proprio indirizzo (quindi MYYND_DOMINI non prova niente) ' +
      'e chi dimentica la password non se la può rimettere da solo.'
    )
  }
}
