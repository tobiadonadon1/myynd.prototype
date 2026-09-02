# Myynd

Il secondo cervello dell'azienda. Legge le fonti che le colleghi — posta, file,
note, chat — e da lì risponde alle tue domande citando da dove viene la
risposta, prepara bozze, e tiene una lista di cose da fare che sa svolgere.

Gira in due modi. **Sul tuo computer**: l'indice e le credenziali stanno in
`~/.myynd`, e l'unica cosa che esce sono le domande al modello con i pezzi di
documento che servono. **Su un server** (Docker, Railway): ogni persona ha la
sua cartella e il suo indice sotto `MYYND_DATI/utenti/<id>`, e nessuno vede
quello di un altro.

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
```

Partono due cose: il server su `127.0.0.1:5174` e l'interfaccia su `5173`. Al
primo avvio si crea l'accesso e si apre l'onboarding.

## Su un server

Un'immagine sola (`Dockerfile`): costruisce l'interfaccia e la serve dallo
stesso processo che tiene l'API. Il server si accorge da solo di essere
ospitato (`RAILWAY_ENVIRONMENT`, `RENDER`, `FLY_APP_NAME`, `K_SERVICE`, `DYNO`,
`KUBERNETES_SERVICE_HOST`) e si mette in ascolto su `0.0.0.0`.

| Variabile | Serve a |
| --------- | ------- |
| `MYYND_DATI` | Dove vive tutto. **Va montato un volume**, o ogni ridistribuzione riparte vuota. Il Dockerfile la mette a `/dati`. |
| `PORT` | La porta che il proxy di chi ospita chiama. Railway la imposta da sé. |
| `MYYND_PUBBLICO` | Il dominio pubblico, es. `myynd.tuodominio.it`. Serve alla guardia sull'Host e al ritorno OAuth. Senza, Railway usa il suo. |
| `MYYND_REGISTRAZIONE` | `aperta` (predefinito), `invito` o `chiusa`. |
| `MYYND_INVITO` | La parola da dare a chi si registra, con `invito`. |
| `MYYND_DOMINI` | Domini email ammessi alla registrazione, separati da virgola. Vuoto = tutti. |
| `MYYND_GOOGLE_CLIENT_ID`, `MYYND_GOOGLE_CLIENT_SECRET` | L'app OAuth di chi ospita, per Gmail, Calendario e Drive. Tipo «Applicazione web», URI di ritorno **esattamente** `https://<dominio>/api/oauth/ritorno`. Senza, quelle schede si dichiarano non disponibili. |
| `MYYND_MICROSOFT_CLIENT_ID`, `MYYND_MICROSOFT_CLIENT_SECRET`, `MYYND_MICROSOFT_TENANT` | Idem per Outlook, Calendario e SharePoint (Entra ID, piattaforma «Web», stesso URI di ritorno; tenant predefinito `common`). |

Su un server **non** si usano: le cartelle del desktop, Claude Code, e la
chiave `ANTHROPIC_API_KEY` dell'ambiente (sarebbe di chi ospita, spesa da
tutti). Ognuno collega la propria chiave, o un fornitore compatibile con
OpenAI, dalle preferenze.

## Il modello

Tre strade, in quest'ordine di preferenza e di costo:

1. **Un modello di casa** (Ollama) per i lavori piccoli — titoli, traduzioni,
   memoria, rassegna — se c'è, e solo sul tuo computer.
2. **L'abbonamento Claude** di chi usa, attraverso Claude Code, solo sul tuo
   computer e solo per la chat.
3. **Una chiave API**: Anthropic, oppure un fornitore compatibile con OpenAI
   (OpenAI, OpenRouter, Groq, Mistral, o Ollama e LM Studio in casa) per tutto
   il lavoro grosso. Si sceglie nelle preferenze, che mostrano anche quanto si
   è speso oggi e permettono un tetto giornaliero di token.

La tabella `LAVORI` in `server/modello.ts` decide quale lavoro è di frontiera.

## Connettori

| Connettore | Cosa serve |
| ---------- | ---------- |
| **Posta** (IMAP) | Indirizzo e password della casella: il server lo trova da solo. Gmail, iCloud e Yahoo vogliono una «password per le app»; Outlook.com non accetta più password via IMAP e passa dal connettore Microsoft. Legge anche la posta inviata. |
| **Calendario** | Un indirizzo da incollare: l'indirizzo segreto in formato iCal della propria agenda. Nessuna app da registrare, nessun consenso da dare. |
| **Gmail e Calendario**, **Google Drive** | Non offerti. Vedi qui sotto. |
| **Outlook e Calendario**, **SharePoint e OneDrive** | Non offerti. Vedi qui sotto. |
| **Notion** | Token di integrazione interna, e le pagine condivise con l'integrazione. |
| **Slack** | Un token utente `xoxp-…` con gli ambiti di lettura. |
| **Dropbox** | La chiave dell'app e un codice da incollare una volta. |
| **WhatsApp Business** | Cloud API: serve un indirizzo pubblico per il webhook. |
| **Desktop** | Le cartelle che scegli, in sola lettura. Solo sul tuo computer. |

### Perché Google e Microsoft non si offrono, e cosa si fa invece

Il codice c'è ed è provato: `connettori/google.ts`, `connettori/microsoft.ts`,
`connettori/drive.ts`, e il ballo del consenso in `connettori/oauth.ts`. Quello
che manca non è il codice — è il permesso.

**Google.** Leggere la posta con l'API di Gmail vuol dire uno *scope
ristretto*. Google lo concede solo dopo una verifica dell'app e un controllo di
sicurezza fatto da terzi (CASA), a pagamento e da rinnovare ogni anno.
Senza, si resta in modalità Testing: cento utenti al massimo, una schermata di
consenso che dice «app non verificata», e — la cosa che lo rende inutilizzabile
— token che scadono ogni sette giorni. Quindi **la posta di Gmail si collega da
«Posta», con IMAP e una password per le app**: Google non chiede nessuna
verifica per quella strada, ed è la stessa casella.

**Il calendario di Google** non passa da nessuna verifica: ogni agenda ha un
*indirizzo segreto in formato iCal*, e leggerlo è leggere un indirizzo. È il
connettore **Calendario**, e vale per Google, Outlook, iCloud e Fastmail
insieme, perché quel formato lo esporta chiunque.

**Microsoft** è tutt'altra storia, e molto più semplice: basta registrare
un'app su Entra ID, dichiararla multi-tenant, e ogni persona dà il consenso per
sé. Nessun controllo di sicurezza, nessun costo, nessuna attesa. La verifica
dell'editore è facoltativa e serve solo a togliere la scritta «non verificata».
**Resta un'opzione aperta, rimandata per scelta**: chi usa Outlook è la
minoranza dei clienti, e finché è così la posta la fa IMAP e l'agenda la fa
l'indirizzo iCal. Il giorno che serve, il lavoro è la registrazione dell'app e
tre variabili d'ambiente — `MYYND_MICROSOFT_CLIENT_ID`,
`MYYND_MICROSOFT_CLIENT_SECRET`, `MYYND_MICROSOFT_TENANT` — non una riga di codice nuova.

## Com'è fatto

```
server/                 Node 24+, TypeScript eseguito direttamente (solo type stripping)
  index.ts              le API
  ospitato.ts           cosa cambia su un server, e le variabili di chi ospita
  auth.ts · conti.ts    accesso, sessioni, più persone sulla stessa installazione
  chi.ts                di chi è questa richiesta (AsyncLocalStorage)
  config.ts             config.json per persona, 0600
  store.ts              mente.db per persona — SQLite + FTS5 da node:sqlite, migrazioni
  modello.ts            chi ragiona: locale → abbonamento → chiave; il tetto e il registro dell'uso
  compatibile.ts        il fornitore compatibile con OpenAI, tradotto in forma Anthropic
  claude.ts             il ragionamento: recupero, prompt, strumenti, bozze
  compiti.ts            la coda delle cose affidate a Myynd
  automazioni.ts        le ricette che girano da sole
  connettori/           posta · calendario · google · microsoft · drive · dropbox · slack · whatsapp · notion · desktop
                        oauth.ts: il ballo su 127.0.0.1 in casa, via web ospitati

src/
  Accesso.tsx           entrare e registrarsi
  onboarding/           il primo avvio
  screens/              una schermata per file (Myynd, Oggi, Chat, Automazioni, Memoria, Mappa, Preferenze, Aiuto)
  lingua.ts             il dizionario: chiavi in italiano, valori in inglese
  vals.ts               lo stato dell'app
```

## Comandi

| Comando | Cosa fa |
| ------- | ------- |
| `npm run dev` | Server + interfaccia |
| `npm run typecheck` | Controlla i tipi di entrambi |
| `npm test` | Le prove (`server/*.test.ts`, `src/*.test.ts`); quelle che chiamano un modello vero solo con `MYYND_VIVO=1` |
| `npm run build` | Typecheck + bundle |
| `npm run password` | Cambia la password di un conto dalla riga di comando |

Due regole del codice che non si vedono dal typecheck: node esegue il
TypeScript togliendo i tipi e basta, quindi niente `enum`, parameter
properties, namespace o decoratori; e ogni frase che il server può mostrare a
una persona deve avere la sua riga inglese in `src/lingua.ts` — una prova lo
controlla.
