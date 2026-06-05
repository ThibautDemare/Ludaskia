/* ============================================================
   Utilitaires : aléatoire, déduplication, échappement, temps
   ============================================================ */
export const rnd=(min,max)=>Math.floor(Math.random()*(max-min+1))+min;
export const choice=a=>a[Math.floor(Math.random()*a.length)];
export function sample(arr,n){const c=[...arr];for(let i=c.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[c[i],c[j]]=[c[j],c[i]];}return c.slice(0,n);}
export const commKey=op=>{const m=op.match(/(\d+)\s*([+×])\s*(\d+)/);if(m){const a=+m[1],s=m[2],b=+m[3];return `${s}${Math.min(a,b)}-${Math.max(a,b)}`;}return op;};
export function uniqueComm(gen,n,mt=10000){const k=[],o=[];let t=0;while(o.length<n&&t<mt){const it=gen();const key=commKey(it.text);if(!k.includes(key)){k.push(key);o.push(it);}t++;}return o;}
export function uniqueExact(gen,n,mt=10000){const k=[],o=[];let t=0;while(o.length<n&&t<mt){const it=gen();if(!k.includes(it.text)){k.push(it.text);o.push(it);}t++;}return o;}
export const escapeHTML=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');

/* Formatage mm:ss d'une durée en millisecondes */
export function fmt(ms){
  const s=Math.floor(ms/1000), m=Math.floor(s/60), r=s%60;
  return String(m).padStart(2,'0')+':'+String(r).padStart(2,'0');
}
