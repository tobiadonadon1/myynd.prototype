#!/bin/zsh
# Il lavoro da sé dal vivo (`server/da-se.ts`): idee per X, copione, pagina di Notion.
#
#   OUT=<cartella> PORTA=18970 prove/da-se.sh
#
# Una Notion finta che scrive (PORTA+2), la scena `da-se` col modello finto
# (PORTA+1) e il copione `da-se`, il server acceso. Niente si affida a mano:
# la preparazione di ogni quarto d'ora (il primo giro due minuti e mezzo dopo
# l'avvio) mette le carte in coda, e il turno, con la notte messa attorno
# all'ora della prova, le lavora. Si aspetta che le idee e il copione siano
# pronti e che la pagina sia in Notion, si fotografa la prima pagina nei due
# temi e nelle due larghezze, e si copiano in OUT i file consegnati, la pagina
# scritta e le carte.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18970}
PORTA_NOTION=$((PORTA + 2))
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-da-se-XXXXXX")}
mkdir -p "$OUT"
TOKEN=sviluppo-non-in-produzione
B=http://127.0.0.1:$PORTA

if lsof -nP -iTCP:$PORTA_NOTION -sTCP:LISTEN >/dev/null 2>&1; then echo "da-se · la porta $PORTA_NOTION è occupata" >&2; exit 1; fi
env -i PATH="$PATH" FINTO_PORTA=$PORTA_NOTION FINTO_SCRIVE=1 node prove/finto-notion.mjs > "$OUT/notion.log" 2>&1 &
NOT=$!
SPEGNI=
fine() {
  kill -TERM $NOT 2>/dev/null || true
  [[ -n "$SPEGNI" ]] && eval "$SPEGNI" 2>/dev/null || true
}
trap fine EXIT INT TERM

COSTRUISCI=${COSTRUISCI:-auto} TIENI=1 FOTO=0 OUT="$OUT" PORTA=$PORTA SCENA=prove/scene/da-se.json COPIONE=prove/copioni/da-se.json \
  NOTION_URL=http://127.0.0.1:$PORTA_NOTION prove/scena.sh | tee "$OUT/scena.log"
SPEGNI=$(grep -o 'per spegnere: .*' "$OUT/scena.log" | sed 's/per spegnere: //')
T=$(echo "$SPEGNI" | sed 's/.*rm -rf //')
[[ -d "$T" ]] || { echo "da-se · non trovo la cartella della scena" >&2; exit 1 }

# fino a sei minuti: il primo giro della preparazione, poi il turno una carta alla volta
i=0
until curl -s -H "authorization: Bearer $TOKEN" $B/api/compiti | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const c = JSON.parse(s).compiti ?? []
    const pronta = o => c.some(x => x.origine === o && x.stato === "pronto")
    process.exit(pronta("idee-x") && pronta("copione-video") ? 0 : 1)
  })' && curl -s http://127.0.0.1:$PORTA_NOTION/__pagine | grep -q '"titolo"'; do
  i=$((i + 1)); (( i > 180 )) && { echo "da-se · le carte non sono pronte in sei minuti" >&2; grep 'da sé\|turno' "$OUT/server.log" | tail -20 >&2; exit 1 }
  sleep 2
done
echo "da-se · pronte dopo $((i * 2)) s"

curl -s -H "authorization: Bearer $TOKEN" $B/api/compiti > "$OUT/compiti.json"
curl -s http://127.0.0.1:$PORTA_NOTION/__pagine > "$OUT/notion-pagine.json"
mkdir -p "$OUT/consegne"
cp -R "$T/casa/Desktop/Myynd/." "$OUT/consegne/" 2>/dev/null || true
find "$OUT/consegne" -type f | sed "s|$OUT/||"

for tema in chiaro scuro; do
  curl -s -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -X POST $B/api/profilo -d "{\"tema\":\"$tema\"}" > /dev/null
  for larga in 1280 1100; do
    env -i PATH="$PATH" HOME="$T/casa" URL=$B/ OUT="$OUT" TEMA=$tema LARGA=$larga TOKEN=$TOKEN DATI_ELECTRON="$T/electron-$tema-$larga" PASSI=prove/passi/da-se.json \
      node_modules/.bin/electron prove/scatta.cjs 2>> "$OUT/electron.log" | tee -a "$OUT/scatta.log"
  done
done
echo "da-se · fatto: $OUT"
