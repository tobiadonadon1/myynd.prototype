// Il fuso di un file iCalendar, quando non è un fuso.
//
// `DTSTART;TZID=Europe/Rome:20260910T090000` è la forma facile: quel nome è un
// nome della tabella IANA, `Intl` lo conosce, e non serve altro. Il problema è
// tutto il resto, e arriva quasi sempre da Outlook.
//
// Outlook scrive `TZID="W. Europe Standard Time"`. Non è un nome IANA, `Intl`
// non lo conosce, e il controllo che chiedeva a `Intl` se il fuso esistesse
// rispondeva no — quindi l'ora finiva nel ramo «nuda», cioè letta come ora
// locale della macchina. Su un contenitore in UTC una riunione delle 15 a Roma
// diventava una riunione delle 15 UTC: due ore avanti d'estate, una d'inverno.
// Nessun errore da nessuna parte: solo un'agenda che dice cose false, e un
// modello che le ripete a chi legge.
//
// Ci sono due strade per uscirne, e servono tutt'e due.
//
// La prima è una tabella: da «W. Europe Standard Time» a «Europe/Berlin». È
// noiosa ma è la strada giusta, perché da lì in poi le regole dell'ora legale
// le tiene il sistema operativo, aggiornate, invece di tenerle noi.
//
// La seconda è il file stesso. Un .ics fatto bene porta dentro il suo
// `VTIMEZONE`: quanto scarta dall'UTC d'inverno, quanto d'estate, e in che
// giorno si cambia. È meno preciso della tabella IANA — vale solo per gli anni
// che le regole scritte lì coprono — ma è l'unica cosa che si ha quando il TZID
// è inventato da chi ha esportato il file, e capita.
//
// Quindi: prima IANA, poi la tabella, poi il file. E se non si sa niente, si
// dice che non si sa, invece di far finta che sia mezzogiorno da qualche parte.

import { fusoValido } from '../fuso.ts'

/** Che ora segna un orologio: i pezzi, non il testo. */
export type Orologio = {
  anno: number
  mese: number
  giorno: number
  ore: number
  minuti: number
  secondi: number
  /** Domenica 0, come `getDay`. */
  settimana: number
}

/**
 * Un fuso, comunque lo si sia capito.
 *
 * Le due direzioni servono tutt'e due, e la seconda è quella che mancava: per
 * srotolare «ogni giorno alle 9» bisogna poter dire «il giorno dopo, alle 9,
 * **lì**» — che non è «più ventiquattro ore», perché la notte del cambio d'ora
 * ne dura venticinque.
 */
export type Zona = {
  /** Come si chiama, per chi legge un errore. */
  nome: string
  /** Che ora segna lì, in questo istante. */
  orologio(d: Date): Orologio
  /**
   * L'istante in cui, lì, l'orologio segna questo.
   *
   * Il giorno può sforare il mese e il mese può sforare l'anno: `Date.UTC`
   * normalizza da sé, ed è quello che rende possibile «giorno + 1» senza
   * doversi ricordare quanti giorni ha febbraio.
   */
  istante(anno: number, mese: number, giorno: number, ore: number, minuti: number, secondi: number): Date
}

/**
 * Da un orologio all'istante, per tentativi.
 *
 * Si parte dall'ipotesi UTC, si legge che ora sarebbe lì, si guarda di quanto
 * ci si è sbagliati e si corregge. Due giri bastano sempre; il terzo è per le
 * ore che non esistono — le due e mezza della notte in cui l'orologio salta
 * avanti — dove nessuna risposta è giusta e conviene comunque darne una.
 */
function perTentativi(
  orologio: (d: Date) => Orologio,
  anno: number, mese: number, giorno: number, ore: number, minuti: number, secondi: number
): Date {
  const voluto = Date.UTC(anno, mese - 1, giorno, ore, minuti, secondi)
  let t = voluto
  for (let giro = 0; giro < 3; giro++) {
    const p = orologio(new Date(t))
    const visto = Date.UTC(p.anno, p.mese - 1, p.giorno, p.ore, p.minuti, p.secondi)
    if (visto === voluto) break
    t += voluto - visto
  }
  return new Date(t)
}

const SETTIMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** I formattatori costano: uno per fuso, tenuto da parte. */
const FORMATI = new Map<string, Intl.DateTimeFormat>()

function formato(nome: string): Intl.DateTimeFormat {
  let f = FORMATI.get(nome)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: nome, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
    })
    FORMATI.set(nome, f)
  }
  return f
}

/** Un fuso vero, di quelli che il sistema conosce e tiene aggiornati. */
export function zonaIana(nome: string): Zona {
  const orologio = (d: Date): Orologio => {
    const p: Record<string, string> = {}
    for (const x of formato(nome).formatToParts(d)) p[x.type] = x.value
    return {
      anno: Number(p.year), mese: Number(p.month), giorno: Number(p.day),
      // en-US con l'orologio a ventiquattro può dire «24» a mezzanotte
      ore: Number(p.hour) % 24, minuti: Number(p.minute), secondi: Number(p.second),
      settimana: SETTIMANA[p.weekday] ?? 0
    }
  }
  return {
    nome,
    orologio,
    istante: (a, m, g, o, mi, s) => perTentativi(orologio, a, m, g, o, mi, s)
  }
}

/** Uno scarto fisso dall'UTC, in minuti. Serve a UTC stesso e ai fusi senza ora legale. */
export function zonaFissa(nome: string, scarto: number): Zona {
  const orologio = (d: Date): Orologio => leggiUTC(new Date(d.getTime() + scarto * 60_000))
  return {
    nome,
    orologio,
    istante: (a, m, g, o, mi, s) => new Date(Date.UTC(a, m - 1, g, o, mi, s) - scarto * 60_000)
  }
}

function leggiUTC(d: Date): Orologio {
  return {
    anno: d.getUTCFullYear(), mese: d.getUTCMonth() + 1, giorno: d.getUTCDate(),
    ore: d.getUTCHours(), minuti: d.getUTCMinutes(), secondi: d.getUTCSeconds(),
    settimana: d.getUTCDay()
  }
}

export const ZONA_UTC = zonaFissa('UTC', 0)

// — la tabella di Windows —

/**
 * I nomi che Outlook scrive al posto di quelli veri.
 *
 * Non sono tutti: sono quelli che capitano. La tabella completa di Microsoft ne
 * ha più di centoquaranta e cambia da sé; questa copre l'Europa intera, le
 * Americhe, l'Asia dove si lavora e l'Oceania, cioè i posti da cui arriva un
 * invito a una riunione. Quello che manca non rompe niente: ricade sul
 * `VTIMEZONE` del file, che per un file di Outlook c'è sempre.
 */
export const WINDOWS: Record<string, string> = {
  'Dateline Standard Time': 'Etc/GMT+12',
  'UTC-11': 'Etc/GMT+11',
  'Aleutian Standard Time': 'America/Adak',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Marquesas Standard Time': 'Pacific/Marquesas',
  'Alaskan Standard Time': 'America/Anchorage',
  'UTC-09': 'Etc/GMT+9',
  'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'UTC-08': 'Etc/GMT+8',
  'Pacific Standard Time': 'America/Los_Angeles',
  'US Mountain Standard Time': 'America/Phoenix',
  'Mountain Standard Time (Mexico)': 'America/Chihuahua',
  'Mountain Standard Time': 'America/Denver',
  'Yukon Standard Time': 'America/Whitehorse',
  'Central America Standard Time': 'America/Guatemala',
  'Central Standard Time': 'America/Chicago',
  'Easter Island Standard Time': 'Pacific/Easter',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Canada Central Standard Time': 'America/Regina',
  'SA Pacific Standard Time': 'America/Bogota',
  'Eastern Standard Time (Mexico)': 'America/Cancun',
  'Eastern Standard Time': 'America/New_York',
  'Haiti Standard Time': 'America/Port-au-Prince',
  'Cuba Standard Time': 'America/Havana',
  'US Eastern Standard Time': 'America/Indianapolis',
  'Turks And Caicos Standard Time': 'America/Grand_Turk',
  'Paraguay Standard Time': 'America/Asuncion',
  'Atlantic Standard Time': 'America/Halifax',
  'Venezuela Standard Time': 'America/Caracas',
  'Central Brazilian Standard Time': 'America/Cuiaba',
  'SA Western Standard Time': 'America/La_Paz',
  'Pacific SA Standard Time': 'America/Santiago',
  'Newfoundland Standard Time': 'America/St_Johns',
  'Tocantins Standard Time': 'America/Araguaina',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'SA Eastern Standard Time': 'America/Cayenne',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'Montevideo Standard Time': 'America/Montevideo',
  'Magallanes Standard Time': 'America/Punta_Arenas',
  'Saint Pierre Standard Time': 'America/Miquelon',
  'Bahia Standard Time': 'America/Bahia',
  'UTC-02': 'Etc/GMT+2',
  'Azores Standard Time': 'Atlantic/Azores',
  'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
  'UTC': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'Sao Tome Standard Time': 'Africa/Sao_Tome',
  'Morocco Standard Time': 'Africa/Casablanca',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'Central European Standard Time': 'Europe/Warsaw',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'Jordan Standard Time': 'Asia/Amman',
  'GTB Standard Time': 'Europe/Bucharest',
  'Middle East Standard Time': 'Asia/Beirut',
  'Egypt Standard Time': 'Africa/Cairo',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'Syria Standard Time': 'Asia/Damascus',
  'West Bank Standard Time': 'Asia/Hebron',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'FLE Standard Time': 'Europe/Kiev',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Kaliningrad Standard Time': 'Europe/Kaliningrad',
  'Sudan Standard Time': 'Africa/Khartoum',
  'Libya Standard Time': 'Africa/Tripoli',
  'Namibia Standard Time': 'Africa/Windhoek',
  'Arabic Standard Time': 'Asia/Baghdad',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Arab Standard Time': 'Asia/Riyadh',
  'Belarus Standard Time': 'Europe/Minsk',
  'Russian Standard Time': 'Europe/Moscow',
  'E. Africa Standard Time': 'Africa/Nairobi',
  'Iran Standard Time': 'Asia/Tehran',
  'Arabian Standard Time': 'Asia/Dubai',
  'Astrakhan Standard Time': 'Europe/Astrakhan',
  'Azerbaijan Standard Time': 'Asia/Baku',
  'Russia Time Zone 3': 'Europe/Samara',
  'Mauritius Standard Time': 'Indian/Mauritius',
  'Saratov Standard Time': 'Europe/Saratov',
  'Georgian Standard Time': 'Asia/Tbilisi',
  'Caucasus Standard Time': 'Asia/Yerevan',
  'Afghanistan Standard Time': 'Asia/Kabul',
  'West Asia Standard Time': 'Asia/Tashkent',
  'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
  'Pakistan Standard Time': 'Asia/Karachi',
  'Qyzylorda Standard Time': 'Asia/Qyzylorda',
  'India Standard Time': 'Asia/Kolkata',
  'Sri Lanka Standard Time': 'Asia/Colombo',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'Central Asia Standard Time': 'Asia/Almaty',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'Omsk Standard Time': 'Asia/Omsk',
  'Myanmar Standard Time': 'Asia/Yangon',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'Altai Standard Time': 'Asia/Barnaul',
  'W. Mongolia Standard Time': 'Asia/Hovd',
  'North Asia Standard Time': 'Asia/Krasnoyarsk',
  'N. Central Asia Standard Time': 'Asia/Novosibirsk',
  'Tomsk Standard Time': 'Asia/Tomsk',
  'China Standard Time': 'Asia/Shanghai',
  'North Asia East Standard Time': 'Asia/Irkutsk',
  'Singapore Standard Time': 'Asia/Singapore',
  'W. Australia Standard Time': 'Australia/Perth',
  'Taipei Standard Time': 'Asia/Taipei',
  'Ulaanbaatar Standard Time': 'Asia/Ulaanbaatar',
  'Aus Central W. Standard Time': 'Australia/Eucla',
  'Transbaikal Standard Time': 'Asia/Chita',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'North Korea Standard Time': 'Asia/Pyongyang',
  'Korea Standard Time': 'Asia/Seoul',
  'Yakutsk Standard Time': 'Asia/Yakutsk',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Central Standard Time': 'Australia/Darwin',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'West Pacific Standard Time': 'Pacific/Port_Moresby',
  'Tasmania Standard Time': 'Australia/Hobart',
  'Vladivostok Standard Time': 'Asia/Vladivostok',
  'Lord Howe Standard Time': 'Australia/Lord_Howe',
  'Bougainville Standard Time': 'Pacific/Bougainville',
  'Russia Time Zone 10': 'Asia/Srednekolymsk',
  'Magadan Standard Time': 'Asia/Magadan',
  'Norfolk Standard Time': 'Pacific/Norfolk',
  'Sakhalin Standard Time': 'Asia/Sakhalin',
  'Central Pacific Standard Time': 'Pacific/Guadalcanal',
  'Russia Time Zone 11': 'Asia/Kamchatka',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'UTC+12': 'Etc/GMT-12',
  'Fiji Standard Time': 'Pacific/Fiji',
  'Chatham Islands Standard Time': 'Pacific/Chatham',
  'UTC+13': 'Etc/GMT-13',
  'Tonga Standard Time': 'Pacific/Tongatapu',
  'Samoa Standard Time': 'Pacific/Apia',
  'Line Islands Standard Time': 'Pacific/Kiritimati'
}

/**
 * Il nome IANA di un fuso di Windows, se lo conosciamo.
 *
 * Il confronto non guarda maiuscole e spazi doppi: gli esportatori li
 * maltrattano, e «W.  Europe  Standard  Time» è lo stesso fuso.
 */
const PER_NOME = new Map(Object.entries(WINDOWS).map(([k, v]) => [chiave(k), v]))

function chiave(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function daWindows(tzid: string): string | null {
  return PER_NOME.get(chiave(tzid)) ?? null
}

/**
 * Il nome nudo dentro un TZID che nudo non è.
 *
 * Lightning e Thunderbird scrivono `/mozilla.org/20050126_1/Europe/Rome`, certi
 * server Zimbra `/Europe/Rome`, e le virgolette le mette Outlook. Il nome vero
 * sono le ultime due etichette separate dalla barra, quando somigliano a un
 * nome IANA.
 */
export function ripulisciTzid(tzid: string): string {
  const nudo = tzid.trim().replace(/^"|"$/g, '')
  if (!nudo.includes('/')) return nudo
  const pezzi = nudo.split('/').filter(Boolean)
  if (pezzi.length >= 2) {
    const ultimi = pezzi.slice(-2).join('/')
    if (fusoValido(ultimi)) return ultimi
    const tre = pezzi.slice(-3).join('/')
    if (fusoValido(tre)) return tre
  }
  return nudo
}

// — il VTIMEZONE del file —

/** Un pezzo di VTIMEZONE: quanto si scarta e da quando. */
type Cambio = {
  /** Minuti dall'UTC dopo il cambio. */
  scarto: number
  /** Minuti dall'UTC prima del cambio: è in quest'ora che è scritto il giorno. */
  scartoPrima: number
  mese: number
  /** Domenica 0. */
  settimana: number
  /** Quale di quelle settimane: 1 è la prima, -1 l'ultima. */
  posizione: number
  ore: number
  minuti: number
  /** Vero quando non c'è nessuna regola: allora questo scarto vale sempre. */
  fisso: boolean
}

/** `+0200` e `-0530` in minuti. */
function scartoDa(v: string): number | null {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(v.trim())
  if (!m) return null
  const segno = m[1] === '-' ? -1 : 1
  return segno * (Number(m[2]) * 60 + Number(m[3]))
}

/** Il giorno del mese che soddisfa «la seconda domenica», «l'ultima domenica». */
function giornoDellaRegola(anno: number, mese: number, settimana: number, posizione: number): number {
  if (posizione > 0) {
    const primo = new Date(Date.UTC(anno, mese - 1, 1)).getUTCDay()
    return 1 + ((settimana - primo + 7) % 7) + (posizione - 1) * 7
  }
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  const giornoUltimo = new Date(Date.UTC(anno, mese - 1, ultimo)).getUTCDay()
  return ultimo - ((giornoUltimo - settimana + 7) % 7) + (posizione + 1) * 7
}

/** L'istante in cui quel cambio scatta, quell'anno. */
function quandoScatta(c: Cambio, anno: number): number {
  const g = giornoDellaRegola(anno, c.mese, c.settimana, c.posizione)
  return Date.UTC(anno, c.mese - 1, g, c.ore, c.minuti) - c.scartoPrima * 60_000
}

const GIORNI_BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/**
 * Un fuso costruito su quello che il file dice di sé.
 *
 * Meno buono della tabella IANA e si vede: conosce una regola sola per parte,
 * quindi vale per gli anni in cui quella regola è vera e non per il 1998. Ma
 * per un invito di questo semestre — che è tutto quello che si legge qui — è
 * esatto, e soprattutto è meglio del niente che c'era prima.
 */
function zonaDaCambi(nome: string, standard: Cambio, legale: Cambio | null): Zona {
  const scartoIn = (t: number): number => {
    if (!legale || standard.fisso || legale.fisso) return standard.scarto
    const anno = new Date(t).getUTCFullYear()
    const inizio = quandoScatta(legale, anno)
    const fine = quandoScatta(standard, anno)
    // sotto l'equatore l'ora legale sta a cavallo del capodanno: l'intervallo
    // si legge al contrario, non è un errore nei dati
    const dentro = inizio < fine ? (t >= inizio && t < fine) : (t >= inizio || t < fine)
    return dentro ? legale.scarto : standard.scarto
  }
  const orologio = (d: Date): Orologio =>
    leggiUTC(new Date(d.getTime() + scartoIn(d.getTime()) * 60_000))
  return {
    nome,
    orologio,
    istante: (a, m, g, o, mi, s) => perTentativi(orologio, a, m, g, o, mi, s)
  }
}

/**
 * I fusi che il file si porta dietro.
 *
 * Si legge dalle righe già ricucite, perché un VTIMEZONE può avere una RRULE
 * lunga abbastanza da essere spezzata come qualunque altra riga.
 */
export function leggiVtimezone(righe: string[]): Map<string, Zona> {
  const fuori = new Map<string, Zona>()
  let dentro = false
  let tzid = ''
  let parte: 'STANDARD' | 'DAYLIGHT' | null = null
  let corrente: Partial<Cambio> & { rrule?: string } = {}
  let standard: Cambio | null = null
  let legale: Cambio | null = null

  const chiudiParte = () => {
    if (!parte) return
    const c = componi(corrente)
    if (c) { if (parte === 'DAYLIGHT') legale = c; else standard = c }
    parte = null
    corrente = {}
  }

  for (const r of righe) {
    const duePunti = r.indexOf(':')
    if (duePunti < 0) continue
    const testa = r.slice(0, duePunti).split(';')[0]!.toUpperCase()
    const valore = r.slice(duePunti + 1).trim()

    if (testa === 'BEGIN' && valore.toUpperCase() === 'VTIMEZONE') {
      dentro = true; tzid = ''; standard = null; legale = null; parte = null; corrente = {}
      continue
    }
    if (!dentro) continue
    if (testa === 'END' && valore.toUpperCase() === 'VTIMEZONE') {
      chiudiParte()
      // senza uno standard non c'è niente da cui partire: meglio nessun fuso
      // che un fuso inventato
      if (tzid && standard) fuori.set(chiave(tzid), zonaDaCambi(tzid, standard, legale))
      dentro = false
      continue
    }
    if (testa === 'BEGIN' && (valore.toUpperCase() === 'STANDARD' || valore.toUpperCase() === 'DAYLIGHT')) {
      chiudiParte()
      parte = valore.toUpperCase() as 'STANDARD' | 'DAYLIGHT'
      corrente = {}
      continue
    }
    if (testa === 'END' && (valore.toUpperCase() === 'STANDARD' || valore.toUpperCase() === 'DAYLIGHT')) {
      chiudiParte()
      continue
    }
    if (testa === 'TZID' && !parte) { tzid = valore; continue }
    if (!parte) continue
    if (testa === 'TZOFFSETTO') { const s = scartoDa(valore); if (s !== null) corrente.scarto = s; continue }
    if (testa === 'TZOFFSETFROM') { const s = scartoDa(valore); if (s !== null) corrente.scartoPrima = s; continue }
    if (testa === 'RRULE') { corrente.rrule = valore.toUpperCase(); continue }
    if (testa === 'DTSTART') {
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(valore)
      if (m) { corrente.mese = Number(m[2]); corrente.ore = Number(m[4]); corrente.minuti = Number(m[5]) }
    }
  }
  return fuori
}

function componi(c: Partial<Cambio> & { rrule?: string }): Cambio | null {
  if (c.scarto === undefined) return null
  const scartoPrima = c.scartoPrima ?? c.scarto
  const p: Record<string, string> = {}
  for (const pezzo of (c.rrule ?? '').split(';')) {
    const i = pezzo.indexOf('=')
    if (i > 0) p[pezzo.slice(0, i)] = pezzo.slice(i + 1)
  }
  const byday = /^([+-]?\d)?([A-Z]{2})$/.exec((p.BYDAY ?? '').split(',')[0] ?? '')
  const mese = Number(p.BYMONTH) || c.mese || 1
  const settimana = byday ? GIORNI_BYDAY.indexOf(byday[2]!) : -1
  // senza una regola leggibile lo scarto vale tutto l'anno: è il caso dei fusi
  // che l'ora legale non ce l'hanno, ed è anche il ripiego onesto per una
  // regola scritta in un modo che non sappiamo leggere
  const fisso = !p.FREQ || settimana < 0
  return {
    scarto: c.scarto,
    scartoPrima,
    mese,
    settimana: settimana < 0 ? 0 : settimana,
    posizione: byday && byday[1] ? Number(byday[1]) : 1,
    ore: c.ore ?? 2,
    minuti: c.minuti ?? 0,
    fisso
  }
}

// — la scelta —

/**
 * Il fuso di una riga, nell'ordine in cui conviene cercarlo.
 *
 * Prima IANA, che è l'unica fonte che si aggiorna da sé. Poi la tabella di
 * Windows, che porta a IANA. Poi il file. `null` quando non si sa: chi chiama
 * decide cosa farne, e la decisione giusta non è «allora è UTC».
 */
export function zonaDi(tzid: string | undefined, dalFile?: Map<string, Zona>): Zona | null {
  if (!tzid) return null
  const nudo = ripulisciTzid(tzid)
  if (fusoValido(nudo)) return zonaIana(nudo)
  const w = daWindows(nudo)
  if (w && fusoValido(w)) return zonaIana(w)
  return dalFile?.get(chiave(nudo)) ?? dalFile?.get(chiave(tzid)) ?? null
}
