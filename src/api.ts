// Il ponte con il server locale. Niente dati finti: se non c'è ancora niente
// collegato, le risposte tornano vuote e l'interfaccia lo dice.

export type Connettore = {
  id: string
  nome: string
  gruppo: string
  pronto: boolean
  nota: string
  collegato: boolean
  documenti: number
}

export type Stato = {
  config: {
    nome: string | null
    ruolo: string | null
    onboarding: boolean
    tono: string
    autonomia: string
    posta: { host: string; utente: string; giorni: number } | null
    desktop: { cartelle: string[] } | null
    notion: { collegato: boolean } | null
    claude: { collegato: boolean } | null
  }
  conteggi: {
    totale: number
    perFonte: { fonte: string; n: number }[]
    perGruppo: { gruppo: string; n: number }[]
  }
  connettori: Connettore[]
  suggerimentiDesktop: string[]
  presetPosta: Record<string, { host: string; porta: number; smtp: string; smtpPorta: number }>
  home: string
}

const CHIAVE = 'myynd.token'

export const sessione = {
  token: () => localStorage.getItem(CHIAVE) ?? '',
  imposta: (t: string) => localStorage.setItem(CHIAVE, t),
  pulisci: () => localStorage.removeItem(CHIAVE)
}

/** Chiamato quando il server dice che la sessione non vale più. */
let suScaduta: () => void = () => {}
export function alloScadere(f: () => void) { suScaduta = f }

async function json<T>(url: string, opz?: RequestInit): Promise<T> {
  const t = sessione.token()
  const r = await fetch(url, {
    ...opz,
    headers: {
      'content-type': 'application/json',
      ...(t ? { authorization: `Bearer ${t}` } : {}),
      ...(opz?.headers ?? {})
    }
  })
  const corpo = await r.json().catch(() => ({}))
  if (r.status === 401 && !url.startsWith('/api/auth')) {
    sessione.pulisci()
    suScaduta()
  }
  if (!r.ok) throw new Error((corpo as { errore?: string }).errore || `Errore ${r.status}`)
  return corpo as T
}

/** Trasforma un avanzamento della lettura in una riga da mostrare. */
export function rigaSincronizzazione(m: Record<string, unknown>): string {
  const fonte = String(m.fase ?? '')
  if (m.stato !== 'fatto') return `${fonte} · ${m.stato}`
  const parti = [`${Number(m.documenti ?? 0)} documenti`]
  if (Number(m.tolti)) parti.push(`${Number(m.tolti)} spariti`)
  if (Number(m.saltati)) parti.push(`${Number(m.saltati)} progetti saltati`)
  if (Number(m.falliti)) parti.push(`${Number(m.falliti)} illeggibili`)
  if (Number(m.parziali)) parti.push(`${Number(m.parziali)} pagine a metà`)
  if (m.troncato) parti.push('tetto raggiunto')
  if (m.interrotto) parti.push('interrotto da Notion')
  const dirs = (m.illeggibili as string[] | undefined) ?? []
  if (dirs.length) parti.push(`${dirs.length} cartelle senza permessi`)
  const fall = (m.cartelleFallite as string[] | undefined) ?? []
  if (fall.length) parti.push(`${fall.length} cartelle non lette`)
  return `${fonte} · ${parti.join(' · ')}`
}

export type Accesso = {
  registrato: boolean
  entrato: boolean
  account: { email: string } | null
}

export const api = {
  accesso: () => json<Accesso>('/api/auth'),

  registra: async (email: string, password: string) => {
    const r = await json<{ token: string; account: { email: string } }>(
      '/api/auth/registra', { method: 'POST', body: JSON.stringify({ email, password }) })
    sessione.imposta(r.token)
    return r
  },

  entra: async (email: string, password: string) => {
    const r = await json<{ token: string; account: { email: string } }>(
      '/api/auth/entra', { method: 'POST', body: JSON.stringify({ email, password }) })
    sessione.imposta(r.token)
    return r
  },

  esci: async () => {
    try { await json('/api/auth/esci', { method: 'POST' }) } finally { sessione.pulisci() }
  },

  stato: () => json<Stato>('/api/stato'),

  profilo: (p: Record<string, unknown>) =>
    json('/api/profilo', { method: 'POST', body: JSON.stringify(p) }),

  collegaPosta: (p: { host: string; porta: number; utente: string; password: string; giorni: number }) =>
    json<{ ok: true; cartelle: string[]; certificatoAdattato: string | null }>(
      '/api/connettori/posta', { method: 'POST', body: JSON.stringify(p) }),

  collegaDesktop: (cartelle: string[]) =>
    json<{ ok: true; cartelle: string[] }>('/api/connettori/desktop', { method: 'POST', body: JSON.stringify({ cartelle }) }),

  collegaNotion: (token: string) =>
    json<{ ok: true; pagine: number }>('/api/connettori/notion', { method: 'POST', body: JSON.stringify({ token }) }),

  collegaClaude: (apiKey: string) =>
    json<{ ok: true }>('/api/connettori/claude', { method: 'POST', body: JSON.stringify({ apiKey }) }),

  scollega: (id: string) => json(`/api/connettori/${id}`, { method: 'DELETE' }),

  /** La sincronizzazione arriva a pezzi: ogni riga è un avanzamento. */
  async sincronizza(su: (m: Record<string, unknown>) => void, fonte?: string): Promise<void> {
    // EventSource non porta intestazioni e non espone lo stato HTTP: prima
    // controllo la sessione, così una scadenza riporta all'accesso invece di
    // diventare un generico "interrotta"
    await json('/api/stato')

    return new Promise((risolvi, rifiuta) => {
      const q = new URLSearchParams({ t: sessione.token(), ...(fonte ? { fonte } : {}) })
      const es = new EventSource(`/api/sincronizza?${q}`)
      let finita = false
      const chiudi = (f: () => void) => { if (!finita) { finita = true; es.close(); f() } }

      es.onmessage = e => {
        let m: Record<string, unknown>
        try {
          m = JSON.parse(e.data)
        } catch {
          return chiudi(() => rifiuta(new Error('Risposta illeggibile dal server.')))
        }
        su(m)
        if (m.fase === 'fine') chiudi(risolvi)
        else if (m.fase === 'errore') chiudi(() => rifiuta(new Error(String(m.errore))))
      }
      es.onerror = () => chiudi(() => rifiuta(new Error('Lettura interrotta.')))
    })
  },

  mente: () => json<{ totale: number; gruppi: { id: string; nome: string; colore: string; nodi: number }[] }>('/api/mente'),

  cerca: (q: string) =>
    json<{ id: string; titolo: string; fonte: string; gruppo: string; quando: string; estratto: string }[]>(
      `/api/cerca?q=${encodeURIComponent(q)}`),

  documento: (id: string) => json<Record<string, string>>(`/api/documento?id=${encodeURIComponent(id)}`),

  feed: () => json<{ aperti: Record<string, string>[]; fatte: Record<string, string>[] }>('/api/feed'),
  generaFeed: () => json<{ ok: true; generate: number; feed: Record<string, string>[] }>('/api/feed/genera', { method: 'POST' }),
  segnaFeed: (id: string, stato: 'fatto' | 'aperto') => json(`/api/feed/${id}/${stato}`, { method: 'POST' }),

  chat: () => json<{ id: string; titolo: string; quando: string }[]>('/api/chat'),
  messaggi: (id: string) => json<{ id: string; role: string; text: string; sources?: { id: string; label: string }[] }[]>(`/api/chat/${id}`),
  eliminaChat: (id: string) => json(`/api/chat/${id}`, { method: 'DELETE' }),
  chiedi: (chat: string, testo: string) =>
    json<{ messaggi: { id: string; role: string; text: string; sources?: { id: string; label: string }[] }[] }>(
      `/api/chat/${chat}`, { method: 'POST', body: JSON.stringify({ testo }) })
}
