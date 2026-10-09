#!/bin/zsh
# Il primo gradino, dopo la verifica: la riga in coda non mostra il compito
# per chi lavora, la prima volta di una regola resta scritta sulla bozza, e
# «Take it back» in Memoria ha il suo nome e ritira subito quello in coda.
#
#   OUT=<cartella> PORTA=18862 prove/imparato-d2.sh
#
# «Take it back» cambia lo stato: la scena si semina da capo per ogni tema e larghezza.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18862}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-imparato-d2-XXXXXX")}
mkdir -p "$OUT"
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1100 1500}
COSTRUISCI=${COSTRUISCI:-auto}
for tema in ${=TEMI}; do
  for larga in ${=LARGHEZZE}; do
    echo "imparato-d2 · $tema $larga"
    OUT="$OUT" PORTA=$PORTA TEMI=$tema LARGHEZZE=$larga COSTRUISCI=$COSTRUISCI \
      SCENA=prove/scene/imparato-d2.json COPIONE=prove/copioni/imparato-d.json PASSI=prove/passi/imparato-d2.json \
      prove/scena.sh
    COSTRUISCI=no
    for f in server.log modello.jsonl modello.log scatta.log semina.log electron.log; do
      [[ -f "$OUT/$f" ]] && mv "$OUT/$f" "$OUT/${f%.*}-$tema-$larga.${f##*.}"
    done
  done
done
echo "imparato-d2 · fatto: $OUT"
