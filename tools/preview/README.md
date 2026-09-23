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

## Schedule, box scores and player stats

These come from fausports.com. Claude's cloud sessions can't reach that site,
so a GitHub Actions job (`.github/workflows/preview-data.yml`) syncs it on
GitHub's servers daily and on demand, and saves the result to the
`preview-data` branch as `fausports-snapshot.json` (`snapshot.mts export`).
`build.sh` loads that snapshot first (`snapshot.mts import`), then still tries a
live sync, which wins if the build machine can reach the site.

To refresh the data now: GitHub → Actions → "Preview data (fausports.com)" →
Run workflow.

Not part of the deployed app.
