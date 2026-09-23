// Gli indirizzi dove si va a prendere quello che una scheda chiede.
//
// Stanno qui, in un posto solo e senza React, per due ragioni: si possono
// provare (un parametro scritto male in un indirizzo non dà nessun errore,
// dà una pagina che si apre vuota), e quando un sito cambia indirizzo si
// cambia una riga sola invece di cercarla in dieci schede.
//
// Ogni indirizzo ha accanto da dove viene: sono tutti verificati sulle
// pagine d'aiuto dei rispettivi siti il 23 settembre 2026.

/**
 * La pagina dei token a grana fine di GitHub, già compilata.
 *
 * Dal 26 agosto 2025 accetta i campi nell'indirizzo (github.blog/changelog,
 * «Template URLs for fine-grained PATs and updated permissions UI»;
 * docs.github.com, «Pre-filling fine-grained personal access token details
 * using URL parameters»): `name`, `description`, `expires_in` e un parametro
 * per permesso. Chi collega arriva su una pagina dove resta da scegliere una
 * cosa sola — quali repository — e da premere «Generate token».
 *
 * Tre scelte, e perché:
 *   · **366 giorni**, il massimo. È anche il tetto che le organizzazioni
 *     mettono di serie: un token più lungo lo rifiuterebbero (docs.github.com,
 *     «Setting a personal access token policy for your organization»);
 *   · **niente `target_name`**: c'è un difetto aperto (community discussion
 *     188111, febbraio 2026) per cui l'organizzazione scelta dall'indirizzo si
 *     vede ma non si salva, e il token finisce sul conto personale. Meglio che
 *     la scelga lei, nella pagina, in «Resource owner»;
 *   · **la sola lettura** su Contents, Issues e Pull requests, cioè le tre
 *     letture del giro; Metadata GitHub la aggiunge da sé, e scriverla non
 *     costa niente.
 *
 * La funzione è stata tolta e rimessa nella documentazione di GitHub a maggio
 * 2026: per questo i passi della scheda dicono anche la strada a mano.
 */
export function paginaTokenGithub(inglese: boolean): string {
  return 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
    name: 'Myynd',
    description: inglese ? 'Myynd reads your repositories, read-only' : 'Myynd legge i tuoi repository, in sola lettura',
    expires_in: '366',
    contents: 'read',
    issues: 'read',
    pull_requests: 'read',
    metadata: 'read'
  }).toString()
}

/** La strada a mano, per quando la pagina compilata non si apre compilata. */
export const TOKEN_GITHUB_A_MANO = 'https://github.com/settings/personal-access-tokens'

/**
 * Gli ambiti utente che servono a Slack per quello che legge Myynd.
 *
 * `users.conversations` con i quattro tipi di conversazione vuole un `:read`
 * per tipo, `conversations.history` un `:history` per tipo, e `users.list`
 * `users:read` per i nomi. I passi di prima ne elencavano sei su nove:
 * mancavano `groups:read`, `im:read` e `mpim:read`, e un token fatto seguendoli
 * alla lettera si fermava su «mancano dei permessi».
 */
export const AMBITI_SLACK = [
  'channels:history', 'channels:read',
  'groups:history', 'groups:read',
  'im:history', 'im:read',
  'mpim:history', 'mpim:read',
  'users:read'
]

/**
 * La creazione dell'app su Slack, già compilata con il suo manifesto.
 *
 * Slack lo documenta come il modo di condividere un'app: «you can use the
 * following URL pattern: https://api.slack.com/apps?new_app=1&manifest_json=…»
 * (docs.slack.dev, «Configuring apps with app manifests», «Sharing
 * manifests»). Il manifesto porta il nome e gli ambiti utente: chi collega
 * sceglie lo spazio di lavoro, preme «Create», poi «Install to Workspace».
 */
export function appSlack(): string {
  const manifesto = {
    display_information: { name: 'Myynd' },
    oauth_config: { scopes: { user: AMBITI_SLACK } }
  }
  return `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(manifesto))}`
}

/**
 * Le pagine dirette, dove un sito ne ha una.
 *
 *   · Google: support.google.com/accounts/answer/185833 rimanda a
 *     myaccount.google.com/apppasswords («Create and manage your app passwords»);
 *   · Apple: support.apple.com/102654, «Sign in to your Apple Account on
 *     account.apple.com», poi «Sign-In and Security» › «App-Specific Passwords»;
 *   · Yahoo: help.yahoo.com/kb/SLN15241, dalla pagina della sicurezza
 *     dell'account, «Create app password»;
 *   · Notion: notion.so/my-integrations porta alle connessioni interne
 *     (developers.notion.com, «Internal connections»);
 *   · Dropbox, Meta, e i quattro fornitori di modelli: la pagina delle chiavi
 *     o delle app, dalla loro guida rapida;
 *   · Claude: support.claude.com, «Export your Claude data», che porta questo
 *     indirizzo nel testo. Per ChatGPT un indirizzo diretto non è documentato,
 *     e non si mette.
 */
export const PAGINE = {
  passwordAppGoogle: 'https://myaccount.google.com/apppasswords',
  passwordAppApple: 'https://account.apple.com',
  passwordAppYahoo: 'https://login.yahoo.com/account/security',
  notion: 'https://www.notion.so/my-integrations',
  dropbox: 'https://www.dropbox.com/developers/apps',
  meta: 'https://developers.facebook.com/apps',
  esportaClaude: 'https://claude.ai/settings/data-privacy-controls',
  chiaviOpenAI: 'https://platform.openai.com/api-keys',
  chiaviOpenRouter: 'https://openrouter.ai/keys',
  chiaviGroq: 'https://console.groq.com/keys',
  chiaviMistral: 'https://console.mistral.ai'
} as const
