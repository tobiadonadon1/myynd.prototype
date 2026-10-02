# Prove dal vivo, su dati finti

Una scena intera in un comando: modello finto, conto seminato, server, fotografie
dell'app nella cornice vera. Niente tocca `~/.myynd`, niente legge `.env.local`,
nessuna finestra compare sullo schermo.

## Il comando

```zsh
OUT=<cartella per le foto> SCENA=pieno PORTA=18700 prove/scena.sh
```

- `SCENA`: `pieno`, `vuoto`, o il percorso di una scena `.json` (vedi `prove/semina.ts` per la forma).
- `PORTA`: quella del server; il modello finto prende `PORTA+1`. Ogni lavoro ha le sue dieci porte (P1A 18710, P2 18730…): se una è occupata lo script si ferma e non spegne niente.
- `PASSI=prove/passi/giro.json`: prima pagina, passaggio del mouse, Memoria, Preferenze. Senza, solo la prima pagina.
- `TEMI="chiaro scuro"` e `LARGHEZZE="1280 1100"` sono già così di serie.
- `FOTO=0` salta le fotografie; `COSTRUISCI=si|no` forza o salta `vite build` (di serie solo se `dist/` è più vecchia dei sorgenti).
- `TIENI=1` lascia acceso server e modello, e stampa porta, gettone e il comando per spegnerli.
- `COPIONE=<file.json>` cambia le risposte del modello finto (vedi sotto).
- Una scena i cui passi cambiano lo stato delle righe (P3: «Cambia» su una riga consegnata) si semina da capo per ogni tema e larghezza: `OUT=<cartella> PORTA=18740 prove/lavoro-p3.sh`, che chiama `scena.sh` quattro volte e tiene i registri di ogni passata con il tema e la larghezza nel nome.

In `OUT` finiscono `<passo>-<tema>-<larghezza>.png` e `.txt`, e i registri:
`server.log`, `modello.jsonl` (ogni richiesta al modello: prompt, schema, risposta), `semina.log`, `scatta.log`.
Guarda sempre le foto (Read del PNG) prima di dire che una cosa va.

Una scena in italiano: `"lingua": "it"` nella scena cambia la lingua del server (quello che scrive il modello), non quella della finestra, che la legge una volta all'avvio da `localStorage['myynd.lingua.2']` (`src/main.tsx`). Per le foto in italiano serve anche quella: un passo `{ "js": "localStorage.setItem('myynd.lingua.2','it'); location.reload(); 1" }` e un'attesa.

## I pezzi

- `finto-modello.mjs`: un fornitore compatibile OpenAI (`/v1/chat/completions`, intero e in streaming). Il copione (`prove/copioni/base.json`) sceglie la risposta con un'espressione regolare sul prompt (`"in": "system" | "utente" | "tutto"`), anche JSON e con un'attesa; senza regola che combaci risponde `predefinita`, o una risposta vuota ma valida per lo schema chiesto.
- `semina.ts`: semina il conto `sviluppo@myynd.local` con i moduli veri (config con lingua, onboarding e giro fatti, niente automazioni di serie, desktop con `scelte: true` su una cartella della casa finta, il modello finto se si passa `--modello`), poi progetti, documenti, feed, righe, domande, riferimento. Rifiuta di partire senza `MYYND_DATI` o con la casa vera.
- `scatta.cjs` + `finto-guscio.cjs`: Electron con `show: false`, `hiddenInset`, semafori disegnati, Dock nascosto, dati di Electron nella cartella della scena, cane da guardia di 120 secondi. I passi: `vai`, `clicca`, `scrivi`/`in`, `premi`, `passa`, `aspetta`, `scorri`, `scatta`, `testo`, `chiudi`, `js`. Le finestre che si aprono da sole (il punto di oggi) si chiudono all'arrivo, se non c'è `LASCIA_FINESTRE=1`.
- `compagno-foto.cjs`: il mostriciattolo in 3D senza server (`OUT=<cartella> node_modules/.bin/electron prove/compagno-foto.cjs`): pose fotografate su fondo chiaro e scuro, i gesti, e il costo in CPU a riposo, smorto e col cursore (`MISURA` secondi).
- `casella-foto.cjs`: la casella sotto il mostriciattolo (di serie e tirata più grande) con una risposta vera del modello finto, e le sue impostazioni. Prima `TIENI=1 FOTO=0 SCENA=vuoto PORTA=18780 COPIONE=prove/copioni/casella.json prove/scena.sh`, poi `URL=http://127.0.0.1:18780/ OUT=<cartella> node_modules/.bin/electron prove/casella-foto.cjs`, poi si spegne quello che `scena.sh` ha acceso.

## A mano, un pezzo alla volta

```zsh
T=$(mktemp -d); mkdir -p $T/dati $T/casa
FINTO_PORTA=18701 FINTO_REGISTRO=$T/modello.jsonl node prove/finto-modello.mjs &
env -i PATH="$PATH" HOME=$T/casa MYYND_DATI=$T/dati \
  node --disable-warning=ExperimentalWarning prove/semina.ts prove/scene/pieno.json --modello http://127.0.0.1:18701/v1/
env -i PATH="$PATH" HOME=$T/casa MYYND_DATI=$T/dati MYYND_DEV=1 MYYND_PORT=18700 \
  node --disable-warning=ExperimentalWarning server/index.ts
# gettone: sviluppo-non-in-produzione
```

## Le regole che questo non deve mai rompere

- Mai `npm run dev`, `dev:server` o `start` per una prova: caricano `.env.local`, che spinge i documenti su un server ospitato.
- Mai `osascript`, `open`, finestre visibili o tasti simulati fuori dalla finestra nascosta.
- I bottoni «Portami lì» e «Apri» (posta, file, pagine, un file consegnato, un documento di Pages o TextEdit, la copia di un progetto) fanno partire `/usr/bin/open` sul Mac: sono innocui solo col server acceso con `MYYND_PROVA_NIENTE_OPEN=1` (`scena.sh` lo mette da sé; a mano va aggiunto), che scrive nel registro cosa avrebbe aperto. Ogni posto che lancerebbe `open` passa da `server/senza-open.ts`: un nuovo bottone che apre qualcosa deve passare di lì.
- Mai spegnere un processo per porta (`lsof … | xargs kill`): solo quelli accesi da te.
- La rassegna, all'avvio, legge i titoli pubblici dei giornali (RSS): nessun dato della persona esce, ma le notizie cambiano da una prova all'altra.
