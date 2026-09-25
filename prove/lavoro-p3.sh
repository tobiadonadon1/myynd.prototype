#!/bin/zsh
# La scena del lavoro affidato (P3), una semina per ogni passata.
#
#   OUT=<cartella> PORTA=18740 prove/lavoro-p3.sh
#
# `prove/scena.sh` semina una volta e fotografa quattro volte (due temi, due
# larghezze) sullo stesso server: i passi di questa scena cambiano lo stato
# delle righe («Cambia» su una riga consegnata, la revisione che parte), e
# dalla seconda passata in poi quelle righe non ci sono più com'erano. Qui la
# scena riparte da capo per ogni tema e larghezza, così ogni fotografia mostra
# gli stessi stati. Le fotografie e i registri finiscono tutti in OUT, con il
# tema e la larghezza nel nome come sempre.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18740}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-lavoro-p3-XXXXXX")}
mkdir -p "$OUT"
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1280 1100}
# la UI si costruisce una volta sola, alla prima passata
COSTRUISCI=${COSTRUISCI:-auto}
for tema in ${=TEMI}; do
  for larga in ${=LARGHEZZE}; do
    echo "lavoro-p3 · $tema $larga"
    OUT="$OUT" PORTA=$PORTA TEMI=$tema LARGHEZZE=$larga COSTRUISCI=$COSTRUISCI \
      SCENA=prove/scene/lavoro-p3.json COPIONE=prove/copioni/lavoro-p3.json PASSI=prove/passi/lavoro-p3.json \
      prove/scena.sh
    COSTRUISCI=no
    # i registri di questa passata, con il nome della passata
    for f in server.log modello.jsonl modello.log scatta.log semina.log electron.log; do
      [[ -f "$OUT/$f" ]] && mv "$OUT/$f" "$OUT/${f%.*}-$tema-$larga.${f##*.}"
    done
  done
done
echo "lavoro-p3 · fatto: $OUT"
