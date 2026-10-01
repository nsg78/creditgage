import {scryptSync,randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
export const statuses=['Reçue','En étude','Informations requises','Proposition envoyée','Active','Soldée','Refusée','Annulée'];
export function phone(v){const p=String(v||'').replace(/[^0-9]/g,'');if(!/^\d{7,15}$/.test(p))throw Error('Téléphone invalide (7 à 15 chiffres).');return p;}
export function text(v,max=2000){return String(v||'').trim().slice(0,max);}
export function money(v){const n=Number(v);if(!Number.isFinite(n)||n<0||n>100000000)throw Error('Montant invalide.');return Math.round(n*100)/100;}
export function hash(pin,salt=randomBytes(16).toString('hex')){return salt+':'+scryptSync(pin,salt,32).toString('hex');}
export function verify(pin,value){const [salt,h]=value.split(':');return timingSafeEqual(Buffer.from(h,'hex'),scryptSync(pin,salt,32));}
export function key(v){return createHmac('sha256',process.env.APP_SECRET).update(v).digest('hex');}
export async function db(path,{method='GET',body}={}){const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{method,headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok){console.error('Database operation failed',r.status);throw Error('Opération indisponible. Réessayez ou contactez l’agence.');}return r.status===204?null:r.json();}
