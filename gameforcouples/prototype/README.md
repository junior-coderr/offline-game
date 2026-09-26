# Roomscape prototype

The main page is a responsive, full-screen top-down room map with a portrait 13 × 24 tile footprint, an orthogonal panel floor, perimeter walls, one doorway, and the supplied teal sofa. The map loads its 696 × 364 transparent WebP runtime asset (`assets/sofa-teal.webp`); the larger PNG is kept as the editing source. On portrait screens the room fills the phone display. It contains no interface text or sidebar.

The motion lab at `animation.html` is a sprite-sheet editor. Load or drop an image, drag boxes around poses, adjust exact source-pixel coordinates and dimensions, label and reorder frames, then preview the animation at 1–24 fps. “Save locally” stores the source sheet and sequence in IndexedDB in the current browser; “Export project” downloads a portable JSON project that includes the image. The saved Explorer animation can be run at `walk-preview.html`; it uses a lossless WebP atlas and retains the original crop coordinates in `assets/explorer-walk-frames.json`. No backend or game engine is required for this preview. Browser storage availability can vary for pages opened directly as `file://`; the portable export is the backup.

Open `index.html` directly in a browser, or serve the repository root locally:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173/gameforcouples/prototype/>.
