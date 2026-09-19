import React,{useState} from 'react';
import {sheetId} from './sheets.js';

export function SheetForm({currentSheet='',onSave}){
 const [value,setValue]=useState(currentSheet),[error,setError]=useState('');
 function submit(event){
  event.preventDefault();setError('');
  try{onSave(sheetId(value))}catch(e){setError(e.message)}
 }
 return <form className="sheet-form" onSubmit={submit}>
  <label className="field">My Google Sheet URL or ID<input required value={value} onChange={e=>setValue(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" spellCheck={false}/></label>
  <p>Saved for your Google account on this browser only. On your phone or laptop, paste the same sheet URL once to use the same data source. Device preferences and local edits do not sync.</p>
  <p>Use a sheet this Google account can read, with month tabs named January through December. Life Tracker never writes to your sheet.</p>
  {error&&<p role="alert" className="alert">{error}</p>}
  <button className="primary" type="submit">{currentSheet?'Save my sheet':'Connect your sheet'}</button>
 </form>;
}

