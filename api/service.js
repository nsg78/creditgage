import {randomUUID} from 'node:crypto';
import {statuses,phone,text,money,hash,verify,key,db} from '../lib/core.js';
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');
if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée.'});
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.APP_SECRET?.length<32)return res.status(503).json({error:'Le service sera disponible après la configuration de l’agence.'});
try{
const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
if(JSON.stringify(b).length>20000)throw Error('Demande trop volumineuse.');
const action=b.action;
if(!['create','track','login','list','update','payment','messages','send_message'].includes(action))throw Error('Action inconnue.');
const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0];
const allowed=await db('rpc/check_rate',{method:'POST',body:{p_key:key(ip+':'+action),p_limit:['login','track'].includes(action)?20:action==='messages'?120:60}});
if(!allowed)return res.status(429).json({error:'Trop de tentatives. Réessayez dans 15 minutes.'});
if(action==='login'){
const r=await fetch(process.env.SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:text(b.email,200),password:String(b.password||'')})});
const data=await r.json();if(!r.ok)throw Error('Connexion refusée. Vérifiez vos identifiants.');
const admins=await db('admins?user_id=eq.'+encodeURIComponent(data.user.id));if(!admins.length)throw Error('Accès administrateur refusé.');
return res.json({token:data.access_token});}
if(action==='messages'||action==='send_message'){
if(!/^[0-9a-f-]{36}$/.test(b.id||''))throw Error('Dossier invalide.');
let advisorId=null;
if(b.audience==='advisor'){
const token=req.headers.authorization?.replace(/^Bearer /,'');
if(!token)return res.status(401).json({error:'Connectez-vous à l’espace équipe.'});
const auth=await fetch(process.env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+token}});
if(!auth.ok)return res.status(401).json({error:'Session expirée. Reconnectez-vous.'});
const user=await auth.json();
if(!(await db('admins?user_id=eq.'+encodeURIComponent(user.id))).length)return res.status(403).json({error:'Accès refusé.'});
advisorId=user.id;
if(!(await db('requests?select=id&id=eq.'+b.id)).length)throw Error('Dossier introuvable.');
}else{
const p=phone(b.phone),pin=String(b.pin||'');
if(!/^\d{6,12}$/.test(pin))throw Error('Identifiants invalides.');
// Le dossier demandé doit appartenir à ce téléphone ET à ce code.
const rows=await db('requests?select=id,pin_hash&id=eq.'+b.id+'&phone=eq.'+p);
if(!rows.length||!verify(pin,rows[0].pin_hash))return res.status(403).json({error:'Accès à la conversation refusé.'});
}
if(action==='send_message'){
const body=String(b.message||'').trim();
if(!body||body.length>4000)throw Error('Votre message doit contenir entre 1 et 4 000 caractères.');
await db('messages',{method:'POST',body:{id:randomUUID(),request_id:b.id,sender:advisorId?'advisor':'client',advisor_id:advisorId,body}});
return res.json({ok:true});
}
// Derniers messages, restitués dans l’ordre chronologique.
const messages=await db('messages?select=id,sender,body,created_at&request_id=eq.'+b.id+'&order=created_at.desc,id.desc&limit=200');
return res.json({messages:messages.reverse()});
}
if(action==='create'||action==='track'){
const p=phone(b.phone),pin=String(b.pin||'');if(!/^\d{6,12}$/.test(pin))throw Error('Choisissez un code de 6 à 12 chiffres.');
if(action==='track'){
const rows=await db('requests?phone=eq.'+p+'&order=created_at.desc');
const found=rows.filter(r=>verify(pin,r.pin_hash)).map(({pin_hash,internal_notes,...r})=>r);
if(!found.length)throw Error('Aucun dossier trouvé avec ce téléphone et ce code.');
return res.json({requests:found});}
if(b.website)throw Error('Demande refusée.');
const name=text(b.name,100),service=text(b.service,60),details=text(b.details),collateral=text(b.collateral,500);
if(name.length<3||details.length<10||!['Prêt sur gage','Courtage en crédit','Accompagnement'].includes(service))throw Error('Complétez votre nom, le service et une description de 10 caractères minimum.');
if(service==='Prêt sur gage'&&!collateral)throw Error('Décrivez le bien proposé en garantie.');
const amount=money(b.amount);if(amount<1)throw Error('Indiquez un montant supérieur à zéro.');
const rib=String(b.rib||'').trim();if(!rib||rib.length>100)throw Error('Renseignez votre RIB (100 caractères maximum).');
const row={id:randomUUID(),rib,name,phone:p,pin_hash:hash(pin),service,amount,details,collateral,availability:text(b.availability,200)};
const created=await db('requests',{method:'POST',body:row});return res.json({id:created[0].id});}
const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)return res.status(401).json({error:'Reconnectez-vous à l’administration.'});
const auth=await fetch(process.env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+token}});
if(!auth.ok)return res.status(401).json({error:'Session expirée. Reconnectez-vous.'});
const user=await auth.json();const admins=await db('admins?user_id=eq.'+encodeURIComponent(user.id));if(!admins.length)return res.status(403).json({error:'Accès refusé.'});
if(action==='list'){const rows=[];let offset=0;while(true){const batch=await db('requests?select=*&order=created_at.desc,id.asc&limit=1000&offset='+offset);rows.push(...batch);if(batch.length<1000)break;offset+=1000;}return res.json({requests:rows.map(({pin_hash,...r})=>r)});}
if(!/^[0-9a-f-]{36}$/.test(b.id||''))throw Error('Dossier invalide.');
if(action==='payment'){
const amount=money(b.amount);if(amount<=0)throw Error('Versement invalide.');
await db('rpc/add_payment',{method:'POST',body:{p_id:b.id,p_amount:amount,p_actor:user.id,p_key:text(b.payment_key,100)}});return res.json({ok:true});}
if(!statuses.includes(b.status))throw Error('Statut invalide.');
if(b.due_date&&!/^\d{4}-\d{2}-\d{2}$/.test(b.due_date))throw Error('Date invalide.');
const update={status:b.status,offer:money(b.offer),fees:money(b.fees),due_date:b.due_date||null,public_message:text(b.public_message),internal_notes:text(b.internal_notes,5000)};
await db('rpc/update_request',{method:'POST',body:{p_id:b.id,p_version:b.version,p_data:update,p_actor:user.id}});return res.json({ok:true});
}catch(e){return res.status(400).json({error:e.message||'Une erreur est survenue.'});}}
