# Myynd

Il secondo cervello dell'azienda. Legge le fonti che le colleghi — posta, file,
note — e da lì risponde alle tue domande citando da dove viene la risposta.

Gira tutto in locale: l'indice e le credenziali stanno in `~/.myynd` su questa
macchina. L'unica cosa che esce sono le domande che fai a Claude, insieme ai
pezzi di documento che servono a rispondere.

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
```

Partono due cose: il server locale su `127.0.0.1:5174` (legge posta, file e
note) e l'interfaccia su `5173`. Al primo avvio si apre l'onboarding.

## Connettori

| Connettore | Stato | Cosa serve |
| ---------- | ----- | ---------- |
| **Posta** | funziona | Host IMAP, indirizzo, password della casella |
| **Desktop** | funziona | Le cartelle che scegli — solo lettura, solo file di testo |
| **Notion** | funziona | Token di integrazione interna + pagine condivise con l'integrazione |
| **Claude** | funziona | Una chiave API da console.anthropic.com |
| WhatsApp, Teams, Slack, Calendario, Drive, SharePoint, Dropbox, Fatture in Cloud | da fare | App registrata o OAuth |

### Posta su Register.it

Il dominio `donadon.com` è su Register.it, che dà IMAP e SMTP normali: niente
OAuth, basta la password della casella.

```
IMAP   imap.register.it : 993   (SSL)
SMTP   smtp.register.it : 465   (SSL)
utente il tuo indirizzo completo
```

Gmail, Outlook e Aruba sono precompilati nel server (`server/connettori/posta.ts`);
per Gmail serve una password per le app, non quella dell'account.

### Notion

Crea un'integrazione interna su notion.so/my-integrations, copia il token, poi
**condividi con l'integrazione le pagine che vuoi far leggere** — senza quel
passaggio l'API non le vede, anche col token giusto.

## Com'è fatto

```
server/                 Node, solo su 127.0.0.1
  index.ts              le API
  config.ts             ~/.myynd/config.json, 0600 — i segreti non escono mai di qui
  store.ts              ~/.myynd/mente.db — SQLite + FTS5, dal modulo node:sqlite
  claude.ts             il ragionamento: recupera dall'indice, poi chiede a Claude
  connettori/           posta (IMAP) · desktop (file) · notion (API) · registro

src/
  onboarding/           il primo avvio: campo.ts è il campo di particelle
  screens/              una schermata per file
  vals.ts               tutto lo stato dell'app, alimentato dalle API
  brain.ts              la palla della Mappa, costruita sui gruppi veri
  useMappa.ts           il disegno del grafo su canvas
```

Niente dati finti: se non hai collegato niente, le schermate lo dicono invece
di mostrare un'azienda inventata.

## Comandi

| Comando | Cosa fa |
| ------- | ------- |
| `npm run dev` | Server + interfaccia |
| `npm run typecheck` | Controlla i tipi di entrambi |
| `npm run build` | Typecheck + bundle |

## Stato

Funzionano: onboarding, i quattro connettori, indicizzazione, ricerca
full-text, mappa, chat con citazione delle fonti, feed generato da Claude.

Non ci sono ancora: le automazioni (la schermata lo dice), l'invio di email
(SMTP è configurato ma non collegato a un'azione), e i connettori che
richiedono OAuth.
