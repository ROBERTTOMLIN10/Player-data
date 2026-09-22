# App preview builder

Builds a single self-contained HTML page of the web app for clicking through
without a server: the real frontend, with `/api` answered by `mock.ts` from data
captured off a local test server (real GPS files in `data/titan`, a
fausports.com schedule/stats sync, and made-up player logins and check-ins).
A bar at the top switches between the player and coach views; nothing is saved.

```bash
OUT=/tmp/fau-preview bash tools/preview/build.sh
# → /tmp/fau-preview/fau-app-preview.html
```

The fausports.com sync step needs network access to `fausports.com`; without
it the preview still builds, just with no schedule or box scores.

Not part of the deployed app.
