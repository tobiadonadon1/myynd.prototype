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
| `MYYND_POSTGRES` | La stringa di connessione a un Postgres — su Supabase: *Connect → Transaction pooler*, la `postgresql://…:6543/postgres`. Con questa, **i conti, le sessioni e la configurazione di ognuno** (profilo e credenziali delle fonti) stanno lì e sopravvivono a qualunque redeploy. Senza, stanno su disco. |
| `MYYND_CHIAVE` | Obbligatoria con `MYYND_POSTGRES`: una frase lunga e a caso con cui si cifrano le credenziali prima di scriverle sul database. Si cambia solo passando da `MYYND_CHIAVE_VECCHIA`, mai da sola. |
| `MYYND_CHIAVE_VECCHIA` | Per **cambiare** `MYYND_CHIAVE` senza perdere le credenziali di nessuno: si mette qui quella di prima e la nuova in `MYYND_CHIAVE`. All'avvio si legge con la nuova, quello che non si apre si prova con la vecchia, e si riscrive con la nuova. Il registro dice quante ne restano e quando ha finito: **da quel momento questa variabile si toglie**. Lasciarla non fa danni, ma tiene in giro una chiave che non serve più. |
| `MYYND_POSTGRES_CA` | Il percorso del certificato che Supabase dà da scaricare, o la parola `sistema` se il certificato del database è di un'autorità pubblica: verifica il server oltre che cifrare. Senza, si cifra e basta, e il server lo dice all'avvio. |
| `MYYND_DATI` | Dove vive l'indice — `mente.db`, i documenti, la ricerca — che resta su disco anche con Postgres, perché è una copia delle fonti e si rifà rileggendole. Su un disco effimero si rifà a ogni redeploy: **un volume qui è ancora la cosa giusta**, ma senza non si perde nessun conto. Il Dockerfile la mette a `/dati`. |
| `PORT` | La porta che il proxy di chi ospita chiama. Railway la imposta da sé. |
| `MYYND_PUBBLICO` | Il dominio pubblico, es. `myynd.tuodominio.it`. Serve alla guardia sull'Host e al ritorno OAuth. Senza, Railway usa il suo. |
| `MYYND_REGISTRAZIONE` | `aperta`, `invito` o `chiusa`. **Senza**, su un server la porta è aperta finché non entra il primo conto — chi lo ha messo su — e poi passa a `invito` se c'è `MYYND_INVITO`, altrimenti a `chiusa`. Un server pubblico aperto a chiunque per una variabile dimenticata non è un errore che si vede. |
| `MYYND_INVITO` | La parola da dare a chi si registra, con `invito`. |
| `MYYND_DOMINI` | Domini email ammessi alla registrazione, separati da virgola. Vuoto = tutti. **Vale davvero solo con l'SMTP qui sotto**: senza, chiunque può scrivere un indirizzo di quel dominio senza averlo, e questa riga filtra quello che uno digita, non chi è. |
| `MYYND_SMTP_HOST`, `MYYND_SMTP_PORTA`, `MYYND_SMTP_UTENTE`, `MYYND_SMTP_PASSWORD`, `MYYND_SMTP_DA` | La casella da cui il server manda due sole cose: la conferma dell'indirizzo di chi si registra, e il collegamento per rimettere una password dimenticata. Porta 587 se non si dice; utente e password solo se il server di posta le chiede; `MYYND_SMTP_DA` è il mittente, e senza è l'utente. **Con queste, su un server, un conto nuovo deve confermare il proprio indirizzo prima di entrare** — il primo conto no, è chi ha messo su il server e non c'è nessuno che possa farlo entrare. Senza queste, non cambia niente rispetto a prima: si entra subito, e il «ho dimenticato la password» non si offre nemmeno. |
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
Con la chiave Anthropic, i lavori che non lo sono vanno a Haiku — il più
piccolo della famiglia — anche quando il modello scelto è un altro: sono le
chiamate più frequenti, e non escono dall'azienda.

Le ore delle automazioni («ogni giorno alle 7») e il conto delle bozze del
giorno sono nel fuso di chi usa, che il browser manda una volta e resta nella
configurazione: su un server la macchina sta in UTC.

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

### Il desktop di casa che spinge verso il server

Un server non ha le tue cartelle. Quello che può fare è ricevere quello che un
Myynd in casa ha già letto: si mettono `MYYND_DESKTOP_REMOTO` (l'indirizzo del
Myynd ospitato) e `MYYND_DESKTOP_REMOTO_TOKEN` **sul Myynd di casa**.

Quel token si crea dal Myynd ospitato, in *Preferenze → Gettoni per le
macchine*: si vede una volta sola, insieme alle due righe già pronte da
incollare. Non è un token di sessione — quelli durano trenta giorni e muoiono a
ogni cambio di password, e quando muoiono la spinta fallisce in silenzio per
sempre. Questo non scade, si revoca da quella stessa schermata, e arriva **solo**
alle due rotte che ricevono i documenti: con uno di questi non si entra
nell'app, non si cambia la password e non si scarica niente.

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
  postaUscita.ts        la casella del server: conferma dell'indirizzo, password dimenticata
  gettoniEmail.ts       i gettoni che viaggiano in quelle due mail: una volta sola, e scadono
  gettoni.ts            i gettoni con un ambito, per le macchine: non scadono, si revocano
  addio.ts              cancellare un conto: sessioni, indice, cartella, configurazione, riga
  fascicolo.ts          «cosa tenete su di me», in JSON e senza credenziali
  postgres.ts           conti e configurazioni su Postgres (Supabase) con MYYND_POSTGRES; le credenziali cifrate
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
