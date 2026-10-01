import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/service.js';
import {hash} from '../lib/core.js';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const pinHash=hash('123456');
async function call(body,{admin=false,member=true}={}){
const original=global.fetch,env={...process.env};const writes=[];
process.env.SUPABASE_URL='https://example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';process.env.APP_SECRET='a'.repeat(32);
global.fetch=async(url,opts={})=>{let data=[];
if(url.includes('check_rate'))data=true;
else if(url.includes('/auth/v1/user'))data={id:'advisor-id'};
else if(url.includes('admins?'))data=member?[{user_id:'advisor-id'}]:[];
else if(url.includes('requests?'))data=url.includes('phone=eq.9999999')?[]:[{id,pin_hash:pinHash}];
else if(url.endsWith('/messages')&&opts.method==='POST'){writes.push(JSON.parse(opts.body));data=writes;}
else if(url.includes('messages?'))data=[{id:'m',sender:'advisor',body:'Bonjour',created_at:'2026-10-01'}];
else if(url.endsWith('/requests')&&opts.method==='POST'){writes.push(JSON.parse(opts.body));data=writes;}
return {ok:true,status:200,json:async()=>data};};
const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;},code:200};
try{await handler({method:'POST',headers:admin?{authorization:'Bearer token'}:{},body},res);return {...res,writes};}finally{global.fetch=original;process.env=env;}}
test('un client peut lire et écrire dans son dossier',async()=>{const base={id,phone:'5551234567',pin:'123456'};assert.equal((await call({...base,action:'messages'})).body.messages[0].body,'Bonjour');const r=await call({...base,action:'send_message',message:'Mon message'});assert.equal(r.code,200);assert.equal(r.writes[0].sender,'client');});
test('mauvais code ou mauvais téléphone : lecture et écriture refusées',async()=>{for(const action of ['messages','send_message'])for(const values of [{phone:'5551234567',pin:'000000'},{phone:'9999999',pin:'123456'}]){const r=await call({id,action,message:'Test',...values});assert.equal(r.code,403);assert.equal(r.writes.length,0);}});
test('un client ne peut pas usurper un conseiller',async()=>{const r=await call({id,action:'send_message',audience:'advisor',message:'Test'});assert.equal(r.code,401);assert.equal(r.writes.length,0);});
test('seul un administrateur autorisé peut répondre',async()=>{const b={id,action:'send_message',audience:'advisor',message:'Bonjour'};assert.equal((await call(b,{admin:true,member:false})).code,403);const r=await call(b,{admin:true});assert.equal(r.writes[0].sender,'advisor');assert.equal(r.writes[0].advisor_id,'advisor-id');});
test('refuse les messages vides et trop longs',async()=>{for(const message of ['   ','a'.repeat(4001)])assert.equal((await call({id,action:'send_message',phone:'5551234567',pin:'123456',message})).code,400);});
test('RIB obligatoire et conservé à la création',async()=>{const b={action:'create',phone:'5551234567',pin:'123456',name:'Test Client',service:'Courtage en crédit',details:'Un projet de financement',amount:5000};assert.equal((await call(b)).code,400);const r=await call({...b,rib:'LS-123456'});assert.equal(r.code,200);assert.equal(r.writes[0].rib,'LS-123456');});
