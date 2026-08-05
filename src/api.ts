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

async function json<T>(url: string, opz?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...opz,
    headers: { 'content-type': 'application/json', ...(opz?.headers ?? {}) }
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((corpo as { errore?: string }).errore || `Errore ${r.status}`)
  return corpo as T
}

export const api = {
  stato: () => json<Stato>('/api/stato'),

  profilo: (p: Record<string, unknown>) =>
    json('/api/profilo', { method: 'POST', body: JSON.stringify(p) }),

  collegaPosta: (p: { host: string; porta: number; utente: string; password: string; giorni: number }) =>
    json<{ ok: true; cartelle: string[] }>('/api/connettori/posta', { method: 'POST', body: JSON.stringify(p) }),

  collegaDesktop: (cartelle: string[]) =>
    json<{ ok: true; cartelle: string[] }>('/api/connettori/desktop', { method: 'POST', body: JSON.stringify({ cartelle }) }),

  collegaNotion: (token: string) =>
    json<{ ok: true; pagine: number }>('/api/connettori/notion', { method: 'POST', body: JSON.stringify({ token }) }),

  collegaClaude: (apiKey: string) =>
    json<{ ok: true }>('/api/connettori/claude', { method: 'POST', body: JSON.stringify({ apiKey }) }),

  scollega: (id: string) => json(`/api/connettori/${id}`, { method: 'DELETE' }),

  /** La sincronizzazione arriva a pezzi: ogni riga è un avanzamento. */
  sincronizza(su: (m: Record<string, unknown>) => void, fonte?: string): Promise<void> {
    return new Promise((risolvi, rifiuta) => {
      const es = new EventSource(`/api/sincronizza${fonte ? `?fonte=${fonte}` : ''}`)
      es.onmessage = e => {
        const m = JSON.parse(e.data)
        su(m)
        if (m.fase === 'fine' || m.fase === 'errore') {
          es.close()
          m.fase === 'errore' ? rifiuta(new Error(String(m.errore))) : risolvi()
        }
      }
      es.onerror = () => { es.close(); rifiuta(new Error('Sincronizzazione interrotta.')) }
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
