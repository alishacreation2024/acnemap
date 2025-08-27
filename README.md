# AcneMap (MVP)
A lightweight, browser-only acne scanner that:
- Detects face landmarks (MediaPipe FaceMesh via CDN)
- Estimates redness/blemish concentration by region (forehead/cheeks/nose/chin)
- Shows a soft heatmap overlay
- Suggests gentle home remedies (editable in `remedies.json`)

## Run locally
Just open `index.html` in a modern browser. For camera use, you may need to run a local server:
- **VS Code**: Install “Live Server” extension → Right-click `index.html` → “Open with Live Server”.
- Or Python: `python -m http.server` then visit `http://localhost:8000`.

## Notes
- All processing is client-side; no uploads.
- This is a heuristic MVP (redness proxy). For real acne detection, plug in a trained model (e.g., TensorFlow.js) and replace `analyzeRegion()` with model outputs mapped to regions.
- Edit/add remedies safely in `remedies.json`.
- Not medical advice. See a dermatologist for severe or persistent acne.
