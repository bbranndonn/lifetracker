import {test,expect} from '@playwright/test';
const key='life-tracker-session-v1';
async function mockGoogle(page){
 await page.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:config=>({requestAccessToken:options=>{window.tokenRequests=(window.tokenRequests||[]).concat(options);window.dispatchEvent(new Event('focus'));setTimeout(()=>window.failRefresh&&options.prompt===''?config.error_callback({type:'popup_failed_to_open'}):config.callback({access_token:'test-token',expires_in:3600}),0)}})}}};`}));
 await page.route('https://www.googleapis.com/oauth2/v3/userinfo',async route=>route.fulfill({json:{email:await page.evaluate(()=>window.mockEmail||'one@example.com'),email_verified:true}}));
 await page.route('https://sheets.googleapis.com/**',route=>route.fulfill({json:route.request().url().includes('batchGet')?{valueRanges:[{values:[['Date','Category','Activity','Minutes'],['2026-09-18','Career','Practice',60]]}]}:{sheets:[{properties:{sheetId:1,title:'September'}}]}}));
}
async function signIn(page,email){await mockGoogle(page);await page.goto('/');if(email)await page.evaluate(email=>window.mockEmail=email,email);await page.getByRole('button',{name:'Sign in with Google',exact:true}).click()}
test('fresh visitor sees only gate; deny creates no session',async({page})=>{
 await mockGoogle(page);await page.goto('/');await expect(page.getByRole('navigation')).toHaveCount(0);await expect(page.getByRole('button',{name:'Open settings'})).toHaveCount(0);await page.evaluate(()=>window.mockEmail='outsider@example.com');await page.getByRole('button',{name:'Sign in with Google',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No access');expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();await expect(page.getByRole('navigation')).toHaveCount(0);
});
for(const email of ['one@example.com','TWO@example.com'])test(`allowlisted ${email}, reload, production controls, signout`,async({page})=>{
 await signIn(page,email);await expect(page.getByRole('navigation')).toBeVisible();await expect(page.getByText('Reading 1 month tabs: September. Other tabs ignored.')).toBeVisible();
 const session=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);expect(session.email).toBe(email.toLowerCase());expect(session.expiresAt-Date.now()).toBeGreaterThan(6.9*86400000);
 await page.getByRole('button',{name:'Open settings'}).click();await expect(page.getByText('Explore sample data')).toHaveCount(0);await expect(page.getByLabel('OAuth web client ID')).toHaveCount(0);await expect(page.getByLabel('Google Sheet URL or ID')).toHaveCount(0);await page.getByRole('button',{name:'Close dialog'}).click();
 await page.addInitScript(email=>window.mockEmail=email,email);await page.reload();await expect(page.getByRole('navigation')).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.tokenRequests?.[0]?.prompt)).toBe('');expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).expiresAt,key)).toBe(session.expiresAt);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('navigation')).toHaveCount(0);await page.reload();await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();
});
test('silent refresh failure retains app session and reconnect recovers',async({page})=>{
 await signIn(page);await expect(page.getByRole('navigation')).toBeVisible();await page.addInitScript(()=>window.failRefresh=true);await page.reload();await expect(page.getByRole('alert')).toContainText('Choose Connect Google');expect(await page.evaluate(key=>localStorage.getItem(key),key)).not.toBeNull();await expect(page.getByRole('navigation')).toBeVisible();await page.getByRole('button',{name:'Connect Google',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
});
test('expired session and cross-tab signout gate app',async({page,context})=>{
 await signIn(page);await expect(page.getByRole('navigation')).toBeVisible();const second=await context.newPage();await mockGoogle(second);await second.goto('/');await expect(second.getByRole('navigation')).toBeVisible();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(second.getByRole('navigation')).toHaveCount(0);
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({email:'one@example.com',expiresAt:Date.now()-1})),key);await page.reload();await expect(page.getByRole('navigation')).toHaveCount(0);
});
test('renewal with a different allowed identity removes session',async({page})=>{
 await signIn(page);await expect(page.getByRole('navigation')).toBeVisible();await page.addInitScript(()=>window.mockEmail='two@example.com');await page.reload();await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
});
test('Sheets 401 renews once and retries without signing out',async({page})=>{
 await signIn(page);await expect(page.getByText('Reading 1 month tabs: September. Other tabs ignored.')).toBeVisible();
 let requests=0;
 await page.route('https://sheets.googleapis.com/**',async route=>{requests++;if(requests===1)return route.fulfill({status:401,json:{error:'expired'}});return route.fallback()});
 await page.getByRole('button',{name:'Refresh data',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.tokenRequests?.length)).toBe(2);await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('navigation')).toBeVisible();await expect.poll(()=>requests).toBe(3);
});
test('landing fits desktop and mobile',async({page},testInfo)=>{
 await mockGoogle(page);await page.goto('/');await page.screenshot({path:testInfo.outputPath('landing-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('landing-mobile.png'),fullPage:true});
});
test('existing cache, preferences and local adjustments survive the upgrade',async({page})=>{
 await mockGoogle(page);await page.route('https://sheets.googleapis.com/**',route=>route.fulfill({status:503,json:{}}));await page.goto('/');
 await page.evaluate(()=>{
  const source='abcdefghijklmnopqrstuvwx:month-tabs-v1';
  localStorage.setItem('life-tracker-settings-v1',JSON.stringify({dark:true,mode:'demo'}));
  localStorage.setItem('life-tracker-cache-v1',JSON.stringify({[source]:{rows:[],tabs:['September'],updated:new Date().toISOString()}}));
  localStorage.setItem('life-tracker-adjustments-v1',JSON.stringify({[source]:{legacy:{deleted:true}}}));
 });
 await page.getByRole('button',{name:'Sign in with Google',exact:true}).click();await expect(page.getByText('Local log adjustments are active.',{exact:false})).toBeVisible();await expect(page.getByText('Reading 1 month tabs: September. Other tabs ignored.')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.getByText('Sample data',{exact:true})).toHaveCount(0);
});
