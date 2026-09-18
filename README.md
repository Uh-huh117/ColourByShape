# Special Pages Colouring Studio

A static, GitHub Pages-ready custom colouring app.

## Deploy
1. Create a GitHub repository and upload these files.
2. In **Settings → Pages**, choose deploy from the `main` branch and `/ (root)`.
3. Open the published site over HTTPS.

## Use
- Choose **Add artwork** and select an image.
- Tap a region to reveal it, or select **Paint to colour** and brush over the region.
- Use the sidebar to choose colour groups, toggle outlines, and enable audio.
- Works and progress are saved in IndexedDB on the current browser/device.
- Right-click a gallery card to delete it. Export a work backup from the studio.

## Audio placeholders
Put your own licensed audio files at `assets/ambient.mp3` and `assets/paint.mp3`. Ambient audio loops; painting audio plays while brushing. Browsers require a user gesture before audio can start.

## Notes
Region segmentation uses colour quantization and connected components. It is a lightweight client-side prototype, not a production-grade image segmentation model. Very detailed photos can create many small regions. Browser storage quotas vary; export backups for important work. Two-finger gestures support pan/zoom/rotation; one-finger interaction colours or drags depending on mode.
