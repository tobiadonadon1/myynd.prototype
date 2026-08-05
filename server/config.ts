// Configurazione locale, in ~/.myynd/config.json con permessi 0600.
//
// Le credenziali le scrivi tu nella tua app, sul tuo computer: restano qui e
// non escono mai da questa macchina se non verso il servizio a cui servono.
// Non finiscono mai nelle risposte dell'API né nei log.

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DIR = join(homedir(), '.myynd')
const FILE = join(DIR, 'config.json')

export type ConfigPosta = {
  host: string
  porta: number
  utente: string
  password: string
  cartelle?: string[]
  giorni?: number
}

export type ConfigDesktop = { cartelle: string[]; estensioni?: string[] }
export type ConfigNotion = { token: string }
export type ConfigClaude = { apiKey: string }

export type Config = {
  nome?: string
  ruolo?: string
  onboarding?: boolean
  posta?: ConfigPosta
  desktop?: ConfigDesktop
  notion?: ConfigNotion
  claude?: ConfigClaude
  tono?: string
  autonomia?: string
}

function assicuraDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 })
}

export function leggi(): Config {
  assicuraDir()
  if (!existsSync(FILE)) return {}
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as Config
  } catch {
    return {}
  }
}

export function scrivi(c: Config) {
  assicuraDir()
  writeFileSync(FILE, JSON.stringify(c, null, 2), { mode: 0o600 })
  chmodSync(FILE, 0o600)
}

export function aggiorna(patch: Partial<Config>): Config {
  const c = { ...leggi(), ...patch }
  scrivi(c)
  return c
}

/** La configurazione senza nessun segreto — questa sì può uscire dall'API. */
export function pubblica(c: Config = leggi()) {
  return {
    nome: c.nome ?? null,
    ruolo: c.ruolo ?? null,
    onboarding: !!c.onboarding,
    tono: c.tono ?? 'diretto',
    autonomia: c.autonomia ?? 'preparare',
    posta: c.posta ? { host: c.posta.host, utente: c.posta.utente, giorni: c.posta.giorni ?? 30 } : null,
    desktop: c.desktop ? { cartelle: c.desktop.cartelle } : null,
    notion: c.notion ? { collegato: true } : null,
    claude: c.claude ? { collegato: true } : null
  }
}
