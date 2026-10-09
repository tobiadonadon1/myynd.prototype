// Le scelte del primo avvio che non sono React: chi ragiona, per chi è, quali
// fonti prima, e gli esempi nei campi. Le prove le guardano da Node.

export type Pubblico = 'persona' | 'azienda'

/** Le quattro strade per far ragionare Myynd, quando nessuna è collegata. */
export type Strada = 'chatgpt' | 'claude' | 'chiave' | 'locale'

/*
 * Chi ragiona: prima la strada che non chiede niente.
 *
 * Erano tre bottoni con il nome del fornitore — Anthropic, OpenAI, Altro
 * modello — e chi non sa cosa sia un fornitore si fermava lì. Adesso sono le
 * strade, nell'ordine in cui funzionano per chi arriva da zero: l'account
 * ChatGPT non chiede di installare niente (il ponte Codex è dentro l'app);
 * l'account Claude vuole Claude Code su questo Mac, e lo si dice prima di
 * sceglierlo; la chiave è a consumo; un modello sul Mac è gratis ma va acceso.
 * `connettore` è la scheda delle Fonti che quella strada collega.
 */
export const STRADE: { id: Strada; nome: string; nota: string; connettore: 'openai' | 'claude' | 'compatibile' }[] = [
  { id: 'chatgpt', nome: 'Accedi con ChatGPT', nota: 'Non serve installare niente. Usa il tuo piano ChatGPT.', connettore: 'openai' },
  { id: 'claude', nome: 'Accedi con Claude', nota: 'Serve Claude Code su questo Mac.', connettore: 'claude' },
  { id: 'chiave', nome: 'Chiave API', nota: 'Anthropic o OpenAI, a consumo.', connettore: 'claude' },
  { id: 'locale', nome: 'Un modello su questo Mac', nota: 'Ollama, LM Studio o llama.cpp. Niente esce dal Mac.', connettore: 'compatibile' }
]
/** La strada consigliata a chi non ha ancora niente: la prima. */
export const CONSIGLIATA: Strada = STRADE[0]!.id
/**
 * Le strade che esistono qui. Su un server gli account (ChatGPT e Claude
 * passano da programmi su questo Mac) e il modello in casa non ci sono: resta
 * la chiave. Mostrarle vorrebbe dire aprire una scheda vuota.
 */
export function stradeQui(ospitato: boolean): typeof STRADE {
  return ospitato ? STRADE.filter(s => s.id === 'chiave') : STRADE
}

/*
 * Le prime schede delle fonti, su un Mac.
 *
 * La posta è Mail del Mac: niente da incollare, nessuna password per le app,
 * solo l'accesso al disco. La casella via IMAP (Gmail, iCloud, il dominio di
 * lavoro) non sparisce: sta dietro «Tutte le fonti» e si apre anche da Mail
 * del Mac, con «Usi Gmail nel browser?». Per un'azienda vengono prima gli
 * strumenti della squadra (Slack, Notion, GitHub), per una persona l'agenda e
 * le note: lo stesso elenco, in un altro ordine. Niente si toglie.
 */
const MAC_PERSONA = ['desktop', 'postamac', 'agendamac', 'note', 'calendario', 'notion', 'slack', 'conversazioni', 'granola']
const MAC_AZIENDA = ['desktop', 'postamac', 'agendamac', 'slack', 'notion', 'github', 'calendario', 'granola', 'note']
const ALTROVE_PERSONA = ['desktop', 'posta', 'calendario', 'notion', 'slack', 'github']
const ALTROVE_AZIENDA = ['desktop', 'posta', 'slack', 'notion', 'github', 'calendario']

export function prioritaFonti(suMac: boolean, pubblico: Pubblico): string[] {
  if (suMac) return pubblico === 'azienda' ? MAC_AZIENDA : MAC_PERSONA
  return pubblico === 'azienda' ? ALTROVE_AZIENDA : ALTROVE_PERSONA
}

/**
 * Gli esempi nei campi, per chi è. Sono segnaposti: si leggono e si
 * sostituiscono, non si salvano mai. Chiavi del dizionario, tradotte dove si
 * disegnano.
 */
export function esempi(pubblico: Pubblico): { obiettivo: string; progetto: string; azione: string } {
  return pubblico === 'azienda'
    ? { obiettivo: 'Chiudere tre nuovi clienti entro dicembre', progetto: 'Nuovi clienti', azione: 'Richiamare i due contatti più caldi' }
    : { obiettivo: 'Mettere online il sito nuovo entro ottobre', progetto: 'Sito nuovo', azione: 'Scrivere i testi della pagina iniziale' }
}

/**
 * Gmail via IMAP: i passi esatti per la password per le app, in due righe.
 *
 * Il consiglio era una riga («Gmail vuole una password per le app») e i passi
 * stavano chiusi sotto «Dove trovo la password per le app?», insieme a quelli
 * di iCloud e Yahoo: chi aveva Gmail doveva aprirli, trovare la sua riga e
 * capire dove andare. Adesso, appena l'indirizzo o il server dicono Gmail, le
 * due righe sono in vista, con la pagina giusta. Si riconosce anche
 * dall'indirizzo, prima che il server sia stato trovato.
 */
export function gmailPerLeApp(host: string, email: string): { righe: [string, string]; url: string } | null {
  const h = host.toLowerCase(), dominio = email.trim().toLowerCase().split('@')[1] ?? ''
  if (!/gmail|googlemail/.test(h) && !/^(gmail|googlemail)\.com$/.test(dominio)) return null
  return {
    righe: [
      'Accendi la verifica in due passaggi, poi apri «Password per le app» e creane una chiamata Myynd.',
      'Incolla qui le sedici lettere, al posto della password di Google.'
    ],
    url: 'https://myaccount.google.com/apppasswords'
  }
}

/** Chi non l'ha ancora detto è una persona, come sul server (`config.pubblico`). */
export function pubblicoDi(v: unknown): Pubblico {
  return v === 'azienda' ? 'azienda' : 'persona'
}
