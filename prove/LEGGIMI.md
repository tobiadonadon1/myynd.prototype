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

In `OUT` finiscono `<passo>-<tema>-<larghezza>.png` e `.txt`, e i registri:
`server.log`, `modello.jsonl` (ogni richiesta al modello: prompt, schema, risposta), `semina.log`, `scatta.log`.
Guarda sempre le foto (Read del PNG) prima di dire che una cosa va.

## I pezzi

- `finto-modello.mjs`: un fornitore compatibile OpenAI (`/v1/chat/completions`, intero e in streaming). Il copione (`prove/copioni/base.json`) sceglie la risposta con un'espressione regolare sul prompt (`"in": "system" | "utente" | "tutto"`), anche JSON e con un'attesa; senza regola che combaci risponde `predefinita`, o una risposta vuota ma valida per lo schema chiesto.
- `semina.ts`: semina il conto `sviluppo@myynd.local` con i moduli veri (config con lingua, onboarding e giro fatti, niente automazioni di serie, desktop con `scelte: true` su una cartella della casa finta, il modello finto se si passa `--modello`), poi progetti, documenti, feed, righe, domande, riferimento. Rifiuta di partire senza `MYYND_DATI` o con la casa vera.
- `scatta.cjs` + `finto-guscio.cjs`: Electron con `show: false`, `hiddenInset`, semafori disegnati, Dock nascosto, dati di Electron nella cartella della scena, cane da guardia di 120 secondi. I passi: `vai`, `clicca`, `scrivi`/`in`, `premi`, `passa`, `aspetta`, `scorri`, `scatta`, `testo`, `chiudi`, `js`. Le finestre che si aprono da sole (il punto di oggi) si chiudono all'arrivo, se non c'è `LASCIA_FINESTRE=1`.

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
- Mai spegnere un processo per porta (`lsof … | xargs kill`): solo quelli accesi da te.
- La rassegna, all'avvio, legge i titoli pubblici dei giornali (RSS): nessun dato della persona esce, ma le notizie cambiano da una prova all'altra.
