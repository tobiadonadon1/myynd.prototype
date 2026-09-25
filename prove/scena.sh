#!/bin/zsh
# Una scena intera, su dati finti: modello finto, semina, server, fotografie.
#
#   OUT=<cartella> SCENA=pieno PORTA=18700 prove/scena.sh
#
# Variabili (tutte facoltative tranne dove si dice):
#   SCENA       pieno | vuoto | percorso di una scena .json         (pieno)
#   PORTA       la porta del server; il modello finto usa PORTA+1   (18700)
#   OUT         dove finiscono fotografie, testi e registri         (una cartella temporanea, detta alla fine)
#   COPIONE     il copione del modello finto                        (prove/copioni/base.json)
#   TEMI        "chiaro scuro"
#   LARGHEZZE   "1280 1100"
#   PASSI       un file JSON di passi per prove/scatta.cjs          (la prima pagina)
#   FOTO=0      niente fotografie
#   COSTRUISCI  auto | si | no: la UI con `vite build`              (auto: solo se dist/ è più vecchia dei sorgenti)
#   TIENI=1     lascia server e modello accesi, e dice come spegnerli
#
# Non legge mai .env.local: il server parte con `env -i` e solo le variabili
# scritte qui, con una casa finta (HOME) e dati finti (MYYND_DATI). Se una
# delle due porte è occupata si ferma subito: non spegne niente che non abbia
# acceso lui.
set -e
set -o pipefail

RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
SCENA=${SCENA:-pieno}
if [[ -f "$SCENA" ]]; then FILE_SCENA=$SCENA; NOME=$(basename "$SCENA" .json); else FILE_SCENA=$RADICE/prove/scene/$SCENA.json; NOME=$SCENA; fi
[[ -f "$FILE_SCENA" ]] || { echo "scena · non trovo la scena $FILE_SCENA" >&2; exit 1 }
PORTA=${PORTA:-18700}
PORTA_MODELLO=$((PORTA + 1))
COPIONE=${COPIONE:-$RADICE/prove/copioni/base.json}
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1280 1100}
TOKEN=sviluppo-non-in-produzione

for p in $PORTA $PORTA_MODELLO; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then
    echo "scena · la porta $p è occupata: scegli un'altra PORTA (non spengo niente che non ho acceso io)" >&2
    exit 1
  fi
done

T=$(mktemp -d "${TMPDIR:-/tmp}/myynd-scena-XXXXXX")
DATI=$T/dati; CASA=$T/casa
mkdir -p "$DATI" "$CASA"
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-$NOME-XXXXXX")}
mkdir -p "$OUT"
AMBIENTE=(PATH="$PATH" HOME="$CASA")
[[ -n "$TMPDIR" ]] && AMBIENTE+=(TMPDIR="$TMPDIR")

SRV=; MOD=
spegni() {
  for pid in $SRV $MOD; do kill -TERM $pid 2>/dev/null || true; done
  for pid in $SRV $MOD; do wait $pid 2>/dev/null || true; done
  rm -rf "$T"
}
if [[ "${TIENI:-0}" != "1" ]]; then trap spegni EXIT INT TERM; fi

aspetta_riga() {  # file, espressione, secondi
  local i=0
  until grep -q "$2" "$1" 2>/dev/null; do
    i=$((i + 1)); (( i > $3 * 4 )) && { echo "scena · «$2» non è arrivato in $3 s:" >&2; tail -20 "$1" >&2; return 1 }
    sleep 0.25
  done
}

# 1. il modello finto
env -i $AMBIENTE FINTO_PORTA=$PORTA_MODELLO FINTO_COPIONE="$COPIONE" FINTO_REGISTRO="$OUT/modello.jsonl" \
  node prove/finto-modello.mjs > "$OUT/modello.log" 2>&1 &
MOD=$!
aspetta_riga "$OUT/modello.log" 'finto su' 10

# 2. la semina, con i moduli veri
env -i $AMBIENTE MYYND_DATI="$DATI" node --disable-warning=ExperimentalWarning prove/semina.ts "$FILE_SCENA" \
  --modello "http://127.0.0.1:$PORTA_MODELLO/v1/" > "$OUT/semina.log" 2>&1 || { cat "$OUT/semina.log" >&2; exit 1 }

# 3. la UI, se serve: prima del server, che serve dist/ solo se c'è quando parte
COSTRUISCI=${COSTRUISCI:-auto}
if [[ "$COSTRUISCI" == si || ( "$COSTRUISCI" == auto && ( ! -f dist/index.html || -n "$(find src index.html vite.config.ts public -newer dist/index.html -print -quit 2>/dev/null)" ) ) ]]; then
  echo "scena · costruisco la UI"
  env -i $AMBIENTE node_modules/.bin/vite build > "$OUT/vite.log" 2>&1 || { tail -20 "$OUT/vite.log" >&2; exit 1 }
fi

# 4. il server, con la sola casa finta (APP=1: come dentro il guscio, per l'osservatore del Mac)
#    MYYND_PROVA_NIENTE_OPEN=1: «Portami lì» e «Apri» scrivono nel registro invece di lanciare `open` sul Mac
#    MYYND_SENZA_APP_MAC=1 (P4): Calendario del Mac non tocca mai il Calendario vero di chi prova
#    MYYND_PRIMA_RILETTURA_MS anticipa il primo giro di fondo (di serie un minuto dopo l'avvio)
env -i $AMBIENTE MYYND_DATI="$DATI" MYYND_DEV=1 MYYND_PORT=$PORTA MYYND_PROVA_NIENTE_OPEN=1 MYYND_SENZA_APP_MAC=1 ${APP:+MYYND_APP=1} ${MYYND_ADESSO:+MYYND_ADESSO=$MYYND_ADESSO} \
  ${MYYND_PRIMA_RILETTURA_MS:+MYYND_PRIMA_RILETTURA_MS=$MYYND_PRIMA_RILETTURA_MS} \
  node --disable-warning=ExperimentalWarning server/index.ts > "$OUT/server.log" 2>&1 &
SRV=$!
aspetta_riga "$OUT/server.log" 'server su http' 40
B=http://127.0.0.1:$PORTA
i=0
until [[ "$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" $B/api/stato)" == 200 ]]; do
  i=$((i + 1)); (( i > 80 )) && { echo "scena · /api/stato non risponde" >&2; exit 1 }
  sleep 0.25
done
# la pagina dev'essere l'app, non un JSON: senza dist/ il server risponde «Sessione scaduta» su /
curl -s $B/ | grep -q '<div id="root"' || { echo "scena · $B/ non serve l'app (manca dist/?)" >&2; exit 1 }
echo "scena · $NOME su $B (dati $DATI)"

# 5. le fotografie, in una finestra che non si vede
if [[ "${FOTO:-1}" != "0" ]]; then
  for tema in ${=TEMI}; do
    # il tema sta anche sul profilo, e il profilo vince sul browser: si dice a tutti e due
    curl -s -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -X POST $B/api/profilo -d "{\"tema\":\"$tema\"}" > /dev/null
    for larga in ${=LARGHEZZE}; do
      env -i $AMBIENTE URL=$B/ OUT="$OUT" TEMA=$tema LARGA=$larga TOKEN=$TOKEN DATI_ELECTRON="$T/electron-$tema-$larga" ${PASSI:+PASSI="$PASSI"} ${AGENDA_FINTA:+AGENDA_FINTA=$AGENDA_FINTA} \
        node_modules/.bin/electron prove/scatta.cjs 2>> "$OUT/electron.log" | tee -a "$OUT/scatta.log"
    done
  done
fi

echo "scena · fatto: $OUT"
print -l "$OUT"/*.png(N)
if [[ "${TIENI:-0}" == "1" ]]; then
  echo "scena · acceso: server $SRV su $B, modello $MOD su $PORTA_MODELLO, gettone $TOKEN"
  echo "scena · per spegnere: kill $SRV $MOD; rm -rf $T"
fi
