# Scratchlight — Colour Studio

A local-first, GitHub Pages-ready image colouring app. Upload an image, automatically segment it into colour regions, then tap to reveal regions or paint to scratch them away.

## Run locally
Open `index.html` in a modern browser, or serve this folder with any static web server. No build step, account, backend, or API key is required.

## Publish on GitHub Pages
1. Create a repository and upload the contents of this folder to its root.
2. In **Settings → Pages**, choose your deployment branch and `/ (root)`.
3. Open the published Pages URL.

## Audio placeholders
Add `assets/audio/ambient.mp3` for looping ambience and `assets/audio/paint.mp3` for the brush sound. The audio controls are wired to those paths.

## Storage and privacy
Images are resized to a maximum 1500px long edge and encoded as JPEG before saving. Works and progress are stored in browser `localStorage` on the current device/browser. Clearing browser storage or using private browsing may remove work. Browser storage quotas vary; if saving fails, export/backup support would be needed for that browser.

## Notes
- Shape generation uses quantized colour bins and connected-component grouping. Detail can be adjusted per work.
- Two-finger touch gestures zoom, rotate, and pan. Mouse/trackpad users can drag to pan and use the fit button to reset.
- This is a starter implementation; extremely large images and very high-detail segmentation can use significant memory.
