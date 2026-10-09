#!/bin/zsh
# Quello che si vede di quello che ha imparato (D), una semina per ogni passata.
#
#   OUT=<cartella> PORTA=18860 prove/imparato-d.sh
#
# I passi cambiano lo stato («Not mine» lascia una riga, «Undo» toglie una
# regola, «Always» tiene una convinzione): come `lavoro-p3.sh`, la scena
# riparte da capo per ogni tema e larghezza, e i registri di ogni passata
# portano il tema e la larghezza nel nome.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18860}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-imparato-d-XXXXXX")}
mkdir -p "$OUT"
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1100 1500}
COSTRUISCI=${COSTRUISCI:-auto}
for tema in ${=TEMI}; do
  for larga in ${=LARGHEZZE}; do
    echo "imparato-d · $tema $larga"
    OUT="$OUT" PORTA=$PORTA TEMI=$tema LARGHEZZE=$larga COSTRUISCI=$COSTRUISCI \
      SCENA=prove/scene/imparato-d.json COPIONE=prove/copioni/imparato-d.json PASSI=prove/passi/imparato-d.json \
      prove/scena.sh
    COSTRUISCI=no
    for f in server.log modello.jsonl modello.log scatta.log semina.log electron.log; do
      [[ -f "$OUT/$f" ]] && mv "$OUT/$f" "$OUT/${f%.*}-$tema-$larga.${f##*.}"
    done
  done
done
echo "imparato-d · fatto: $OUT"
