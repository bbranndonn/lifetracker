import React,{useEffect,useState} from 'react';
import {Leaf} from 'lucide-react';
import App from './App.jsx';
import {SheetForm} from './SheetForm.jsx';
import {readStored,writeStored,sheetId} from './sheets.js';

export const sheetPreferenceKey=email=>`life-tracker-sheet-v1:${email.trim().toLowerCase()}`;
export function preferredSheet(email,fallback=''){
 const value=readStored(sheetPreferenceKey(email),fallback);
 try{return sheetId(value)}catch{return ''}
}

export default function SheetConnection({session,authClient,connection}){
 const [sheet,setSheet]=useState(()=>preferredSheet(session.email,connection.sheet));
 const preferenceKey=sheetPreferenceKey(session.email);
 useEffect(()=>{
  const sync=event=>{if(event.key===preferenceKey||event.key===null)setSheet(preferredSheet(session.email,connection.sheet))};
  window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[preferenceKey,session.email,connection.sheet]);
 function saveSheet(value){
  if(!writeStored(preferenceKey,value))throw new Error('Could not save your sheet. Enable browser storage and try again.');
  setSheet(value);
 }
 // Remount on a source change so filters, dialogs and in-flight syncs cannot
 // carry the previous sheet's state into the new one.
 if(sheet)return <App key={sheet} session={session} authClient={authClient} connection={{...connection,sheet}} onSheetChange={saveSheet}/>;
 return <main className="landing"><section className="landing-card sheet-setup"><Leaf size={34}/><div className="eyebrow">YOUR PERSONAL SPACE</div><h1>Connect your sheet</h1><p>Bring your own daily log into focus.</p><small>{session.email}</small><SheetForm onSave={saveSheet}/><button onClick={()=>authClient.signOut()}>Sign out</button></section></main>;
}
