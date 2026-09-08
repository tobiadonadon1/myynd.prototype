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
| `MYYND_REGISTRAZIONE` | `aperta`, `invito` o `chiusa`. **Senza**, aperta: chi arriva sul server si fa un conto e entra. Prima si chiudeva da sola dopo il primo conto — che è sempre quello di chi ha acceso il server — e Myynd finiva chiuso addosso a tutti gli altri senza che nessuno l'avesse deciso. Per stringere si scrive `invito` (con `MYYND_INVITO`) o `chiusa`. |
| `MYYND_INVITO` | La parola da dare a chi si registra, con `invito`. |
| `MYYND_DOMINI` | Domini email ammessi alla registrazione, separati da virgola. Vuoto = tutti. **Vale davvero solo con l'SMTP qui sotto**: senza, chiunque può scrivere un indirizzo di quel dominio senza averlo, e questa riga filtra quello che uno digita, non chi è. |
| `MYYND_SMTP_HOST`, `MYYND_SMTP_PORTA`, `MYYND_SMTP_UTENTE`, `MYYND_SMTP_PASSWORD`, `MYYND_SMTP_DA` | La casella da cui il server manda due sole cose: la conferma dell'indirizzo di chi si registra, e il collegamento per rimettere una password dimenticata. Porta 587 se non si dice; utente e password solo se il server di posta le chiede; `MYYND_SMTP_DA` è il mittente, e senza è l'utente. **Con queste, su un server, un conto nuovo deve confermare il proprio indirizzo prima di entrare** — il primo conto no, è chi ha messo su il server e non c'è nessuno che possa farlo entrare. Senza queste, non cambia niente rispetto a prima: si entra subito, e il «ho dimenticato la password» non si offre nemmeno. |
| `MYYND_GOOGLE_CLIENT_ID`, `MYYND_GOOGLE_CLIENT_SECRET` | L'app OAuth di chi ospita, per Gmail, Calendario e Drive. Tipo «Applicazione web», URI di ritorno **esattamente** `https://<dominio>/api/oauth/ritorno`. Senza, quelle schede si dichiarano non disponibili. |
| `MYYND_MICROSOFT_CLIENT_ID`, `MYYND_MICROSOFT_CLIENT_SECRET`, `MYYND_MICROSOFT_TENANT` | Idem per Outlook, Calendario e SharePoint (Entra ID, piattaforma «Web», stesso URI di ritorno; tenant predefinito `common`). |

Su un server **non** si usano: le cartelle del desktop, Claude Code, e la
chiave `ANTHROPIC_API_KEY` dell'ambiente (sarebbe di chi ospita, spesa da
tutti). Ognuno collega la propria chiave, o un fornitore compatibile con
OpenAI, dalle preferenze.

### Le due cose da mettere a mano, in parole semplici

Sono le uniche due che il codice non può fare da solo, perché vogliono un conto
che esiste fuori di qui. Nessuna delle due serve per provare Myynd sul proprio
computer: là funziona già tutto.

**Un conto solo fra il tuo Mac e il server.** Senza, sono due mondi separati:
un conto in `~/.myynd` e un altro su Railway, e ogni redeploy senza volume si
porta via il secondo. Con `MYYND_POSTGRES` e `MYYND_CHIAVE` uguali di qua e di
là sono lo stesso conto — stessa email, stessa password, stesse fonti — e non si
perde più niente. La stringa si prende da Supabase (*Connect → Transaction
pooler*) e contiene la password del database: va in `.env.local`, che git
ignora, e in nessun altro posto. La chiave si fa così, e **dev'essere la stessa
nei due posti**, o quello che è cifrato di là non si legge di qua:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**La posta che manda il server.** Serve a due cose sole, e tutte e due valgono
solo ospitati: confermare l'indirizzo di chi si registra, e rimettere una
password dimenticata. Due strade:

| Da dove | Cosa serve | Quando va bene |
| ------- | ---------- | -------------- |
| **Gmail** | Verifica in due passaggi accesa, poi una «password per le app» dal proprio account Google — non la password vera. `smtp.gmail.com`, porta 587. | Per cominciare, e per pochi conti. Gmail dopo un certo numero di messaggi al giorno si ferma. |
| **Un servizio di invio** (Resend, Brevo, Postmark) | Host, utente e password che danno loro. | Se si scrive a clienti: è quello che i loro provider si aspettano di vedere, e non si ferma. |

Finché quelle variabili non ci sono **non cambia assolutamente niente**: si
entra subito, come sempre, e il «ho dimenticato la password» non compare. Il
momento in cui ci sono, `MYYND_DOMINI` smette di essere un confronto fra
stringhe e diventa un controllo vero — prima, chiunque poteva registrarsi come
`capo@tuazienda.it` senza che niente lo smentisse.

Il giro intero è stato provato con un server di posta finto: registrazione,
mail ricevuta, collegamento aperto, conto confermato, e lo stesso collegamento
che la seconda volta non vale più.

## L'app

Myynd si scarica anche come app per Mac e Windows. Dentro c'è tutto quello
che gira su un server, ma gira sul computer di chi la apre: il server parte
insieme all'app, in un processo suo, e la finestra è l'interfaccia di sempre
caricata da `http://127.0.0.1:<porta>` — mai da `file://`, che il server
rifiuta. I dati stanno dove stanno anche senza app, in `~/.myynd` (su Windows
`%USERPROFILE%\.myynd`): chi aveva già un Myynd in casa se lo ritrova. Il
guscio tiene le sue cose — la posizione della finestra, la scorciatoia, il
registro `myynd.log` — nella cartella dell'app (`~/Library/Application
Support/Myynd` sul Mac, `%APPDATA%\Myynd` su Windows).

**Vive anche a finestra chiusa.** La X nasconde la finestra e basta: il segno
nella barra dei menù (e il Dock, sul Mac) tengono l'app viva, e con lei il
server e le automazioni che ha in programma. Si esce da «Esci» — nel menù
del segno, nel menù dell'app, o con ⌘Q. Dove il segno nella barra non è
riuscito a nascere (Windows e Linux senza vassoio), la X chiude come prima:
un'app viva che non si vede e non si riapre è peggio di una chiusa. Con
«Si apre all'accesso» acceso nelle preferenze, l'app parte insieme al
computer *senza* far comparire la finestra — si registra con `openAsHidden`
e con l'argomento `--nascosto`, e all'avvio guarda tutti e due più
`wasOpenedAtLogin`; sui Mac recenti quei due segnali di Apple non arrivano
più, e resta l'argomento — ma carica lo stesso la pagina, perché il filo
degli eventi, il punto nella barra e il numero sul Dock vivono nel renderer.
Al risveglio dal sonno il guscio manda al server `{ tipo: 'sveglia' }` su
`parentPort`, così può rimettere in pari gli orologi.

**Il richiamo.** La scorciatoia globale (⇧⌘M, si cambia nelle preferenze)
non porta più su la finestra intera: apre una barra sola, senza cornice,
sopra a tutto, sullo schermo dove sta il cursore. Ci si scrive una cosa da
fare e Invio la segna in lista — con gli stessi «/» della barra grande:
`/oggi`, `/settimana`, `/poi`, `/bozza`, `/myynd` — oppure una domanda, se
comincia con `?` o si preme ⌘Invio, e la risposta cresce lì sotto, con un
«Continua nell'app» che apre quella chat nella finestra. Incollare un elenco
segna una riga per riga (`src/oggi/righe.ts` toglie trattini, numeri e
caselle). Esc la chiude, e il fuoco torna all'app da cui si era partiti. È
la stessa pagina dell'app con `?richiamo=1` (`src/richiamo/Richiamo.tsx`):
nel browser si può aprire a mano per provarla. La finestra la fa
`desktop/richiamo.ts`, e si adatta all'altezza del contenuto che la pagina le
dice via `window.myynd.richiamo.misura`. Gli avvisi di sistema per una bozza
pronta o una domanda sono spenti finché non li si accende nelle preferenze
(«Avvisami quando una bozza è pronta»), e arrivano solo se la finestra non è
davanti.

Si impacchetta con `npm run pacchetto` (Mac e Windows), `pacchetto:mac` o
`pacchetto:win`; gli artefatti finiscono in `dist-app/`. La configurazione è
in `electron-builder.yml` per la parte fissa e in `build/configura.cjs` per
quella che dipende dall'ambiente — è per questo che i comandi passano
`--config build/configura.cjs`. Le icone in `build/`, e quelle della barra
in `desktop/icone/`, le disegna `build/icona.cjs` — la piastrella del Dock,
con la squircle di Apple, e il marchio nudo per la barra dei menu — e le
rasterizza `node build/icone.cjs` (solo su un Mac: serve `iconutil`). Lo
script si rilancia da sé dentro Electron, che è quello che disegna: serve un
rasterizzatore che rispetti la trasparenza, e `qlmanage` appiattisce su
fondo bianco.

**Due DMG per il Mac**, `Myynd-<versione>-arm64.dmg` per i chip Apple e
`Myynd-<versione>-x64.dmg` per gli Intel, mai uno universale: `pdf-parse`
porta con sé `@napi-rs/canvas`, un binario diverso per architettura, e
fonderli non riesce. Il DMG contiene l'app e il collegamento ad Applicazioni;
si trascina e basta. Ogni pacchetto porta il binario di canvas della *sua*
piattaforma e architettura, non quello del Mac che lo costruisce:
`build/binari.cjs` lo scarica da npm prima che electron-builder raccolga i
file (in `~/Library/Caches/myynd-binari`, una volta sola) e dopo controlla
che nel pacchetto ci sia quello, che sia davvero per quell'architettura, e
che non ce ne siano altri.

**Windows** ha un installatore NSIS a 64 bit, `Myynd-Setup-<versione>.exe`:
chiede dove installare, per l'utente e non per la macchina. Non è firmato:
quando ci sarà un certificato, `WIN_CSC_LINK` (il `.pfx`) e
`WIN_CSC_KEY_PASSWORD` lo accendono.

**La firma, oggi.** Su questa macchina c'è solo un certificato «Apple
Development», che vale per sviluppare e non per distribuire, e electron-builder
giustamente non lo usa. Senza un «Developer ID Application» l'app viene
firmata *ad hoc*: parte sul Mac che l'ha costruita e su quelli dove la si
apre col tasto destro, ma sugli altri Gatekeeper dice che è danneggiata — è
il suo modo di dire «non so chi l'ha fatta». Quando il certificato arriva,
basta l'ambiente: `CSC_NAME="Developer ID Application: Nome (TEAMID)"` fa
trovare l'identità nel portachiavi (o `CSC_LINK`/`CSC_KEY_PASSWORD` con un
`.p12`), e `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` fanno
partire la notarizzazione da `build/notarizza.cjs`. Senza queste tre la
notarizzazione si salta e lo si legge nel log del pacchetto, non si fallisce.
I diritti dell'hardened runtime stanno in `build/entitlements.mac.plist`:
sono i tre che Electron chiede, non uno di più.

**Gli aggiornamenti** passano da `electron-updater`. Con
`MYYND_AGGIORNAMENTI_URL=https://…/myynd/` al momento di impacchettare si
scrive il feed (`latest-mac.yml`, `latest.yml`) accanto agli artefatti, e sul
Mac si aggiunge lo zip che l'aggiornamento scarica al posto del DMG: si carica
tutto a quell'indirizzo e l'app installata lo chiede da sola. Senza la
variabile l'app parte senza feed e dice «aggiornamenti spenti». Su macOS
funzionano solo su un'app firmata con un Developer ID: finché la firma è ad
hoc il guscio lo dice, invece di provarci e sbagliare.

**La prova del pacchetto**: `npm run prova:app` apre l'app costruita
(`dist-app/mac-arm64/Myynd.app`, o il binario passato come argomento) con una
cartella dati vuota e temporanea — è l'unico posto in cui `MYYND_DATI` viene
impostata, per non toccare il `~/.myynd` di chi prova — e verifica dal di
fuori, attraverso DevTools, che la schermata d'avvio lasci il posto all'app,
che ci si registri in inglese, che una cartella con tre file si legga fino
in fondo (PDF compreso, nel suo lavoratore), che `/api/stato` dica `app:
true`, che `window.myynd` ci sia con tutte le sue chiavi, che il registro
esista, e che chiudendo l'app non resti nessun server in ascolto.

## Il modello

Tre strade, in quest'ordine di preferenza e di costo:

1. **Un modello di casa** (Ollama) per i lavori piccoli — titoli, traduzioni,
   memoria, rassegna — se c'è, e solo sul tuo computer.
2. **L'abbonamento Claude** di chi usa, attraverso Claude Code, solo sul tuo
   computer. Si sceglie in Preferenze, «Con quale dei due paghi Claude», e si
   cambia idea quando si vuole: scelto lui, ci passa **tutto** il lavoro — chat,
   feed, bozze — e non arriva nessuna bolletta. Le bozze fanno una passata sola
   sul materiale già trovato invece di poter cercare ancora, perché Claude Code
   da riga di comando non sa fare il giro degli attrezzi: un po' meno accurate,
   e gratis. La scheda lo dice a chi sceglie.
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

## Il feed

La prima pagina è corta di proposito. Una lettura tira fuori **al massimo
cinque** voci, e una voce è una cosa che ha bisogno di te — una decisione, una
risposta, una scadenza, un pagamento — o che muove quello su cui stai
lavorando. Non ci arrivano: le promozioni, le newsletter, le ricevute, le
notifiche e in genere la posta in serie (`documenti.massa`, che il connettore
decide dalle intestazioni: `List-Unsubscribe`, `Precedence: bulk`, un mittente
`noreply`, un link per disiscriversi); le email che hai scritto tu; e le email
che hai **già letto** da più di un giorno — se chiedevano qualcosa, l'hai fatta
o l'hai messa in lista. «Letto» è la bandiera della casella
(`documenti.letto`): ogni lettura della posta la rilegge sugli ultimi duecento
messaggi di ogni cartella, così vale anche per quello che apri nel tuo
programma di posta. Il feed non supera le **otto** voci aperte — oltre, le più
vecchie scadono — e una voce che sta lì da **quattro giorni** scade da sé:
scaduta non è fatta e non è scartata, solo lasciata passare, e non torna.

**«Non mi interessa» insegna.** Scartare una voce ricorda da chi arrivava
l'email sotto: per tre mesi la posta di quell'indirizzo non entra più nel
feed, e se l'indirizzo era una macchina (`no-reply@banca.it`) non entra più
nessuno di quel dominio. Al modello si dice anche, in una riga, chi hai
scartato, perché capisca il genere di cosa non vuoi. Non c'è nessuna
tabella nuova: è una giunzione fra le voci scartate e i documenti.

## Le automazioni

Una ricetta in `automazioni/_comuni` scrive di norma **una riga** con l'elenco
di quello che ha guardato. Con `metti.perDocumento: true` scrive invece **una
riga per ogni documento** che merita attenzione: un modello piccolo (il lavoro
`smistamento`, mai di frontiera) legge i candidati con l'istruzione `fai`
davanti e sceglie quali meritano una riga e con che titolo — «Rispondere a
Rossi sul preventivo di marzo» — e ogni riga nasce col suo documento attaccato,
così la bozza parte da *quel* messaggio ed è una risposta a chi l'ha scritto.
Un documento che ha già una riga da quella ricetta — viva, chiusa o buttata —
non ne riceve una seconda; il tetto delle bozze del giorno vale riga per riga,
e oltre il tetto le righe nascono lo stesso, senza bozza. È la ricetta di serie
«Risposte da dare» (`risposte-da-dare.json`): a ogni lettura della posta, una
riga per ogni messaggio in arrivo che aspetta una tua risposta, con la risposta
già scritta. Un'email che sta già in lista non viene riproposta nel feed.

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
| **Conversazioni** | I `conversations.json` esportati da ChatGPT (Impostazioni › Controlli dati › Esporta dati) e da Claude (Impostazioni › Privacy › Esporta dati), e — se lo accendi — le sessioni di Claude Code in `~/.claude/projects`. Di ogni chat si tiene il testo, non gli attrezzi. Solo sul tuo computer. |

Le cartelle del desktop si guardano anche dal vivo — *la vedetta*
(`server/connettori/vedetta.ts`). Un file salvato, spostato o cancellato entra
o esce dall'indice nel giro di qualche secondo, con le stesse regole della
lettura intera: niente file nascosti, niente progetti di codice, gli stessi
limiti di peso. Quello che viene dopo — la prima pagina, una domanda, le
automazioni «quando arriva» — aspetta invece che le cartelle si calmino per
qualche minuto e non parte più di una volta ogni dieci: duecento file
trascinati dentro sono una chiamata al modello, non duecento. Il giro delle
sei ore resta, ma non rilegge più quello che ha la stessa data di modifica di
prima; e quando il computer si sveglia, l'app lo dice al server e si recupera
subito quello che è successo nel frattempo. Solo in casa: su un server le
cartelle sono nomi, non percorsi.

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
| `npm run pacchetto` | L'app per Mac (due DMG) e Windows (installatore), in `dist-app/`; `pacchetto:mac`, `pacchetto:win` per uno solo |
| `npm run prova:app` | Apre l'app impacchettata e la prova da fuori, con una cartella dati temporanea |

Due regole del codice che non si vedono dal typecheck: node esegue il
TypeScript togliendo i tipi e basta, quindi niente `enum`, parameter
properties, namespace o decoratori; e ogni frase che il server può mostrare a
una persona deve avere la sua riga inglese in `src/lingua.ts` — una prova lo
controlla.
