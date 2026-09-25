#!/bin/zsh
# La scena della prova delle automazioni (P6), una semina per ogni passata.
#
#   OUT=<cartella> PORTA=18770 prove/automazioni-p6.sh
#
# I passi cambiano lo stato (un risultato va in lista, due prove girano,
# «Termina la prova»): come per P3 la scena riparte da capo per ogni tema e
# larghezza, e i registri di ogni passata portano il tema e la larghezza nel nome.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18770}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-automazioni-p6-XXXXXX")}
mkdir -p "$OUT"
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1280 1100}
COSTRUISCI=${COSTRUISCI:-auto}
for tema in ${=TEMI}; do
  for larga in ${=LARGHEZZE}; do
    echo "automazioni-p6 · $tema $larga"
    OUT="$OUT" PORTA=$PORTA TEMI=$tema LARGHEZZE=$larga COSTRUISCI=$COSTRUISCI \
      SCENA=prove/scene/automazioni-p6.json COPIONE=prove/copioni/p6.json PASSI=prove/passi/automazioni-p6.json \
      prove/scena.sh
    COSTRUISCI=no
    for f in server.log modello.jsonl modello.log scatta.log semina.log electron.log; do
      [[ -f "$OUT/$f" ]] && mv "$OUT/$f" "$OUT/${f%.*}-$tema-$larga.${f##*.}"
    done
  done
done
echo "automazioni-p6 · fatto: $OUT"
