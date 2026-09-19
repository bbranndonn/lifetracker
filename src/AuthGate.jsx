import React,{useEffect,useState} from 'react';
import {BarChart3,Leaf,Loader2} from 'lucide-react';
import App from './App.jsx';
import {createAuth,readConfig,SESSION_KEY} from './auth.js';
import {loadIdentity} from './sheets.js';
const config=readConfig(import.meta.env);
const auth=createAuth(config);
export default function AuthGate(){
 const [session,setSession]=useState(()=>auth.session());
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{
  const check=(message='')=>{setSession(auth.session());setError(message)};
  const unsubscribe=auth.subscribe(check);
  const storage=e=>{if(e.key===SESSION_KEY||e.key===null)auth.syncStorage()};
  const focus=()=>{if(session&&!auth.session())auth.signOut('Your session expired. Sign in again.')};
  window.addEventListener('storage',storage);window.addEventListener('focus',focus);
  const timer=setInterval(focus,30000);
  return()=>{unsubscribe();clearInterval(timer);window.removeEventListener('storage',storage);window.removeEventListener('focus',focus)};
 },[session]);
 useEffect(()=>{loadIdentity().then(()=>setReady(true)).catch(e=>setError(e.message))},[]);
 useEffect(()=>{if(!session)document.documentElement.dataset.theme='light'},[session]);
 async function signIn(){setBusy(true);setError('');try{if(!ready){await loadIdentity();setReady(true);setError('Google is ready. Choose Sign in with Google again.');return}await auth.getToken(true)}catch(e){setError(e.message)}finally{setBusy(false)}}
 if(session)return <App key={session.email} session={session} authClient={auth} connection={config}/>;
 return <main className="landing"><section className="landing-card"><div className="brand"><span className="brand-mark"><BarChart3 size={24}/></span>life<span className="brand-light">tracker</span><span className="brand-period">.</span></div><Leaf className="landing-leaf" size={38}/><div className="eyebrow">A LITTLE MORE INTENTIONAL</div><h1>Your time.<br/>Your priorities.</h1><p>A quiet space to reflect on your days and make room for what matters.</p><button className="primary" disabled={busy||!!config.errors.length} onClick={signIn}>{busy&&<Loader2 size={17} className="spin"/>}{busy?'Signing in…':'Sign in with Google'}</button><small>Private access for invited accounts.</small>{error&&<p role="alert" className="alert">{error}</p>}{!!config.errors.length&&<div role="alert" className="notice"><strong>Connection setup needed</strong>{import.meta.env.DEV?<><p>Add these values to .env.local, then restart Vite:</p><ul>{config.errors.map(message=><li key={message}>{message}</li>)}</ul></>:<p>The app owner needs to configure Google sign-in before this space is available.</p>}</div>}</section></main>;
}
