import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',fullyParallel:true,use:{baseURL:'http://127.0.0.1:4173',headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})},
 webServer:{command:'npm run build && npm run preview -- --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false,env:{VITE_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',VITE_SHEET_ID:'abcdefghijklmnopqrstuvwx',VITE_ALLOWED_EMAILS:'one@example.com,TWO@example.com',VITE_SESSION_DAYS:'7'}}
});
