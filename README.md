# Life Tracker

Private Google sign-in gate for the existing dashboard, daily log, activities,
goals and trends. Google Sheets access is read-only; edits remain local.

## Connection setup

Copy `.env.example` to `.env.local`, or set the same variables in your build host:

| Variable | Value |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth **Web application** client ID |
| `VITE_SHEET_ID` | Optional shared default ID or URL; leave blank for personal sheets |
| `VITE_ALLOWED_EMAILS` | Comma-separated Google emails; case-insensitive |
| `VITE_SESSION_DAYS` | Optional positive duration in days, default `7` |

Enable Google Sheets API in the client’s Google Cloud project. Add the exact app
origin to the client's authorized JavaScript origins. If the OAuth consent app
is in testing, add both accounts as test users. Each person must be able to open their own private spreadsheet
with their signed-in Google account (Viewer is sufficient). No client secret is needed.
Restart Vite after env changes; production values are baked in at build time.
Never commit `.env`, `.env.local`, real emails or credentials.

Run `npm ci`, then `npm run dev`. Missing required Google client/allowlist config
is explained on the landing page. A missing or invalid optional sheet default
never blocks sign-in; it opens the personal sheet setup instead. Production has
no demo mode. The OAuth client ID stays baked in and is never entered in Settings.

## Two people, two sheets, one app URL

1. Add both Google emails to `VITE_ALLOWED_EMAILS` and leave `VITE_SHEET_ID` blank.
   Use the same deployed app URL and shared OAuth client for everyone.
2. Person one signs in and pastes Sheet A's URL or ID into **Connect your sheet**.
3. Person two signs in with their own Google account and pastes Sheet B's URL or ID.
   An account outside the allowlist cannot reach this setup or the dashboard.
4. On each phone/laptop/browser, sign in and paste your own sheet URL once.
   **Same Google account + same sheet URL = same Google Sheets data source.**
5. To change your source, open **Settings → My Google Sheet URL or ID** and save.
   The current choice is shown there; a saved personal choice overrides the
   optional build-time default. A sheet you cannot read produces a sync error;
   use Settings to correct it. The app never falls back to another user's sheet.

The normalized sheet ID is stored under `life-tracker-sheet-v1:<lowercase-email>`
in localStorage. Phone and laptop do **not** share this preference automatically.
There is no cloud settings sync. Local edits, goals and other preferences also
stay on the device; only the source data comes from Google Sheets.

Caches remain under `life-tracker-cache-v2:<email>` and adjustments under
`life-tracker-adjustments-v2:<email>`, with each workbook separated by its
normalized sheet ID inside those records. Switching A → B → A restores A's own
cache/adjustments. Clearing a sheet's cache in Settings affects only that account
and sheet. Existing email-scoped data from the previous release is retained;
older unscoped data is no longer copied into other accounts.

## Sessions and privacy

The gate checks Google's verified email before saving `{ email, expiresAt }` in
localStorage. A valid allowlisted session opens the app for seven days by default;
renewing a token does not extend that deadline. Sign out clears the session and
in-memory token, and other open tabs return to the landing page.

Access tokens remain in memory. Sync requests renew them using GIS `prompt: ''`
and the session email as a login hint, then check identity again. A Sheets 401
gets one renewal/retry. Popup, consent or network failures offer Connect Google
without deleting the app session; a denied or mismatched identity clears it.
Browsers can block automatic popups, so completely unattended renewal is not
guaranteed. See [Google's token client reference](https://developers.google.com/identity/oauth2/web/reference/js-reference).

This is a browser-side gate, not a server-enforced authorization boundary.
`VITE_*` values are visible in the bundle, and localStorage is user-editable.
Keep the sheet private: Google sharing permissions enforce access to its data.
Cached logs and adjustments remain on the device after sign-out, behind the UI
gate; clear them in Settings before signing out on a shared device. No Google
refresh tokens are requested or stored. Stronger app-level enforcement requires
a backend, which is outside this release's scope.

## Validation checklist

Automated: `npm test`, `npm run build`, and `npm run test:e2e` (install Chromium
with `npx playwright install chromium` first, or use
`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` with installed Chrome). Browser tests mock Google and
Sheets; they never require real credentials or write to Sheets. The default run
tests with no global sheet. To test the optional fallback build separately, run
`TEST_DEFAULT_SHEET=abcdefghijklmnopqrstuvwx PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- --grep "optional default"`
(the ID is a test fixture).

- Fresh visitor: only landing, no navigation, settings, sample data or dashboard.
- Allowlisted Google account: verified identity opens the app; other account
  sees “No access” and no session. Try both configured emails, mixed case.
- Reload within seven days: app opens, cached logs remain and token renewal runs.
  Expired, malformed or removed-from-allowlist session returns to landing.
- Expired token: silent renewal uses the session email; failure offers Connect
  Google while retaining the app session. Wrong identity clears it.
- Sign out: session/token cleared; reload and other open tabs remain gated.
- Personal sheets: sign in without VITE_SHEET_ID, choose and reload Sheet A;
  change to Sheet B and back. Verify each sheet keeps its own adjustments/cache.
- Two accounts in one browser: each keeps its sheet choice and data; signing
  back in restores the correct choice. A new device asks for a sheet again.
- Production: no sample mode or OAuth client input; personal sheet input works.
- Live acceptance: test both real Google accounts on separate devices, popup
  consent/blocked-popup recovery and a real read-only Sheets sync. Mock tests
  cannot verify Cloud Console setup or a browser's live Google cookie policy.

Work is committed and pushed only to `release/v1`; no main merge or PR required.
