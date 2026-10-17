// I repository un po' più a fondo: su che ramo, cosa non è ancora salvato, chi ha scritto.
//
// `cartelleDiLavoro` legge venti righe di storia e un README. Qui, per i
// repository delle cartelle di lavoro e per quelli trovati da Spotlight (o
// risalendo dai file usati di recente), si chiede a git quello che dice a
// che punto è il lavoro: il ramo, quanti file cambiati e non salvati, gli
// ultimi venti commit con data e autore (suoi o di altri), i rami toccati di
// recente. Mai il contenuto di un file, mai un diff: solo nomi, numeri e le
// righe dei commit, che sono frasi scritte da una persona.

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export type CommitGit = { hash: string; quando: string; autore: string; email: string; mio: boolean; messaggio: string }
export type StatoRepo = {
  percorso: string
  nome: string
  ramo: string | null
  /** I file cambiati e non ancora salvati in un commit. */
  modifiche: number
  commit: CommitGit[]
  /** I rami toccati di recente, dal più nuovo. */
  rami: { nome: string; quando: string }[]
}

export type Git = (cartella: string, argomenti: string[]) => Promise<string | null>

/**
 * Git che guarda e basta: niente fsmonitor (un demone che partirebbe da
 * solo), niente hook di un repository qualunque, niente lock opzionali che
 * potrebbero intralciare il lavoro suo nello stesso momento.
 */
export function argomentiGit(cartella: string, argomenti: string[]): string[] {
  return ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', cartella, ...argomenti]
}

/** Solo i repository dentro casa, e mai su un volume di rete o esterno. */
export function repoAmmesso(percorso: string, casa: string): boolean {
  return percorso.startsWith(casa + '/') && !percorso.startsWith('/Volumes/') && !/\/(Library|\.Trash)\//.test(percorso.slice(casa.length))
}

const gitVero: Git = (cartella, argomenti) => new Promise(risolvi => {
  execFile('git', argomentiGit(cartella, argomenti), { timeout: 5000, maxBuffer: 1 << 20, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
    (errore, stdout) => risolvi(errore ? null : String(stdout ?? '')))
})

const SEP = '\u001f'

/** Le righe di `git log --format=%H<US>%aI<US>%an<US>%ae<US>%s`. */
export function leggiLog(testo: string, mie: ReadonlySet<string>): CommitGit[] {
  return testo.split('\n').filter(Boolean).map(r => {
    const [hash = '', quando = '', autore = '', email = '', ...resto] = r.split(SEP)
    const t = Date.parse(quando)
    return {
      hash: hash.slice(0, 12), quando: Number.isNaN(t) ? '' : new Date(t).toISOString(),
      autore: autore.trim().slice(0, 80), email: email.trim().toLowerCase(), mio: mie.has(email.trim().toLowerCase()),
      messaggio: resto.join(SEP).replace(/\s+/g, ' ').trim().slice(0, 160)
    }
  }).filter(c => c.hash && c.quando)
}

/** Quanti file cambiati dice `git status --porcelain`: una riga per file. */
export function contaModifiche(testo: string): number {
  return testo.split('\n').filter(r => r.trim()).length
}

/** Le righe di `git for-each-ref --format=%(refname:short)<US>%(committerdate:iso-strict)`. */
export function leggiRami(testo: string): { nome: string; quando: string }[] {
  return testo.split('\n').filter(Boolean).map(r => {
    const [nome = '', quando = ''] = r.split(SEP)
    const t = Date.parse(quando)
    return { nome: nome.trim(), quando: Number.isNaN(t) ? '' : new Date(t).toISOString() }
  }).filter(r => r.nome && r.quando)
}

/** Lo stato di un repository; null se non lo è o se git non risponde. */
export async function statoRepo(percorso: string, mieiIndirizzi: Iterable<string> = [], git: Git = gitVero): Promise<StatoRepo | null> {
  const ramo = await git(percorso, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (ramo === null) return null
  const mie = new Set([...mieiIndirizzi].map(x => x.toLowerCase()))
  const suo = (await git(percorso, ['config', 'user.email']))?.trim().toLowerCase()
  if (suo) mie.add(suo)
  const [log, stato, rami] = await Promise.all([
    git(percorso, ['log', '-20', `--format=%H${SEP}%aI${SEP}%an${SEP}%ae${SEP}%s`]),
    git(percorso, ['status', '--porcelain', '--untracked-files=normal']),
    git(percorso, ['for-each-ref', '--sort=-committerdate', '--count=5', 'refs/heads', `--format=%(refname:short)${SEP}%(committerdate:iso-strict)`])
  ])
  const r = ramo.trim()
  return {
    percorso, nome: basename(percorso),
    ramo: r && r !== 'HEAD' ? r : null,
    modifiche: stato ? contaModifiche(stato) : 0,
    commit: log ? leggiLog(log, mie) : [],
    rami: rami ? leggiRami(rami) : []
  }
}

/**
 * La cartella del repository che contiene un file, risalendo al massimo
 * `livelli` volte e mai sopra `casa`; null se non ce n'è uno.
 */
export function repoDelFile(percorso: string, casa: string, livelli = 6, esiste: (p: string) => boolean = existsSync): string | null {
  let d = dirname(percorso)
  for (let i = 0; i < livelli && d.startsWith(casa + '/') && d !== casa; i++) {
    if (esiste(join(d, '.git'))) return d
    d = dirname(d)
  }
  return null
}
