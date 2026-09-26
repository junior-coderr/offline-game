# Roomscape prototype

The main page is a responsive, full-screen top-down room map with a portrait 13 × 24 tile footprint, an orthogonal panel floor, perimeter walls, one doorway, and the supplied teal sofa. The map loads its 696 × 364 transparent WebP runtime asset (`assets/sofa-teal.webp`); the larger PNG is kept as the editing source. On portrait screens the room fills the phone display. It contains no interface text or sidebar.

The character walk-cycle preview remains at `animation.html` and loads Phaser 4.2.1 from jsDelivr.

Open `index.html` directly in a browser, or serve the repository root locally:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173/gameforcouples/prototype/>.
