import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRows,parseDate,monday,addDays,daysBetween,streaks,summarize,categoriesFor,DEFAULTS,applyOverrides,activityKey} from './model.js';
import {fetchSheet,fetchMonthSheets,isMonthTab,sheetId,sourceKey} from './sheets.js';
const header=['Date','Category','Activity','Minutes','Optional Note'];
const fixture=parseRows([header,['2026-09-14','Career','Practice',60],['2026-09-15','Fitness','Gym',90],['2026-09-16','Career','Practice',30],['2026-09-07','Career','Practice',45],['2026-09-08','Fitness','Gym',30],['2026-09-20','New category','Walk',120]]).rows;
test('strict dates, real Sheets serials, leap years and explicit yearless text',()=>{assert.equal(parseDate(46283),'2026-09-18');assert.equal(parseDate('Feb 29 2024'),'2024-02-29');assert.equal(parseDate('2026-02-29'),null);assert.equal(parseDate('2026-04-31'),null);assert.equal(parseDate('09/10/26'),null);assert.equal(parseDate('Sep 18',2026),'2026-09-18');assert.equal(parseDate(''),null)});
test('Monday boundary across years and DST safe calendar counts',()=>{assert.equal(monday('2026-01-01'),'2025-12-29');assert.equal(addDays('2026-03-08',1),'2026-03-09');assert.equal(daysBetween('2026-03-10','2026-03-07'),3)});
test('header errors and partial malformed-row recovery',()=>{assert.throws(()=>parseRows([]),/empty/);assert.throws(()=>parseRows([['Date','Activity','Minutes']]),/Category/);assert.throws(()=>parseRows([['Date','Category','Activity','Minutes','Date']]),/Duplicate/);const result=parseRows([header,['2026-09-18','Career','Practice',20],['bad','Career','Practice',10],['2026-09-18','Career','Practice',-5],['2026-09-18','Career','Practice',''],['2026-09-18','Career','Practice','Infinity'],[]]);assert.equal(result.rows.length,1);assert.equal(result.warnings.length,4)});
test('weekly totals, distinct activities, custom categories, previous-week delta',()=>{const cats=categoriesFor(fixture);const s=summarize(fixture,cats,'2026-09-14','2026-09-20');assert.equal(s.total,300);assert.equal(s.previous,75);assert.equal(s.change,300);assert.equal(s.active,3);assert.equal(s.target,2100);assert.equal(s.loggedDays,4);assert.equal(s.days.length,7);assert.equal(s.byCategory.find(c=>c.name==='Career').minutes,90);assert.equal(cats.find(c=>c.name==='New category').target,0)});
test('exact default targets and colors, stable custom colors after reorder',()=>{const cats=categoriesFor(fixture);assert.equal(cats.slice(0,5).reduce((s,c)=>s+c.target,0),35);assert.equal(cats[0].color,'#1f77b4');assert.equal(categoriesFor([...fixture].reverse()).find(c=>c.name==='New category').color,cats.find(c=>c.name==='New category').color)});
test('hidden category exclusion, activity filters, proportional targets',()=>{const cats=categoriesFor(fixture,{Fitness:{hidden:true}});assert.equal(summarize(fixture,cats,'2026-09-14','2026-09-20').total,210);assert.equal(summarize(fixture,cats,'2026-09-14','2026-09-20',activityKey(fixture[0])).total,90);assert.equal(summarize([],categoriesFor([]),'2026-09-14','2026-09-27').target,4200)});
test('zero previous denominator and zero-target empty selections',()=>{const s=summarize([],[],'2026-09-14','2026-09-20');assert.equal(s.change,null);assert.equal(s.progress,null);assert.equal(s.total,0);assert.equal(s.active,0)});
test('inactive known activities remain available',()=>{const s=summarize(fixture,categoriesFor(fixture),'2026-10-01','2026-10-07');assert.equal(s.activities.length,3);assert.ok(s.activities.every(a=>a.minutes===0))});
test('streaks include today, deduplicate, reset after missed day, ignore future',()=>{const rows=['2026-09-14','2026-09-15','2026-09-15','2026-09-16','2026-09-18','2026-09-19'].map(date=>({date}));assert.deepEqual({...streaks(rows,'2026-09-18'),dates:undefined},{current:1,max:3,dates:undefined});assert.equal(streaks(rows,'2026-09-17').current,0);assert.equal(streaks(rows,'2026-09-16').current,3)});
test('stable IDs survive row insertion, duplicates stay distinct, edits do not mutate source',()=>{const row=['2026-09-18','Career','Practice',60];const original=parseRows([header,row,row]).rows;const inserted=parseRows([header,['2026-09-19','Fitness','Gym',20],row,row]).rows;assert.equal(original[0].id,inserted[1].id);assert.notEqual(original[0].id,original[1].id);const changed=applyOverrides(original,{[original[0].id]:{minutes:20},[original[1].id]:{deleted:true}});assert.equal(changed.length,1);assert.equal(changed[0].minutes,20);assert.equal(original[0].minutes,60)});
const config={sheet:'abcdefghijklmnopqrstuvwx',tab:"Daily Log's"};const auth={token:'test',expires:Date.now()+1e6};
test('validates source IDs and scopes month cache by workbook',()=>{assert.equal(sheetId('https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx/edit'),'abcdefghijklmnopqrstuvwx');assert.throws(()=>sheetId('https://evil.example/id'),/Google Sheets/);assert.equal(sourceKey(config),sourceKey({...config,tab:'Other'}));assert.notEqual(sourceKey(config),sourceKey({...config,sheet:'differentabcdefghijklmnopqrstuvwx'}))});
test('API requests correctly escaped range, unformatted numbers, bearer header',async()=>{const result=await fetchSheet(config,auth,async(url,options)=>{assert.ok(decodeURIComponent(url).includes("'Daily Log''s'!A:ZZ"));assert.ok(url.includes('UNFORMATTED_VALUE'));assert.equal(options.headers.Authorization,'Bearer test');return {ok:true,json:async()=>({values:[header]})}});assert.deepEqual(result,[header])});
test('authorization, network, permission, range, rate-limit and server errors',async()=>{await assert.rejects(()=>fetchSheet(config,null),/expired/);await assert.rejects(()=>fetchSheet(config,{token:'test',expires:0}),/expired/);await assert.rejects(()=>fetchSheet(config,auth,async()=>{throw new Error('offline')}),/Cached data/);for(const [status,pattern] of [[401,/expired/],[403,/Access denied/],[404,/not found/],[400,/tab name/],[429,/rate limiting/],[500,/500/]])await assert.rejects(()=>fetchSheet(config,auth,async()=>({ok:false,status})),pattern)});
test('month discovery accepts only full month names, case and whitespace insensitive',()=>{
 for(const name of ['January','FEBRUARY',' march ','December'])assert.equal(isMonthTab(name),true);
 for(const name of ['Summary','Jan','January 2026','January goals','Monthly','',null])assert.equal(isMonthTab(name),false);
});
const jsonResponse=body=>({ok:true,json:async()=>body});
test('aggregates all month tabs, ignores other tabs, namespaces duplicate rows and warnings',async()=>{
 const data=['2026-09-18','Career','Practice',60];let calls=0;
 const result=await fetchMonthSheets(config,auth,async url=>{
  calls++;if(calls===1)return jsonResponse({sheets:[{properties:{sheetId:2,title:'September'}},{properties:{sheetId:3,title:'Summary'}},{properties:{sheetId:1,title:' january '}}]});
  const ranges=new URL(url).searchParams.getAll('ranges');assert.deepEqual(ranges,["' january '!A:ZZ","'September'!A:ZZ"]);
  return jsonResponse({valueRanges:[{values:[header,data]},{values:[header,data,['bad','Career','Oops',10]]}]});
 });
 assert.equal(calls,2);assert.equal(result.rows.length,2);assert.notEqual(result.rows[0].id,result.rows[1].id);assert.deepEqual(result.tabs,[' january ','September']);assert.match(result.warnings[0],/^September: Row 3/);assert.equal(result.rows[1].sourceTab,'September');
});
test('rediscovers month tabs on refresh and reports no-month, partial and schema failures',async()=>{
 let metadataCalls=0;
 const fetcher=async url=>{if(!url.includes('batchGet')){metadataCalls++;return jsonResponse({sheets:Array.from({length:metadataCalls},(_,i)=>({properties:{sheetId:i,title:['January','February'][i]}}))})}return jsonResponse({valueRanges:Array.from({length:metadataCalls},()=>({values:[header,['2026-01-01','Career','Practice',30]]}))})};
 assert.equal((await fetchMonthSheets(config,auth,fetcher)).tabs.length,1);assert.equal((await fetchMonthSheets(config,auth,fetcher)).tabs.length,2);
 await assert.rejects(()=>fetchMonthSheets(config,auth,async()=>jsonResponse({sheets:[]})),/No month tabs/);
 const meta={sheets:[{properties:{sheetId:1,title:'January'}}]};
 await assert.rejects(()=>fetchMonthSheets(config,auth,async url=>jsonResponse(url.includes('batchGet')?{valueRanges:[]}:meta)),/incomplete/);
 await assert.rejects(()=>fetchMonthSheets(config,auth,async url=>jsonResponse(url.includes('batchGet')?{valueRanges:[{values:[['Date']]}]}:meta)),/January: Missing 'Category'/);
 const empty=await fetchMonthSheets(config,auth,async url=>jsonResponse(url.includes('batchGet')?{valueRanges:[{}]}:meta));assert.equal(empty.rows.length,0);assert.match(empty.warnings[0],/January: empty/);
 await assert.rejects(()=>fetchMonthSheets(config,null),/expired/);
});
