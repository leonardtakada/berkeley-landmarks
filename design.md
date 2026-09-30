# Berkeley Tours — Design

## Concept: a guide, after Showa Modern
The app is a printed field guide to the city in the manner of 1920s–30s
Japanese commercial print (reference: *Showa Modern*, in
`Reference/Japanese Print/`). Flat planes of two inks, geometric type,
confident composition — modern, not antique. No faux-aged ornament.

The copy calls it a guide — never a book, a copy or an edition — and the
walks are Walk 01, 02 … (The print vocabulary lives on in the code:
`constants/book.ts`, ribbons, pages.) Credit: created by Leonard Takada,
Auto Indicator LLC — in the Appendix only, never on the cover.

## Press sheet — `constants/book.ts`
- **Paper**: cream `#F2F0E6`; interior leaves `#FAF6EC`; loose slips
  `#FDFAF2`. Never stark white. The paper tooth is quiet
  (`scripts/paper-stock.mjs`). The cover board is solid blue `#0A2C8D`, the
  same as the launch screen.
- **Inks** (taken from the logo): blue `#0B2E8C` — titles, rules, ribbons,
  markers; vermilion `#E4592B` — accents, the route line, section bars; each
  also as a flat tint (`blueTint`, `vermilionTint`). Charcoal for text, sepia
  for secondary text. Flat ink areas carry a faint laydown texture
  (`InkPlane`).
- **Type**: Jost (a Futura revival — the face of the Showa Modern book).
  Hairline for big numerals, medium tracked capitals for kickers and labels,
  regular for text. The four big titles — BERKELEY TOURS, THE TOURS, THE
  REGISTRY, THE ARCHITECTS — are set in **Berkeley Post**, the guide's own
  display face: heavy cut-paper capitals after a Showa poster's POST
  lettering, built by `python3 scripts/build-title-font.py`
  (→ `assets/fonts/BerkeleyPost.otf`; needs fontTools and skia-pathops).
  Lower case sets as small capitals; the app sets titles in capitals. No Japanese text anywhere. Walks are
  numbered 01, 02 …

## Structure
- **Cover**: solid blue board with the blue-background logo
  (`assets/images/logo-on-blue.png`, cut out by `scripts/ink-logo.mjs`) and
  the title in cream.
- **Launch screen**: one full sheet — the board, the same laydown texture as
  the cover, the device on top — so there's no square around the logo
  (`node scripts/splash.mjs` writes it and the iOS imageset; the storyboard
  aspect-fills it; Android shows the cut-out logo on flat blue).
- **Ribbons** (`components/bookmark-ribbons.tsx`): flat, square-cut tapes
  (54pt wide) under a thin solid blue head-band, in book order: Tours,
  Landmarks, Appendix. The open section is solid blue and drawn out further;
  the rest are blue tint. Eased motion, no bounce. They lie over the open
  page, so a turn clears them first: all of them fade out quickly, change
  while they're away, and fade back as the leaf lands — nothing moves but the
  leaf, which starts `PAGE_TURN_DELAY_MS` behind the fade.
- **Sections**: leaves bound at the left spine, ~650ms page turn
  (`components/book-pages.tsx`). Part One The Tours, Part Two The Registry,
  Appendix. The book begins at the head-band: the strip above it (the status
  bar) is not the book, and stays put in the open page's stock — paper, or
  the board on the cover — while the leaves turn in a clipped frame below.
  A leaf turns in perspective about its top edge, so that edge runs along
  the band instead of rising past it, and the ribbons always hang over paper.
  (The frame clips, so a lifted leaf can't be drawn over the ribbons.)
  The leaf is flat paper all the way over: no shading as it tilts and no
  shadow cast on the page beneath, which read as a blur.
- **Entries**: leaves laid over the book, hinged at the right
  (`lib/page-turn.ts`); swipe back from the left edge. A tiny haptic tick
  as a leaf turns over (the ribbons tick too). No shade or edge shadow.
- **The Registry's index** (`lib/registry-index.ts`): Find reads a query
  the way a reader puts it — "every Maybeck within walking distance",
  "Queen Anne in Elmwood", "1920s downtown" — into terms of the index
  (architect, style, district, era), shown as slips that can be taken out;
  terms of one kind widen, of different kinds narrow; other words are looked
  for anywhere in an entry. If nothing answers the terms, the query is read
  as plain words. "Near me" (Where, or said in the query) keeps what's
  within a quarter hour's walk, nearest first, in bands of five minutes.
  Order by name, year, architect, style or district; tapping a heading
  narrows the index to it. `__tests__/registry-index.test.ts`.
- **Map** (`app/map.tsx`): the isometric city (below), drawn by MapLibre;
  its chrome is flat slips, with a north point (north is up and to the
  left). The camera follows the reader: a landmark flies in above its sheet;
  "the large map" frames the whole walk; "set out on foot" starts at stop 1,
  and each step frames the leg of the route between two stops
  (`lib/route-legs.ts`). Camera moves wait for the map to load. The flat
  vector map and the raster map are still there behind the dev toggle
  (`constants/map-engine.ts`).
  The reader is drawn on the drawing (`components/maplibre-view.tsx`): a
  vermilion ring and dot where they stand, gliding from fix to fix; the
  fix's uncertainty as a disc lying on the ground; the way the phone faces
  as a wedge on the ground before them. The reader's-mark button above the
  north point finds them and follows them as they walk (filled while it
  does) until the map is moved by hand; in walk mode following keeps the
  camera on them instead of framing each leg. If they're off the map, or
  location is off, a slip says so.
  The guide's architects walk its streets from z15.6, as on the cover
  (`components/iso-walkers.tsx`): a few in view, strolling, turning at
  corners, stopping, hidden where a house, tree or rise stands in front of
  them, appearing and going in along the way; still with Reduce Motion.
- **Fold-out map** (`components/fold-out-map.tsx`): folded, a blue cover
  naming the walk, its length, the streets it follows and a locator; open,
  the walk's isometric plate (`components/iso-plate.tsx`): a block of the
  city cut out as a paper diorama, the route a vermilion ribbon laid among
  the buildings by depth (its dotted centre line over everything), the
  stops' buildings as enlarged models with numbered flags — rising out of
  the page one after another, in the walk's order, once the sheet lies flat
  — the streets it follows named flat on the ground, a north point.
- **Walks** (`data/tours.ts`): each route is drawn along the ways a walker
  takes — streets, campus walks, paths and steps from OpenStreetMap — by
  `npx tsx scripts/route-walks.ts`, which stands each stop on the street it
  faces (its address's street, or `FACES` for campus buildings) so the line
  passes the front of the building instead of turning up its drive, and
  writes the route, distance and time. `--plan` prints each walk's length and
  how much of it doubles back beside the shortest order for its stops; stop
  order is chosen from that and kept in `data/tours.ts`. Re-run
  `scripts/bake-walk-streets.ts` after. Landmark positions are their
  buildings' (OpenStreetMap footprints, checked against Nominatim);
  `__tests__/walk-routes.test.ts` checks each walk passes its stops in order
  and is as long as it says. Walk mode counts a stop reached at the building
  or where the route passes it.

## Print primitives — `components/print.tsx`
`InkPlane`, `Rule`, `DotRule`, `Bar`, `Arrow`, `Label`, `Annotation`.
Photographs print as one-ink duotones with a vermilion block set out of
register (`components/tipped-in-plate.tsx`). Travel stamps are geometric
labels — circle, square, arch, triangle.

## The isometric city — `scripts/iso/`
Berkeley as the cover device draws it: seen from the south-west, east up to
the right, north up to the left (`lib/iso.ts`). The land is stacked paper,
one sheet per 25 m terrace (USGS 3DEP elevation via the AWS terrain tiles,
`scripts/iso/terrain.ts`), its risers a deeper tint; the Bay flat blue with
ruled waves; streets paper on a pale blue ground; every OpenStreetMap
building raised from its outline (houses under gables, heights from tags or
guessed from kind and size), flat-shaded in two tones lit from the west;
the registry's landmarks in vermilion; lollipop trees in the parks and
groves. The pieces are laid back to front (`scripts/iso/scene.ts`).
- **Walk plates**: `npx tsx scripts/iso/plates.ts [walk…]` bakes each walk's
  block to `assets/plates/<walk>.png` and writes
  `components/walk-plates.generated.ts` (route, models, flags, labels);
  `scripts/iso/proof.ts` proofs one as the app draws it.
- **The city map**: `npx tsx scripts/iso/city.ts` writes
  `assets/map/iso.pmtiles` — the scene laid out on MapLibre's globe as if its
  metres were at 0°, 0° — and `lib/iso-terrain.generated.ts`, the terraces
  the app lifts pins, routes and the reader onto (`lib/iso-map.ts`). Style:
  `lib/iso-style.ts`, one fill layer in the drawing's order (fill sort key,
  no anti-aliasing, so no edge of a face behind shows through); buildings
  and trees from z14, trees from z15, street names from z14 (main) and z15.5,
  districts out to z14.
- **Walkers**: `npx tsx scripts/iso/walks.ts` writes
  `lib/iso-walks.generated.ts` — the streets the map draws, as a network on
  the terraces, with the stretches where a walker would be out of sight
  (something nearer in the drawing covers their middle or head; a climb up
  a terrace wall is always out of sight). `npx tsx scripts/iso/walker-icons.ts`
  prints the architects (`lib/walker-cast.ts`, shared with the cover) at
  three points of a stride, facing either way, to `assets/walkers/`.
- `scripts/iso/preview.ts` and `city-proof.ts` proof the scene as a PNG.
- `__tests__/iso.test.ts` checks the projection and that every walk has a
  plate with a model and flag for each stop.

## Illustration
Flat cut-paper prints after the Showa travel labels: a handful of shapes in
blue, vermilion, their tints, charcoal and the paper; suns, hills, trees and
buildings cut as silhouettes, windows as knocked-out grids. Every path gets a
slight seeded wobble so edges read as cut. The drawing kit is
`lib/cut-paper.ts`.
- **Walk labels** (`components/walk-label.tsx`): one scene per walk on a
  label shape — the Campanile against the sunset for the campus, the
  Claremont lit at night, Rose Walk up the hill. On the Tours contents
  (alternating sides down the page, the guide's portrait tucked against
  the label) and each walk's opener.
- **Registry frieze**: a street of Berkeley buildings in cream line knocked
  out of a blue band, under the Registry's opener.
- Both are baked by `npx tsx scripts/build-print-art.ts`
  (→ `components/print-art.generated.ts`; `--preview <png>` for a sheet).
- **Index letters**: each letter of the Registry cut out of a block of ink,
  the shapes running circle, square, arch, gable.
- **Drawn plates** (`lib/building-plate.ts`): a landmark without a
  photograph gets a plate drawn at run time — a building of its style and
  kind (Arts & Crafts, bungalow, Period Revival, Victorian, Queen Anne,
  Classical, Mediterranean, Art Deco, Modern, storefront, industrial,
  church, Collegiate Gothic, shellmound; historic districts as a row of
  three), its colours, sun and trees seeded by the landmark's id. Captioned
  as an impression, never passed off as the building.

## Architects
Flat cut-paper figures on geometric label shapes
(`scripts/portraits/*.svg`, baked by `node scripts/build-portraits.mjs`):
Maybeck (arch), Morgan (circle), Howard (tall panel), Ratcliff (square),
Hays (gable), and six more on shapes from their own work: Coxhead (Gothic
lancet), John Hudson Thomas (notched Secession square), Plachek (Art Deco
ziggurat), Gutterson (octagon), Yelland (storybook gable), Esherick (Sea
Ranch shed roof). No photographs of the later six were to hand, so theirs
are period caricatures rather than likenesses.
Shown on their entries, the walks they lead, index headings and the
Appendix; matching in `lib/architects.ts`.

Each has a biography page (`app/architect/[key].tsx`), from the Appendix
("Biography" under their entries), their entries and the walks they lead:
the portrait held at the head of the page, going through its gestures on a
clock (`loop`), the name beside it; the life below, scrolling, with notes to
its sources; then their entries in the guide. The lives
(`lib/architect-bios.ts`) are written from their Wikipedia articles and the
sources those cite — for Hays, Plachek, Gutterson and Yelland, who have no
article, from the Wikipedia articles that mention them and the archives
they cite (UC Berkeley's Environmental Design Archives, PCAD). Notes are
`[n]` in the text; `__tests__/architect-bios.test.ts` checks every note has
a source and every source a note.

## Photographs
An entry's lead photograph prints as its plate; when it has more — the
guide's own (`photos` on the landmark) and readers' approved ones — a
gallery of small numbered plates scrolls sideways above "Nearby", and any
photograph opens full size, in colour, to swipe through with its credit.
`node scripts/fetch-gallery-photos.mjs` finds candidates on Commons for
review; `--apply picks.json` writes the chosen ones in.

Signed-in readers can add up to three photographs to an entry, suggest a
correction, and propose a new place from the Appendix (name, address, why it
belongs, up to four photographs) — `app/propose.tsx`,
`server/proposalsRouter.ts`, checked by `shared/proposals.ts`. The editors
review all three in `/admin`, which answers only a signed-in admin.

Landmark photos are Wikimedia Commons thumbnails at a width Commons serves
(landmarks without one get a drawn plate, above);
`node scripts/fix-photo-urls.mjs` re-resolves them through the Commons API
and checks every link (`--check` to only check).

**Offline.** The guide works with no signal. Every photograph in it is
printed into the app: `node scripts/bundle-photos.mjs` fetches each one
(lead plates and galleries), prints it 960px wide through mozjpeg into
`assets/photos/`, asks Commons who took it and on what licence, and writes
`lib/photos.generated.ts`; `photoSource()` serves the bundled print wherever
the URL appears, and `photoCredit()` its credit, set small under the plate.
Re-run it after adding photographs. The large map is bundled PMTiles and
glyphs; the fold-out maps are baked. Only readers' photographs, sign-in and
sending things to the editors need the network.
`__tests__/offline.test.ts` fails if a photograph isn't bundled.
Both maps carry the OpenStreetMap credit (ODbL).

## The reader's copy
What the reader does with the guide is kept on the phone
(`lib/reader-copy.ts`, kept by `lib/reader-copy-context.tsx`), with the day:
Stamps are earned on the spot (`lib/arrival.ts`):
- **Visited**: a vermilion date stamp under an entry's address — "Mark as
  visited" finds the reader and presses it on (heavy haptic) only if they're
  there: within 60 m of the building, 300 m of a historic district's middle,
  on a fix good to 100 m. Otherwise a note says how far away they are, or
  why the guide can't tell. Tap a stamp to erase it.
- **Walk labels**: in walk mode (which follows the reader's location from
  the start), standing within 40 m of a stop — or of where the route passes
  it — on a fix good to 50 m collects its travel label, dated, and counts as
  a visit; any of the walk's stops, in any order. Reaching the next stop
  moves the walk on. "On to stop n" steps on by hand and collects nothing.
  The card's ticks show the labels collected, the stop ahead in vermilion.
- **Walked**: with every label collected, the walk gets a ring stamp over
  its label on its page, a tick on the Tours contents, and its stamp in the
  Appendix. There's no stamping it by hand.
- **Turned-down pages**: the corner in an entry's running head.
- **Stamps** (`app/stamps.tsx`, from the Appendix): the walks as a passport
  page — each walked walk's label with its ring stamp — then places visited,
  day by day, and pages turned down. The Registry marks visited entries
  with a tick and turned-down ones with a corner.
Silence is a feature: no notifications, no badges, nothing asks the reader
back. Location is asked for only on the map, a walk, "near me", or to stamp
a visit.

## Colophon
The Appendix's colophon credits the typefaces (Jost, Berkeley Post, Noto
Sans on the maps), the inks and stock, the sources of the registry, the maps
(OpenStreetMap) and the lives, and every Commons photographer by name
(`lib/credits.ts`, from the bundled credits). "About this guide"
(`app/about.tsx`) says how each part was gathered.

## Motion
Page turns, entry leaves, ribbons drawn out, cover printing, printed matter
fading up on reveal (labels and the frieze with it), labels and portraits
laid down as an entry settles, the fold-out map. Eased curves, no springs or bounce.
Reduce Motion swaps turns for dissolves and skips the rest.

### Living illustrations
The art moves the way a paper toy does: pieces slide, fold and swap; nothing
wobbles or morphs into something else.
- **The page's scroll is the clock** (`components/scroll-clock.tsx`): every
  scrolling page (the Tours, a walk, an entry, the Registry, the Appendix)
  provides its offset, and the art on it follows.
- **Architects**: every so far down (or up) the page, each on-screen portrait
  plays the next gesture in its own loop — a blink or a double blink, a
  smile (the mouth swapped for its smiling piece, the eyes narrowing), raised
  brows, a glance aside (`LIFE` in `components/architect-portrait.tsx`;
  Maybeck smiles most, Howard hardly at all). Gutterson's pipe puffs. They
  blink once when they're laid down, and are still between gestures. The
  moving parts are marked in the portrait sources (`data-anim="eye" | "brow"
  | "mouth" | "smoke"`, the smile as `data-smile`, a path of the same shape
  as the mouth).
- **Walk labels**: the sun or moon crosses the label's sky as the label
  travels up the screen — rising from behind the scenery, standing where it
  was drawn at mid-screen, setting on the far side (Piedmont's sinks straight
  into its vanishing point); clouds drift. Marked `data-anim="sky" | "cloud"`
  by `sun()`, `moon()` and `cloud()` in `scripts/build-print-art.ts`.
- **The cover**: the architects, drawn a little larger than the device's own
  scale, walk the streets of the Campanile device — stepping up from a
  street's end at the slab's rim, turning at crossings at random, stopping
  now and then, passing behind the tower, stepping off again; never more than
  five at once (`components/logo-walkers.tsx`). The street network and a
  tower-only print to lay over anyone behind it are read off the artwork by
  `python3 scripts/logo-streets.py`.
- **How it stays smooth**: a drawing is printed as a stack of sheets
  (`splitSheets` in `lib/svg-tree.ts`, drawn by `components/living-svg.tsx`)
  — scenery on its own sheets, each moving part on a small sheet of its own —
  and the moving sheets are slid, squashed and faded as views, so nothing is
  redrawn as they move. (Animating SVG attributes instead sends every frame
  through a full React Native commit; a page of portraits doing that dropped
  to ~45 fps while scrolling.) Only a sun, which must stay inside its label's
  shape, moves by its SVG attributes, and only while its label is on screen.
  Portraits off screen skip their gestures.
- Worklets keep their logic in module-level functions: the React Compiler
  lifts small inline callbacks out of component code, which breaks them on
  the UI thread.
