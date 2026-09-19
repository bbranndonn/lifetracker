# Life Tracker

Private Google sign-in gate for the existing dashboard, daily log, activities,
goals and trends. Google Sheets access is read-only; edits remain local.

## Connection setup

Copy `.env.example` to `.env.local`, or set the same variables in your build host:

| Variable | Value |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth **Web application** client ID |
| `VITE_SHEET_ID` | Spreadsheet ID or full Google Sheets URL |
| `VITE_ALLOWED_EMAILS` | Comma-separated Google emails; case-insensitive |
| `VITE_SESSION_DAYS` | Optional positive duration in days, default `7` |

Enable Google Sheets API in the client’s Google Cloud project. Add the exact app
origin to the client's authorized JavaScript origins. If the OAuth consent app
is in testing, add both accounts as test users. Share the private spreadsheet
with both Google accounts (Viewer is sufficient). No client secret is needed.
Restart Vite after env changes; production values are baked in at build time.
Never commit `.env`, `.env.local`, real emails or credentials.

Run `npm ci`, then `npm run dev`. Missing development config is explained on the
landing page. Production fails closed when config is absent. Settings no longer
requires connection fields. Sample mode is available only in development, after
sign-in. Existing browser settings, cached sheet logs and local adjustments are retained
on first use. Subsequent changes are stored separately for each signed-in email.

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
Sheets; they never require real credentials or write to Sheets.

- Fresh visitor: only landing, no navigation, settings, sample data or dashboard.
- Allowlisted Google account: verified identity opens the app; other account
  sees “No access” and no session. Try both configured emails, mixed case.
- Reload within seven days: app opens, cached logs remain and token renewal runs.
  Expired, malformed or removed-from-allowlist session returns to landing.
- Expired token: silent renewal uses the session email; failure offers Connect
  Google while retaining the app session. Wrong identity clears it.
- Sign out: session/token cleared; reload and other open tabs remain gated.
- Production: no sample mode or client/sheet input fields, even with old settings.
- Live acceptance: test both real Google accounts on separate devices, popup
  consent/blocked-popup recovery and a real read-only Sheets sync. Mock tests
  cannot verify Cloud Console setup or a browser's live Google cookie policy.

Work is committed and pushed only to `release/v1`; no main merge or PR required.
