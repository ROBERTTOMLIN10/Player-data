---
name: update-preview
description: Rebuild and republish the clickable preview of the FAU Men's Soccer app (player check-in, body map, My GPS, coach Readiness board) at its existing Claude artifact link. Use whenever Rob says "update the preview", "refresh the preview", "show me the changes", or asks to see the app after a change — and after finishing any change to web/ or server/ that he'll want to look at.
---

# Update the app preview

The preview is a single self-contained page of the real web app, published as a
private Claude artifact that keeps the same link every time:

**https://claude.ai/artifact/GmuXMtqxTjNBfykNJNUNKp**

It runs the real frontend with `/api` answered from data captured off a local
test server (see `tools/preview/README.md`): real GPS files from `data/titan`,
made-up player logins and check-ins, and a bar at the top to switch between the
player and coach views. Nothing in it is saved.

## Steps

1. **Build** from the repo root, with the code you want previewed checked out
   (usually the working branch with the latest changes):

   ```bash
   OUT=/tmp/fau-preview bash tools/preview/build.sh
   ```

   The "fausports.com sync" step usually fails with a 403 because this
   environment can't reach fausports.com. That's expected: the preview still
   builds, just without the real schedule and box scores. Don't try to work
   around it. Any other failure (typecheck, build, capture) is a real problem
   to fix before publishing.

2. **Look once.** Open `/tmp/fau-preview/fau-app-preview.html` in Playwright
   (Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
   `NODE_PATH=$(npm root -g)`) at phone width (390×844). Check the player
   check-in renders, click **Coach view**, open the page that changed, and make
   sure there are no page errors. Garbled characters like `Â·` in a local file
   are only the missing charset tag; the published page adds it.

3. **Publish to the same link.** Use the Artifact tool: `read` the URL above
   first (a conversation that didn't publish it must read it before updating),
   then publish with `url` set to that link and `file_path`
   `/tmp/fau-preview/fau-app-preview.html`. Don't pass `icon`.

4. **Tell Rob** in plain language: the link, what changed, and that it uses
   test check-ins and doesn't save anything.

## When the app changes

If a change adds a new `/api` endpoint or request the preview doesn't know
about, the page will show a "Not found" error there. Fix it in
`tools/preview/`: add the endpoint to `capture.mjs` (captured from the test
server) or handle it in `mock.ts` (for writes and dynamic requests), then
rebuild. Keep preview-only code in `tools/preview/`; never change the real
app to suit the preview.

Don't commit build output (`/tmp/fau-preview`) or push anything as part of
updating the preview.
