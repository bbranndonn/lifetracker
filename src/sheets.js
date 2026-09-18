import {parseRows} from './model.js';
export const SCOPE='https://www.googleapis.com/auth/spreadsheets.readonly';
let loading;
export function loadIdentity() {
 if(window.google?.accounts?.oauth2)return Promise.resolve();
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;const timer=setTimeout(()=>{script.remove();loading=null;reject(new Error('Google sign-in timed out. Check your connection and retry.'))},15000);script.onload=()=>{clearTimeout(timer);resolve()};script.onerror=()=>{clearTimeout(timer);script.remove();loading=null;reject(new Error('Google sign-in could not load. Check your connection or content blocker.'))};document.head.appendChild(script)});return loading;
}
export function authorize(clientId) {
 if(!clientId.trim().endsWith('.apps.googleusercontent.com'))return Promise.reject(new Error('Enter a valid Google OAuth web client ID in Settings.'));
 return new Promise((resolve,reject)=>{
 const client=window.google.accounts.oauth2.initTokenClient({client_id:clientId.trim(),scope:SCOPE,callback:r=>r.error?reject(new Error(`Google authorization failed: ${r.error_description||r.error}`)):!window.google.accounts.oauth2.hasGrantedAllScopes(r,SCOPE)?reject(new Error('Sheets permission was not granted. Reconnect and allow read access.')):resolve({token:r.access_token,expires:Date.now()+Number(r.expires_in)*1000-30000}),error_callback:e=>reject(new Error(e.type==='popup_closed'?'Sign-in was closed. Choose Connect Google to try again.':'Google sign-in could not open. Allow popups for this site and retry.'))});client.requestAccessToken({prompt:''});
 });
}
export function sheetId(input) {const trimmed=input.trim();const m=trimmed.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);if(m)return m[1];if(/^[\w-]{20,}$/.test(trimmed))return trimmed;throw new Error('Enter a Google Sheets URL or spreadsheet ID in Settings.')}
export function sourceKey(config){return `${sheetId(config.sheet)}:month-tabs-v1`}
export async function fetchSheet(config,auth,fetcher=fetch) {
 if(!auth?.token||Date.now()>=auth.expires)throw new Error('Google access expired. Reconnect Google to refresh. Your cached data is still available.');
 const id=sheetId(config.sheet);if(!config.tab.trim())throw new Error('Enter the sheet tab name in Settings.');
 const range=`'${config.tab.trim().replaceAll("'","''")}'!A:ZZ`;
 return (await requestGoogle(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,auth,fetcher)).values||[];
}
async function requestGoogle(url,auth,fetcher) {
 let response;
 try {response=await fetcher(url,{headers:{Authorization:`Bearer ${auth.token}`},signal:AbortSignal.timeout(20000)})}catch{throw new Error('Could not reach Google Sheets. Check your connection and retry. Cached data has been retained.')}
 if(!response.ok){const messages={401:'Google access expired. Reconnect Google.',403:'Access denied. Enable the Sheets API and make sure this Google account can open the sheet.',404:'Spreadsheet not found. Check the URL and account.',400:'Invalid sheet range. A tab may have changed; retry to discover the latest tab names.',429:'Google is rate limiting requests. Please retry in a few minutes.'};throw new Error(messages[response.status]||`Google Sheets returned ${response.status}. Retry shortly.`)}
 return response.json();
}
export const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
export function isMonthTab(title) {return typeof title==='string'&&MONTH_NAMES.some(month=>month.toLowerCase()===title.trim().toLowerCase())}
export async function fetchMonthSheets(config,auth,fetcher=fetch) {
 if(!auth?.token||Date.now()>=auth.expires)throw new Error('Google access expired. Reconnect Google to refresh. Your cached data is still available.');
 const base=`https://sheets.googleapis.com/v4/spreadsheets/${sheetId(config.sheet)}`;
 const metadata=await requestGoogle(`${base}?fields=sheets(properties(sheetId,title))`,auth,fetcher);
 const tabs=(metadata.sheets||[]).map(s=>s.properties).filter(s=>s&&isMonthTab(s.title));
 if(!tabs.length)throw new Error('No month tabs found. Name your log tabs January, February, … December. Other tab names are ignored.');
 tabs.sort((a,b)=>MONTH_NAMES.findIndex(m=>m.toLowerCase()===a.title.trim().toLowerCase())-MONTH_NAMES.findIndex(m=>m.toLowerCase()===b.title.trim().toLowerCase()));
 const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'});
 for(const tab of tabs)params.append('ranges',`'${tab.title.replaceAll("'","''")}'!A:ZZ`);
 const result=await requestGoogle(`${base}/values:batchGet?${params}`,auth,fetcher);
 if(result.valueRanges?.length!==tabs.length)throw new Error('Google returned an incomplete set of month tabs. Retry; your previous cache is retained.');
 const rows=[],warnings=[];
 for(let i=0;i<tabs.length;i++){
   const tab=tabs[i],values=result.valueRanges[i].values||[];
   if(!values.length){warnings.push(`${tab.title}: empty tab — no rows imported.`);continue}
   let parsed;
   try{parsed=parseRows(values)}catch(error){throw new Error(`${tab.title}: ${error.message} Previous cached data is retained until all month tabs have valid headers.`)}
   rows.push(...parsed.rows.map(row=>({...row,id:JSON.stringify([tab.sheetId,row.id]),sourceTab:tab.title,sourceTabId:tab.sheetId})));
   warnings.push(...parsed.warnings.map(w=>`${tab.title}: ${w}`));
 }
 return {rows,warnings,tabs:tabs.map(t=>t.title)};
}
export function readStored(key,fallback){try{const value=localStorage.getItem(key);return value?JSON.parse(value):fallback}catch{return fallback}}
export function writeStored(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
