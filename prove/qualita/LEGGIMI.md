# La qualità sul modello vero, su caselle inventate

Le prove di `npm test` controllano il codice; non sanno dire se Myynd sceglie
bene. Queste sì: tre caselle inventate (un fondatore in inglese, uno studio di
architettura in italiano, la vita privata di una illustratrice), ognuna con le
mail che chiedono di lei (`DA_FARE`) e il rumore, passate al modello vero con i
moduli veri di Myynd.

```zsh
cd prove/qualita
T=$(mktemp -d)   # mai ~/.myynd
DATI=dati.mjs NOME=Alex RUOLO=Founder LINGUA=en MYYND_DATI=$T node --disable-warning=ExperimentalWarning feed.ts ../.. $PWD/feed.json
DATI=dati-it.mjs NOME=Chiara RUOLO=Titolare LINGUA=it MYYND_DATI=$(mktemp -d) node --disable-warning=ExperimentalWarning feed.ts ../.. $PWD/feed-it.json
MYYND_DATI=$(mktemp -d) node --disable-warning=ExperimentalWarning bozze.ts ../.. $PWD/bozze.json   # feed + tre bozze end to end
```

Il motore è l'account Claude di chi lancia (`claude` nel PATH, `--no-session-persistence`:
nessuna sessione resta in ~/.claude). Nessuna fonte collegata: niente legge il Mac.
Ogni lettura costa circa 2 centesimi, ogni bozza 6-17.

Il 9 ottobre 2026 la prima passata trovava 2 mail su 7; dopo le correzioni
(0.2.42) 57 su 57 in nove passate, zero falsi allarmi su 105. Una casella nuova
si scrive *prima* di correggere, e si usa per misurare, non per correggere.
