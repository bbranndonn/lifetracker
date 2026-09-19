import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readConfig,validSession,verifyIdentity,IdentityError,createAuth,SESSION_KEY} from './auth.js';
const config=readConfig({VITE_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',VITE_SHEET_ID:'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx/edit',VITE_ALLOWED_EMAILS:' ONE@example.com, two@example.com,one@example.com '});
const DAY=86400000;
function fixture(overrides={}){
 const values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 let time=1000000,calls=[];
 const auth=createAuth(config,{storage,now:()=>time,prepare:async()=>{},request:async(id,options)=>{calls.push(options);return {token:'memory-only',expires:time+3600000}},verify:async()=>config.allowedEmails[0],...overrides});
 return {auth,storage,values,calls,advance:ms=>time+=ms};
}
test('env normalization, two emails, default duration and fail-closed setup',()=>{
 assert.deepEqual(config.allowedEmails,['one@example.com','two@example.com']);assert.equal(config.sheet,'abcdefghijklmnopqrstuvwx');assert.equal(config.sessionDays,7);assert.deepEqual(config.errors,[]);
 assert.equal(readConfig().errors.length,2);assert.ok(readConfig({VITE_SESSION_DAYS:'NaN'}).errors.some(e=>e.includes('positive')));
});
test('missing, malformed, denied, expired and excessive sessions are rejected',()=>{
 for(const value of [null,{}, {email:'outsider@example.com',expiresAt:2000},{email:'one@example.com',expiresAt:999},{email:'one@example.com',expiresAt:'2000'},{email:'one@example.com',expiresAt:1000+8*DAY}])assert.equal(validSession(value,config,1000),null);
 assert.equal(validSession({email:'TWO@example.com',expiresAt:2000},config,1000).email,'two@example.com');
});
test('Google verified email is required and renewal must match session identity',async()=>{
 const response=body=>async()=>({ok:true,json:async()=>body});
 assert.equal(await verifyIdentity('token',config,null,response({email:'TWO@example.com',email_verified:true})),'two@example.com');
 for(const body of [{email:'outsider@example.com',email_verified:true},{email:'one@example.com',email_verified:false},{}])await assert.rejects(verifyIdentity('token',config,null,response(body)),IdentityError);
 await assert.rejects(verifyIdentity('token',config,'one@example.com',response({email:'two@example.com',email_verified:true})),IdentityError);
});
test('seven-day session survives reload; token never persists; expires at boundary',async()=>{
 const f=fixture();await f.auth.getToken(true);assert.deepEqual(Object.keys(JSON.parse(f.storage.getItem(SESSION_KEY))),['email','expiresAt']);assert.ok(!JSON.stringify([...f.values]).includes('memory-only'));
 const reload=createAuth(config,{storage:f.storage,now:()=>1000000+6*DAY});assert.equal(reload.session().email,'one@example.com');
 f.advance(7*DAY);assert.equal(f.auth.session(),null);await assert.rejects(f.auth.getToken(),/Sign in/);
});
test('token reuse, silent renewal, failure retaining session, interactive recovery',async()=>{
 const f=fixture();await f.auth.getToken(true);await f.auth.getToken();assert.equal(f.calls.length,1);f.advance(3600000);await f.auth.getToken();assert.equal(f.calls[1].prompt,'');assert.equal(f.calls[1].loginHint,'one@example.com');
 const failed=createAuth(config,{storage:f.storage,now:()=>4600000,prepare:async()=>{},request:async()=>{throw new Error('popup blocked')}});
 await assert.rejects(failed.getToken(),/popup blocked/);assert.ok(failed.session());
 await f.auth.getToken(true);assert.equal(f.calls[2].prompt,'select_account');
});
test('identity denial creates no session and clears existing session',async()=>{
 const f=fixture({verify:async()=>{throw new IdentityError('No access')}});await assert.rejects(f.auth.getToken(true),/No access/);assert.equal(f.auth.session(),null);
 f.storage.setItem(SESSION_KEY,JSON.stringify({email:'one@example.com',expiresAt:2000000}));await assert.rejects(f.auth.getToken(),/No access/);assert.equal(f.storage.getItem(SESSION_KEY),null);
});
test('sign out cancels in-flight authentication and clears memory token',async()=>{
 let finish;const f=fixture({request:()=>new Promise(resolve=>{finish=resolve})});const pending=f.auth.getToken(true);await Promise.resolve();f.auth.signOut();finish({token:'late',expires:2000000});await assert.rejects(pending,/cancelled/);assert.equal(f.auth.session(),null);
 const g=fixture();await g.auth.getToken(true);g.auth.signOut();await assert.rejects(g.auth.getToken(),/Sign in/);
});
test('concurrent syncs share one request and cross-tab signout invalidates renewal',async()=>{
 let finish;const f=fixture({request:()=>new Promise(resolve=>{finish=resolve})});
 f.storage.setItem(SESSION_KEY,JSON.stringify({email:'one@example.com',expiresAt:2000000}));
 const a=f.auth.getToken(),b=f.auth.getToken();await Promise.resolve();f.storage.removeItem(SESSION_KEY);f.auth.syncStorage();finish({token:'late',expires:2000000});await assert.rejects(a,/cancelled/);await assert.rejects(b,/cancelled/);
});

test('sheet default is optional and never blocks identity configuration',()=>{
 const env={VITE_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',VITE_ALLOWED_EMAILS:'one@example.com'};
 for(const sheet of ['',undefined,'invalid']){const value=readConfig({...env,VITE_SHEET_ID:sheet});assert.deepEqual(value.errors,[]);assert.equal(value.sheet,'')}
});
