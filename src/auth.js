import {authorize,loadIdentity,sheetId} from './sheets.js';
export const SESSION_KEY='life-tracker-session-v1';
const DAY=86400000;
const browserStorage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)};
const normalize=email=>typeof email==='string'?email.trim().toLowerCase():'';
export function readConfig(env={}) {
 const clientId=(env.VITE_GOOGLE_CLIENT_ID||'').trim();
 const allowedEmails=[...new Set((env.VITE_ALLOWED_EMAILS||'').split(',').map(normalize).filter(Boolean))];
 const days=Number(env.VITE_SESSION_DAYS||7);
 const errors=[];let sheet='';
 if(!clientId.endsWith('.apps.googleusercontent.com'))errors.push('Set VITE_GOOGLE_CLIENT_ID to your OAuth web client ID.');
 // A missing or invalid optional default must not prevent Google sign-in.
 try{sheet=sheetId(env.VITE_SHEET_ID||'')}catch{}
 if(!allowedEmails.length||allowedEmails.some(email=>! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))errors.push('Set VITE_ALLOWED_EMAILS to comma-separated Google email addresses.');
 if(!Number.isFinite(days)||days<=0)errors.push('VITE_SESSION_DAYS must be a positive number.');
 return {clientId,sheet,allowedEmails,sessionDays:days,errors};
}
export function validSession(value,config,now=Date.now()) {
 return !config.errors.length&&value&&typeof value.email==='string'&&config.allowedEmails.includes(normalize(value.email))&&Number.isFinite(value.expiresAt)&&value.expiresAt>now&&value.expiresAt<=now+config.sessionDays*DAY?{email:normalize(value.email),expiresAt:value.expiresAt}:null;
}
export class IdentityError extends Error {}
export async function verifyIdentity(token,config,expectedEmail,fetcher=fetch) {
 const response=await fetcher('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
 if(!response.ok){if(response.status===401||response.status===403)throw new IdentityError('No access. Google could not verify this account.');throw new Error('Could not verify Google identity. Please retry.');}
 const identity=await response.json(),email=normalize(identity.email);
 if(identity.email_verified!==true||!config.allowedEmails.includes(email)||(expectedEmail&&email!==expectedEmail))throw new IdentityError('No access. Sign in with an allowed Google account matching your session.');
 return email;
}
export function createAuth(config,{storage=browserStorage,request=authorize,prepare=loadIdentity,verify=verifyIdentity,now=Date.now}={}) {
 let token=null,pending=null,epoch=0;
 const listeners=new Set();
 const emit=(message='')=>listeners.forEach(fn=>fn(message));
 function session(){try{return validSession(JSON.parse(storage.getItem(SESSION_KEY)),config,now())}catch{return null}}
 function signOut(message=''){epoch++;token=null;pending=null;try{storage.removeItem(SESSION_KEY)}catch{}emit(message)}
 async function acquire(interactive=false){
  const current=session();
  if(!interactive&&!current)throw new Error('Sign in with Google to continue.');
  if(config.errors.length)throw new Error('Finish connection setup before signing in.');
  if(!interactive&&token&&token.expires>now())return token;
  if(pending)return pending;
  const started=epoch;
  const operation=(async()=>{
   try{
    await prepare();
    const next=await request(config.clientId,{prompt:interactive?'select_account':'',loginHint:current?.email});
    const email=await verify(next.token,config,current?.email);
    if(started!==epoch)throw new Error('Sign-in was cancelled. Please retry.');
    if(!current){const value={email,expiresAt:now()+config.sessionDays*DAY};try{storage.setItem(SESSION_KEY,JSON.stringify(value))}catch{throw new Error('Browser storage is unavailable. Enable local storage to stay signed in.')}}
    else if(!session())throw new IdentityError('Your session expired. Sign in again.');
    token=next;emit();return token;
   }catch(error){if(started===epoch){token=null;if(error instanceof IdentityError)signOut(error.message);}throw error}
  })();
  pending=operation;
  try{return await operation}finally{if(pending===operation)pending=null}
 }
 return {session,signOut,getToken:acquire,clearToken(){token=null},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},syncStorage(){epoch++;token=null;pending=null;emit()}};
}
