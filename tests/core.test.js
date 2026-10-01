import test from 'node:test';
import assert from 'node:assert/strict';
import {phone,money,hash,verify} from '../lib/core.js';
import handler from '../api/service.js';
test('normalise les téléphones RP et refuse les valeurs invalides',()=>{assert.equal(phone('(555) 463-266-28'),'55546326628');assert.throws(()=>phone('123'));});
test('refuse les montants négatifs, infinis et hors limite',()=>{for(const n of [-1,Infinity,'abc',100000001])assert.throws(()=>money(n));assert.equal(money('1200.25'),1200.25);});
test('les codes sont salés et un mauvais code ne donne pas accès',()=>{const a=hash('123456'),b=hash('123456');assert.notEqual(a,b);assert(verify('123456',a));assert(!verify('654321',a));});
test('une installation sans configuration ne simule pas une sauvegarde',async()=>{const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await handler({method:'POST'},res);assert.equal(res.code,503);assert(res.body.error);});
