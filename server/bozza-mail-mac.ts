// Una bozza in Mail del Mac, mai un messaggio mandato.
//
// La posta di Mail del Mac si legge dai file `.emlx` (`connettori/posta-mac.ts`)
// e fino a qui una risposta pronta restava solo nella riga: «una mail di Mail
// del Mac non ha una casella dove mettere la bozza». Ce l'ha: le Bozze di
// Mail. Qui si chiede a Mail un messaggio nuovo, invisibile, e lo si salva;
// Mail lo mette nelle bozze del conto che sceglie lui, o di quello a cui era
// arrivata la mail se fra i destinatari c'è un suo indirizzo. Niente `send`,
// niente `activate`, nessuna finestra: Mail non viene davanti.
//
// Lo script è fisso e legge gli argomenti: niente del modello finisce dentro
// il testo dello script. Nelle scene e nelle prove non parte (`senza-open.ts`),
// e le prove sostituiscono le mani con `perProva`.
//
// Il filo non si tiene: AppleScript non sa dire «In-Reply-To», e la bozza
// parte con «Re: » e il destinatario giusto, ma fuori dalla conversazione.

import { execFile } from 'node:child_process'
import { osascriptInProva } from './senza-open.ts'
import { OSPITATO } from './ospitato.ts'
import * as cfg from './config.ts'

export const SCRIPT_BOZZA = `on run argv
  set destinatario to item 1 of argv
  set oggetto to item 2 of argv
  set corpo to item 3 of argv
  set suoi to {}
  if (count of argv) > 3 then set suoi to items 4 thru -1 of argv
  tell application "Mail"
    set mittente to ""
    repeat with conto in every account
      repeat with indirizzo in (email addresses of conto)
        if suoi contains (indirizzo as text) then set mittente to (indirizzo as text)
      end repeat
    end repeat
    set nuova to make new outgoing message with properties {subject:oggetto, content:corpo, visible:false}
    tell nuova to make new to recipient at end of to recipients with properties {address:destinatario}
    if mittente is not "" then set sender of nuova to mittente
    save nuova
    return "salvata" & linefeed & mittente
  end tell
end run`

/** Un no detto prima di parlare con Mail: la prenotazione della casella si toglie (`mailbox-drafts.ts`). */
function sicuro(messaggio: string): Error {
  return Object.assign(new Error(messaggio), { primaDelSalvataggio: true })
}

type Esecutore = (argomenti: string[]) => Promise<string>
type Ferri = { osascript: Esecutore; piattaforma: () => string; ospitato: () => boolean }
const VERI: Ferri = {
  osascript: argomenti => new Promise((ok, no) => {
    // nelle scene e sotto `node --test`: si scrive cosa sarebbe partito, e Mail resta com'è
    if (osascriptInProva('bozza-mail-mac', 'una bozza nuova nelle Bozze di Mail')) return ok('salvata\n')
    execFile('/usr/bin/osascript', argomenti, { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 }, (errore, stdout, stderr) => {
      if (!errore) return ok(stdout)
      // -1743: macOS ha fermato l'evento prima che arrivasse a Mail, quindi nessuna bozza
      if (/(-1743|not authorized|not permitted)/i.test(stderr)) return no(sicuro('Permetti a Myynd di controllare Mail in Impostazioni di Sistema, Privacy e sicurezza, Automazione.'))
      // la diagnostica di AppleScript può contenere il testo della mail: non si rilancia
      no(new Error('Mail non ha salvato la bozza. Controlla che sia aperta e che non ci sia una finestra di permesso.'))
    })
  }),
  piattaforma: () => process.platform,
  ospitato: () => OSPITATO
}
let ferri: Ferri = VERI
/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

/** Mail del Mac è collegata, e questo è Myynd sul Mac: le sue bozze si possono salvare in Mail. */
export function disponibile(c: { postamac?: unknown } = cfg.leggi()): boolean {
  return !!c.postamac && ferri.piattaforma() === 'darwin' && !ferri.ospitato()
}

/** Un indirizzo solo, senza nome e senza a capo: quello che Mail riceve come destinatario. */
const INDIRIZZO = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i

/**
 * Salva la bozza nelle Bozze di Mail. `suoi`: gli indirizzi a cui era arrivata
 * la mail, fra cui Mail cerca il suo conto per il mittente.
 */
export async function salva(e: { a: string; oggetto: string; corpo: string }, suoi: string[] = []): Promise<{ id: string; url: string }> {
  if (ferri.ospitato() || ferri.piattaforma() !== 'darwin') throw sicuro('Le bozze di Mail si salvano solo da Myynd sul Mac.')
  const a = String(e.a ?? '').trim()
  if (!INDIRIZZO.test(a)) throw sicuro('La bozza non ha un destinatario valido: controllalo prima di salvarla.')
  const oggetto = String(e.oggetto ?? '').replace(/[\r\n]+/g, ' ').trim()
  const corpo = String(e.corpo ?? '').replace(/\r\n?/g, '\n')
  if (!corpo.trim() || corpo.length > 100_000 || corpo.includes('\0') || oggetto.includes('\0') || oggetto.length > 500) throw sicuro('Il testo della bozza non si può salvare in Mail.')
  const conti = [...new Set(suoi.map(s => s.trim().toLowerCase()).filter(s => INDIRIZZO.test(s)))].slice(0, 20)
  const uscita = await ferri.osascript(['-e', SCRIPT_BOZZA, '--', a, oggetto, corpo, ...conti])
  const [esito, mittente = ''] = uscita.replace(/\r/g, '').split('\n').map(r => r.trim())
  if (esito !== 'salvata') throw new Error('Mail non ha confermato la bozza.')
  // Mail non dice l'identità della bozza: si ricorda da quale conto è partita, e nessun link
  return { id: `mail-del-mac:${mittente || 'predefinito'}`, url: '' }
}
