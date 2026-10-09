#!/bin/zsh
# Il primo avvio di un conto nuovo, in inglese, per tutt'e due i pubblici.
#
#   OUT=<cartella> PORTA=18900 prove/primo-avvio.sh
#
# Come `prove/lavoro-p3.sh`: i passi cambiano lo stato (il progetto si salva,
# la posta si collega, la lettura parte, si esce dal conto), e dalla seconda
# passata in poi l'avvio riprenderebbe a metà. Qui ogni tema e ogni larghezza
# ripartono da una semina nuova, una volta con «My team or company» fino alla
# lettura e all'accesso (`primo-avvio-pubblico.json`), una con «Just me» fino
# alle strade di chi ragiona (`primo-avvio-persona.json`), e una con l'accesso
# al disco negato, per i passi guidati di Mail del Mac (`primo-avvio-disco`).
# `COPPIE="scena:passi …"` ne sceglie solo alcune.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18900}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-primo-avvio-XXXXXX")}
mkdir -p "$OUT"
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1100 1500}
COSTRUISCI=${COSTRUISCI:-auto}
# scena:passi — la terza è Mail del Mac senza l'accesso al disco, con i tre passi guidati
for coppia in ${=COPPIE:-primo-avvio-pubblico:primo-avvio-pubblico primo-avvio-pubblico:primo-avvio-persona primo-avvio-disco:primo-avvio-disco}; do
  scena=${coppia%%:*}; passi=${coppia##*:}
  for tema in ${=TEMI}; do
    for larga in ${=LARGHEZZE}; do
      echo "primo-avvio · $passi $tema $larga"
      OUT="$OUT" PORTA=$PORTA TEMI=$tema LARGHEZZE=$larga COSTRUISCI=$COSTRUISCI \
        SCENA=prove/scene/$scena.json PASSI=prove/passi/$passi.json \
        prove/scena.sh
      COSTRUISCI=no
      for f in server.log modello.jsonl modello.log scatta.log semina.log electron.log; do
        [[ -f "$OUT/$f" ]] && mv "$OUT/$f" "$OUT/${f%.*}-$passi-$tema-$larga.${f##*.}"
      done
    done
  done
done
echo "primo-avvio · fatto: $OUT"
