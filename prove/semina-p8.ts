// La parte della semina che serve alla salute delle fonti (P8).
//
// La chiama `prove/semina.ts` dentro il conto, quando la scena ha «p8». Scrive
// con i moduli veri quello che una giornata sola non può dare: trenta giorni
// di storia, i guai di adesso, le Note chiuse come su un Mac senza accesso al
// disco, un `claude` finto da cui si è usciti. Tutto dentro la casa finta.
//
// «p8» (tutto facoltativo):
//   config        unita alla configurazione (cfg.aggiorna)
//   togli         chiavi tolte dalla configurazione (["compatibile"])
//   claude        "fuori": un `claude` finto in <casa>/.local/bin che risponde «non sei entrato»
//   noteNegate    true: un NoteStore.sqlite vuoto, con mode 000
//   versioni      { fonte: "0.2.23" }: la versione dell'ultima lettura pulita (cursore salute:versione:<fonte>)
//   indicizzati   { "<id>": "-6d" }: quando un documento è entrato nell'indice
//   storia        [{ fonte, giorni: "ppg-m", rimedio?, arrivi?, totale?, nuova? }]: una lettera per giorno,
//                 l'ultima è ieri; p pulito, g guasto, m muto, - niente. Le ultime `nuova` hanno la versione dell'app.
//   episodi       [{ fonte, motivo?, rimedio, dal: "-26h", fila?, visto?: "-15m", frase? }]
//   saltaGiornaliero  true: il giro del giorno risulta già fatto (niente sonda di WhatsApp durante la scena)

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SERVER = new URL('../server/', import.meta.url).pathname
const cfg = await import(join(SERVER, 'config.ts'))
const store = await import(join(SERVER, 'store.ts'))
const salute = await import(join(SERVER, 'salute-fonti.ts'))
const fuso = await import(join(SERVER, 'fuso.ts'))

/** Claude Code finto: entra quando glielo si chiede, e dice se c'è entrato (lo stesso delle prove delle rotte). */
const FINTO_CLAUDE = `#!/bin/sh
echo "$*" >> "$HOME/.fc/chiamate"
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  if [ -f "$HOME/.fc/entrato" ]; then echo '{"loggedIn":true}'; else echo '{"loggedIn":false}'; fi
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "login" ]; then
  echo "visit: https://claude.ai/oauth/authorize?finto=1"
  sleep 0.3
  touch "$HOME/.fc/entrato"
  exit 0
fi
cat > /dev/null
echo '{"type":"result","subtype":"success","is_error":false,"result":"ok"}'
`

type Storia = { fonte: string; giorni: string; rimedio?: string; arrivi?: number; totale?: number; nuova?: number }
type Episodio = { fonte: string; motivo?: string; rimedio: string | null; dal: string; fila?: number; visto?: string; frase?: string }
export type P8 = {
  config?: Record<string, unknown>; togli?: string[]; claude?: 'fuori'; noteNegate?: boolean
  versioni?: Record<string, string>; indicizzati?: Record<string, string>; storia?: Storia[]; episodi?: Episodio[]
  saltaGiornaliero?: boolean
}

/** «-26h», «-6d», «-15m»: un istante ISO. */
function tempo(v: string): string {
  const m = v.match(/^([+-])(\d+(?:\.\d+)?)([mhd])$/)
  if (!m) return new Date(v).toISOString()
  const ms = Number(m[2]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string, number>)[m[3]]
  return new Date(Date.now() + (m[1] === '-' ? -ms : ms)).toISOString()
}

/** Il giorno locale `n` giorni fa. */
function giornoFa(n: number): string {
  const d = new Date()
  return fuso.giornoIn(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12))
}

const MOTORI = new Set(['claude', 'openai'])

export function semina(p8: P8, o: { casa: string }) {
  const db = store.default
  if (p8.config) cfg.aggiorna(p8.config)
  if (p8.togli?.length) {
    const c = cfg.leggi() as Record<string, unknown>
    for (const k of p8.togli) delete c[k]
    cfg.scrivi(c, { togli: p8.togli })
  }

  if (p8.claude === 'fuori') {
    mkdirSync(join(o.casa, '.local', 'bin'), { recursive: true })
    mkdirSync(join(o.casa, '.fc'), { recursive: true })
    writeFileSync(join(o.casa, '.local', 'bin', 'claude'), FINTO_CLAUDE)
    chmodSync(join(o.casa, '.local', 'bin', 'claude'), 0o755)
  }

  if (p8.noteNegate) {
    const dir = join(o.casa, 'Library', 'Group Containers', 'group.com.apple.notes')
    mkdirSync(dir, { recursive: true })
    const f = join(dir, 'NoteStore.sqlite')
    const d = new DatabaseSync(f)
    d.exec('CREATE TABLE IF NOT EXISTS ZICCLOUDSYNCINGOBJECT (Z_PK INTEGER PRIMARY KEY)')
    d.close()
    chmodSync(f, 0o000)
  }

  for (const [fonte, v] of Object.entries(p8.versioni ?? {})) store.segnaCursore(`salute:versione:${fonte}`, v)

  for (const [id, quando] of Object.entries(p8.indicizzati ?? {})) {
    db.prepare('UPDATE documenti SET indicizzato = ? WHERE id = ?').run(tempo(quando), id)
  }

  const versione = salute.versioneApp()
  const scrivi = db.prepare(`INSERT OR REPLACE INTO salute_fonti (giorno, fonte, letture, pulite, incomplete, guai, fila, documenti, tolti, totale, durata,
    sonda, rimedio, frase, versione, prima, ultima, verdetto) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  for (const s of p8.storia ?? []) {
    const lettere = [...s.giorni]
    lettere.forEach((l, i) => {
      if (l === '-') return
      const fa = lettere.length - i
      const giorno = giornoFa(fa)
      const testa = MOTORI.has(s.fonte)
      const nuova = (s.nuova ?? 0) >= fa
      const v = nuova ? versione : '0.2.23'
      const ora = new Date(Date.parse(`${giorno}T12:00:00`)).toISOString()
      const [letture, pulite, guai] = testa ? [1, l === 'g' ? 0 : 1, l === 'g' ? 1 : 0]
        : l === 'p' ? [144, 144, 0] : l === 'g' ? [144, 130, 14] : [1, 1, 0]
      const documenti = l === 'm' || testa ? 0 : s.arrivi ?? 0
      const verdetto = l === 'p' ? 'pulito' : l === 'g' ? 'guasto' : 'muto'
      scrivi.run(giorno, s.fonte, letture, pulite, 0, guai, 0, documenti, 0, s.totale ?? null, 1200,
        l === 'm' ? 'ok' : null, l === 'g' ? (s.rimedio ?? 'guarda') : null, null, v, ora, ora, verdetto)
    })
  }

  for (const e of p8.episodi ?? []) {
    db.prepare('INSERT OR REPLACE INTO stato_fonti (fonte, motivo, rimedio, frase, dal, fila, visto) VALUES (?,?,?,?,?,?,?)')
      .run(e.fonte, e.motivo ?? 'non-disponibile', e.rimedio, e.frase ?? null, tempo(e.dal), e.fila ?? 1, tempo(e.visto ?? e.dal))
  }

  if (p8.saltaGiornaliero) {
    const f = join(cfg.cartella(), 'scheduled-catchup.json')
    let j: Record<string, unknown> = {}
    try { j = JSON.parse(readFileSync(f, 'utf8')) } catch { /* nuovo */ }
    const adesso = Date.now()
    j.source_health = { slot: Math.floor(adesso / (24 * 3600_000)), started: adesso, finished: adesso, state: 'complete' }
    writeFileSync(f, JSON.stringify(j), { mode: 0o600 })
  }
}
