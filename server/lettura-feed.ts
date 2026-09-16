/** A manual attention scan must refresh its evidence before asking a model.
 * Shares the source-sync lock so it cannot race an existing import. */
export class ErroreLetturaFeed extends Error {
  status:number
  fonti:{fonte:string;motivo:'non-disponibile'|'incompleta'}[]
  constructor(message:string,status:number,fonti:ErroreLetturaFeed['fonti']=[]) {super(message);this.status=status;this.fonti=fonti}
  perLingua(lingua:'it'|'en'):string {
    const en=lingua==='en'
    if(this.status===409)return en?'A source read is already running. Wait for it to finish and try again.':this.message
    const base=en?'I could not refresh every source.':'Non ho potuto aggiornare tutte le fonti.'
    return base+' '+this.fonti.map(e=>e.fonte+': '+(e.motivo==='incompleta'
      ?(en?'The source read did not complete.':'La lettura della fonte non è stata completata.')
      :(en?'The source is currently unavailable.':'La fonte non ha risposto.'))).join(' ')
  }
}
type Evento={fase?:string;stato?:string;errore?:string;falliti?:number|unknown[];parziali?:number;illeggibili?:number|unknown[];cartelleFallite?:unknown[];interrotto?:boolean;troncato?:boolean}
const nonVuoto=(value:unknown)=>typeof value==='number'?value>0:Array.isArray(value)&&value.length>0
export async function generaDaFontiFresche<T>(conto:string,lock:Set<string>,
  leggi:(avvisa:(evento:unknown)=>void)=>Promise<unknown>,genera:()=>Promise<T>):Promise<T> {
  if(lock.has(conto))throw new ErroreLetturaFeed('Una lettura delle fonti è già in corso. Attendi che finisca e riprova.',409)
  lock.add(conto)
  try {
    const errors=new Map<string,'non-disponibile'|'incompleta'>()
    await leggi(raw=>{
      const e=raw as Evento
      if(!e || typeof e.fase!=='string')return
      // Connector diagnostics can contain account data or filesystem paths.
      // Keep only a bounded source identifier and an honest failure category.
      const source=/^[a-z][a-z0-9_-]{0,40}$/i.test(e.fase)?e.fase:'source'
      if(e.stato==='guaio')errors.set(source,'non-disponibile')
      // Bounded healthy reads can be troncato without a provider failure.
      // Failed channels, incomplete page bodies and unreadable local items
      // must still prevent an all-clear based on stale indexed evidence.
      else if(nonVuoto(e.falliti)||nonVuoto(e.parziali)||nonVuoto(e.illeggibili)||nonVuoto(e.cartelleFallite)||e.interrotto)
        errors.set(source,'incompleta')
    })
    if(errors.size) {
      const fonti=[...errors].slice(0,8).map(([fonte,motivo])=>({fonte,motivo}))
      throw new ErroreLetturaFeed('Non ho potuto aggiornare tutte le fonti. '+fonti.map(e=>e.fonte).join(', '),502,fonti)
    }
    return await genera()
  } finally {lock.delete(conto)}
}
