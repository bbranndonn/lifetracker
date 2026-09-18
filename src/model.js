export const DEFAULTS = {
  Career: {target:12,color:'#1f77b4'}, Fitness:{target:6,color:'#2ca02c'},
  Relationships:{target:8,color:'#d62728'}, 'Mental Health':{target:5,color:'#9467bd'}, Other:{target:4,color:'#ff7f0e'}
};
export const PALETTE=['#189b97','#dc65a0','#8b8d32','#5968cb','#bd7650','#58888d','#a05690'];
export const dayKey = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const toDate = s => new Date(`${s}T12:00:00`);
export const addDays=(s,n)=>{const d=toDate(s);d.setDate(d.getDate()+n);return dayKey(d)};
export const monday=s=>addDays(s,-((toDate(s).getDay()+6)%7));
export const daysBetween=(a,b)=>Math.round((Date.UTC(...a.split('-').map((v,i)=>i===1?+v-1:+v))-Date.UTC(...b.split('-').map((v,i)=>i===1?+v-1:+v)))/86400000);
export const hours=n=>(n/60).toLocaleString(undefined,{maximumFractionDigits:1});
export const activityKey=r=>JSON.stringify([r.category,r.activity]);
export function parseDate(value,year=new Date().getFullYear()) {
  if(typeof value==='number' && Number.isFinite(value)) {
    if(value<1||value>100000)return null;
    return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  }
  const text=String(value??'').trim(); let y,m,d;
  let match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(match) [,y,m,d]=match.map(Number);
  else {
    match=text.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
    if(!match)return null;
    m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[1].slice(0,3).toLowerCase())+1;
    d=+match[2];y=+(match[3]||year);
  }
  if(y<1900||y>2200||m<1||m>12||d<1||d>31)return null;
  const result=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return dayKey(toDate(result))===result?result:null;
}
export function parseRows(values,year) {
  if(!Array.isArray(values)||!values.length)throw new Error('The sheet is empty. Add the header row: Date, Category, Activity, Minutes, Optional Note.');
  const headers=values[0].map(v=>String(v).trim().toLowerCase());
  const required=['date','category','activity','minutes'];
  for(const name of required){if(!headers.includes(name))throw new Error(`Missing '${name[0].toUpperCase()+name.slice(1)}' column. Use Date, Category, Activity, Minutes, Optional Note.`);if(headers.filter(h=>h===name).length>1)throw new Error(`Duplicate '${name}' column. Keep one column per field.`)}
  const get=(row,name)=>row[headers.indexOf(name)];const rows=[],warnings=[],counts=new Map();
  values.slice(1).forEach((r,i)=>{
    if(!r.some(v=>String(v??'').trim()))return;
    const date=parseDate(get(r,'date'),year),category=String(get(r,'category')??'').trim(),activity=String(get(r,'activity')??'').trim();
    const raw=get(r,'minutes'),minutes=typeof raw==='number'?raw:Number(String(raw??'').trim());
    if(!date||!category||!activity||String(raw??'').trim()===''||!Number.isFinite(minutes)||minutes<=0){warnings.push(`Row ${i+2}: skipped — use a valid date, category, activity, and positive minutes.`);return}
    const note=String(get(r,'optional note')??get(r,'note')??'');
    const fingerprint=JSON.stringify([date,category,activity,minutes,note]);const occurrence=(counts.get(fingerprint)||0)+1;counts.set(fingerprint,occurrence);
    rows.push({id:JSON.stringify([fingerprint,occurrence]),sheetRow:i+2,date,category,activity,minutes,note});
  });return {rows,warnings};
}
export function categoriesFor(rows,settings={}) {
 const names=[...new Set([...Object.keys(DEFAULTS),...rows.map(r=>r.category),...Object.keys(settings)])];
 return names.map(name=>{let hash=0;for(const c of name)hash=(hash*31+c.charCodeAt(0))>>>0;return {name,target:0,color:PALETTE[hash%PALETTE.length],...DEFAULTS[name],...settings[name]}});
}
export const applyOverrides=(rows,overrides={})=>rows.filter(r=>!overrides[r.id]?.deleted).map(r=>({...r,...overrides[r.id],id:r.id}));
export function streaks(rows,today=dayKey()) {
 const dates=new Set(rows.filter(r=>r.date<=today).map(r=>r.date));let current=0,cursor=today,max=0,run=0,previous;
 while(dates.has(cursor)){current++;cursor=addDays(cursor,-1)}
 for(const date of [...dates].sort()){run=previous&&addDays(previous,1)===date?run+1:1;max=Math.max(max,run);previous=date}return {current,max,dates};
}
export function summarize(rows,categories,start,end,activity='all') {
 const visible=new Set(categories.filter(c=>!c.hidden).map(c=>c.name));
 const pool=rows.filter(r=>visible.has(r.category)&&(activity==='all'||activityKey(r)===activity));
 const selected=pool.filter(r=>r.date>=start&&r.date<=end);const total=selected.reduce((s,r)=>s+r.minutes,0);
 const n=daysBetween(end,start)+1;const previous=pool.filter(r=>r.date>=addDays(start,-n)&&r.date<start).reduce((s,r)=>s+r.minutes,0);
 const byCategory=categories.filter(c=>!c.hidden).map(c=>({...c,minutes:selected.filter(r=>r.category===c.name).reduce((s,r)=>s+r.minutes,0)}));
 const acts=[...new Set(pool.map(activityKey))].map(key=>{const [category,activity]=JSON.parse(key);return {key,category,activity,minutes:selected.filter(r=>activityKey(r)===key).reduce((s,r)=>s+r.minutes,0)}}).sort((a,b)=>b.minutes-a.minutes);
 const days=Array.from({length:Math.max(0,Math.min(n,366))},(_,i)=>{const date=addDays(start,i);return {date,label:toDate(date).toLocaleDateString(undefined,{weekday:n===7?'short':undefined,month:n===7?undefined:'short',day:n===7?undefined:'numeric'}),...Object.fromEntries(byCategory.map((c,j)=>[`c${j}`,selected.filter(r=>r.date===date&&r.category===c.name).reduce((s,r)=>s+r.minutes,0)/60]))}});
 const target=byCategory.reduce((s,c)=>s+c.target*60*n/7,0);
 return {selected,total,previous,change:previous?(total-previous)/previous*100:null,byCategory,activities:acts,active:acts.filter(a=>a.minutes>0).length,days,target,progress:target?total/target*100:null,loggedDays:new Set(selected.map(r=>r.date)).size};
}
export function demoRows(today=dayKey()) {
 const names={Career:['Interview Practice – Sales','Job Research','Resume / LinkedIn'],Fitness:['Gym','Run'],Relationships:['Cristina – Quality Time','Family – Calls'],'Mental Health':['Meditation','Reading'],Other:['Life admin']};const rows=[];
 for(let i=55;i>=0;i--){const date=addDays(today,-i);Object.entries(names).forEach(([category,activities],j)=>{if((i+j)%6===0)return;const activity=activities[i%activities.length];rows.push({id:`demo-${i}-${j}`,date,category,activity,minutes:[75,45,90,25,20][j]+((i*7+j*3)%5)*10,note:''})})}return rows;
}
