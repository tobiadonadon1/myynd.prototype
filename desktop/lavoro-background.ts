/** A renewable work lease. A crashed server cannot keep the Mac awake forever. */
type Power = {start(type:'prevent-app-suspension'):number;stop(id:number):void}
export function workPowerLease(power: Power, now = Date.now, ttl = 45_000) {
 let id:number|undefined, expires=0
 const release=() => { if(id!==undefined){power.stop(id);id=undefined} expires=0 }
 return {
  message(value: unknown) {
   if (!value || typeof value!=='object') return
   const x=value as {tipo?:unknown;attivo?:unknown}
   if(x.tipo!=='lavoro-background' || typeof x.attivo!=='boolean')return
   if(!x.attivo){release();return}
   expires=now()+ttl
   if(id===undefined) id=power.start('prevent-app-suspension')
  },
  tick(){if(id!==undefined && now()>=expires)release()},
  release,
  active:()=>id!==undefined
 }
}
