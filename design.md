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
  CATALOGUE, THE ARCHITECTS — are set in **Berkeley Post**, the guide's own
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
  Landmarks, Appendix, all hanging the same length. The open section is solid blue;
  the rest are blue tint. Eased motion, no bounce. They lie over the open
  page, so a turn clears them first: all of them fade out quickly, change
  while they're away, and fade back as the leaf lands — nothing moves but the
  leaf, which starts `PAGE_TURN_DELAY_MS` behind the fade.
- **Sections**: leaves bound at the left spine, ~500ms page turn that
  lands flat rather than easing to rest (a leaf creeping its last degrees
  drew its type soft, read as a blur; `PAGE_EASING` in `lib/page-turn.ts`).
  A page doesn't have to look tilted to look soft: measured in the
  simulator, a leftover 0.05° costs about a tenth of its fine detail (paper
  tooth, type edges), 0.2° nearly a fifth. So a leaf within 0.2° of flat is
  laid flat at once (no transform at all, not `rotateY(0)`), and the book's
  own card, which never turns, carries no perspective matrix (`forResting`)
  (`components/book-pages.tsx`). Part One The Tours, Part Two The Catalogue,
  Appendix. The book begins at the head-band: the strip above it (the status
  bar) is not the book, and stays put in the open page's stock — paper, or
  the board on the cover — while the leaves turn in a clipped frame below.
  A leaf turns in perspective about its top edge, so that edge runs along
  the band instead of rising past it, and the ribbons always hang over paper.
  (The frame clips, so a lifted leaf can't be drawn over the ribbons.)
  The leaf is flat paper all the way over: no shading as it tilts and no
  shadow cast on the page beneath, which read as a blur. The page beneath
  is fully printed before it's uncovered — nothing on it fades or settles
  in after the turn.
- **Entries**: leaves laid over the book, hinged at the right
  (`lib/page-turn.ts`); swipe back from the left edge. A tiny haptic tick
  as a leaf turns over (the ribbons tick too). No shade or edge shadow.
- **The Catalogue's index** (`lib/catalogue-index.ts`): Find reads a query
  the way a reader puts it — "every Maybeck within walking distance",
  "Queen Anne in Elmwood", "1920s downtown" — into terms of the index
  (architect, style, district, era), shown as slips that can be taken out;
  terms of one kind widen, of different kinds narrow; other words are looked
  for anywhere in an entry. If nothing answers the terms, the query is read
  as plain words. "Near me" (Where, or said in the query) keeps what's
  within a quarter hour's walk, nearest first, in bands of five minutes.
  Order by name, year, architect, style or district; tapping a heading
  narrows the index to it. `__tests__/catalogue-index.test.ts`.
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
  Opened on its own, the map starts at z14.6 on downtown and the campus's
  west edge, where the landmarks gather — buildings and single landmarks in
  view, not the whole city in clusters.
  Pressing a landmark — its pin, or close in (z14.5+) its building, from the
  foot up past the pin and about its width either side — lays its entry
  over the foot of the map, and the map slides only if the landmark would
  be hidden under it. Pressing a cluster draws in on it; pressing the
  ground puts the entry away. (A pin's press stops there: the map would
  otherwise hear it too and put the entry straight away again.)
  Berkeley walks its streets from z15.6 (`components/iso-walkers.tsx`):
  townsfolk of today in the guide's blue and vermilion (`TOWNSFOLK` in
  `lib/walker-cast.ts`: a student with a backpack, a flat cap, a bobble hat,
  a tote, a stick…), and now and then — one at most, only within a few
  hundred metres of one of their own buildings, and unlabelled: an easter
  egg for those who know the cover — an architect in a period suit, beard
  or hat. A few in view, strolling on the right of the street, turning at
  corners, stopping; cut off along the line of whatever stands in front of
  them — a roof's sloping eave, a gable's peak, a corner, a tree's crown
  (`scripts/iso/walks.ts` says where; `lib/walker-cover.ts` cuts the figure
  along it) — and hidden where all of it is. New ones arrive
  only out of view or from behind something, and leave the same way —
  nobody pops up or vanishes in plain sight. Each is drawn as flat shapes on the drawing (`lib/walker-shapes.ts`:
  keyline, coat, head, hat), the legs swinging and the body sinking as
  they part, with the stride matched to the pace so the feet don't slide.
  The stroll runs on the UI thread and hands the map GeoJSON 30 times a
  second (shapes, not icons: icons are re-placed on each update and
  blink); the walk's route lies under them. Still with Reduce Motion.
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
guessed from kind and size), flat-shaded in two tones lit from the west,
casting a flat shadow east-south-east onto their own terrace (buildings of
8 m and more: a house's shadow is a sliver hidden behind it, not worth its
bytes); ordinary flat roofs a step darker than the street, houses' roofs a
tint of their own; lollipop trees of varied size, each crown lit on the
west. Buildings OpenStreetMap draws as multipolygons (courtyards: Doe,
Hearst Gym, the City Club…) come from `data/osm-building-relations.json`
(Overpass; it refuses a request without a User-Agent). The pieces are laid
back to front (`scripts/iso/scene.ts`).
- **Landmark models** (`scripts/iso/models.ts`): every catalogue landmark is
  built as a model rather than a vermilion box — walls, storeys of windows
  (plain, arched, two-storey colonnade bays, open bays, modern bands), a
  cornice, and a roof (gable, hip, mansard, pyramid, spire, dome; a big
  hipped roof becomes a band of slopes round a deck). Materials stay in the
  two inks: stone, stucco and painted wood in paper; brick and brown shingle
  in a vermilion tint; red tile in vermilion; slate in blue; copper pale
  blue. The landmark's mark is its vermilion shade wall. The photographed
  ones are described part by part in `scripts/iso/landmark-models.ts`, each
  with a line on what its photographs show (the Campanile's shaft, belfry,
  pinnacles and copper spire; City Hall's cupola; South Hall's brick and
  mansard; Doe's colonnade; the Stadium's ring of arches…); the rest are
  modelled from their style (`fromStyle`). The same models stand on the
  city map and, enlarged, on the walk plates. Edit a model, then re-run
  `city.ts`, `walks.ts` and `plates.ts`.
- **The catalogue's icons**: `npx tsx scripts/iso/icons.ts` bakes each
  landmark's model (the same as the city map's: after its photographs where
  it has them, else after its style) standing on a little plinth cut from
  the city — a lawn for a house, the ground's tint for the rest — to
  `assets/icons/<id>.png` (132 px, 44 pt at 3×; palette PNGs via sharp, ~1.2
  MB for all 392), listed in `components/landmark-icons.generated.ts` and
  shown beside each entry in the Landmarks list. An entry with no footprint
  of its own takes its twin entry's building (and model), else the building
  it stands in, else one of a size for its kind; the few sites that aren't
  buildings are vignettes (a rock and an oak, a shellmound, a park's trees,
  a tree-lined way). Re-run it after editing a model.
- **The green, and the inland water** (`scripts/iso/greens.ts`): the one
  touch of a third ink, kept to the green alone — a sea green, with enough
  blue in it to sit among the map's blues (`INKS.lawn`, `SOFT_TREES` in
  `scripts/iso/paint.ts`, shared by the map, the plates and the icons). Parks, lawns, gardens and
  the cemetery are a pale green ground (a shade deeper on alternate
  terraces); playing fields carry chalk lines (touchline, halfway line,
  centre circle), hard courts are a deeper green with their outline and net;
  lakes and lagoons (Anza, Temescal) are the Bay's blue with its ruled
  waves. Each is laid on the terraces it lies across — on one level, whole;
  across several, cut on a fine grid to the terraces as drawn, a little
  inside their edges — so none floats over a lower one. Creeks
  (`data/osm-waterways.json`, where they run in the open, not culverted)
  are a ribbon of the blue's shade, broken where they fall over a terrace's
  edge.
- **Trees by where they grow** (`treePieces` in `scene.ts`): the streets'
  and gardens' stay round in the map's blue; a park's are round and green,
  gathered in groves with open lawn between (the meadows stay meadows); the
  wild land — high on the hills with no house near, and the hill parks — is
  wooded with pines (three tiers, one silhouette, each tier's western half
  lit), tall ragged eucalyptus and oaks, all green and a little thicker; the
  cemetery has cypresses in rows. None on a field or in a lake.
- **Walk plates**: `npx tsx scripts/iso/plates.ts [walk…]` bakes each walk's
  block to `assets/plates/<walk>.png` and writes
  `components/walk-plates.generated.ts` (route, models, flags, labels,
  pixels to a metre); `scripts/iso/proof.ts` proofs one as the app draws it.
  The walk stands out of its block: the buildings, trees and shadows within
  55 m of the route print in full ink, and recede into the ground's tint
  the further off they lie (most of the way by 230 m; the catalogue's
  landmarks less so); the trees are the city map's soft blue and green, not
  specks of ink. Over the plate (`components/iso-plate.tsx`): the route's
  ends marked as a line's stations, a compass rose (its needle vermilion to
  the north), and a scale of round metres, blue and paper. (In a dev build
  with Metro stopped, the plate's image goes and only the route and models
  are left: start Metro before judging it.)
- **The city map**: `npx tsx scripts/iso/city.ts` writes
  `assets/map/iso.pmtiles` — the scene laid out on MapLibre's globe as if its
  metres were at 0°, 0° — and `lib/iso-terrain.generated.ts`, the terraces
  the app lifts pins, routes and the reader onto (`lib/iso-map.ts`). Style:
  `lib/iso-style.ts`, one fill layer in the drawing's order (fill sort key,
  no anti-aliasing, so no edge of a face behind shows through); buildings
  and trees from z14, trees from z15, street names from z14 (main) and z15.5,
  districts out to z14; creeks from z13; `lawns` (z16, never drawn; also
  textured by `lawn-texture`) is each lawn's own part in sight, where the
  wind blows.
- The city tiles are ~22 MB: shadows, the trees' highlights, the landmarks'
  detail and the wooded hills each cost a megabyte or two, so check
  `city.ts`'s size line after adding anything drawn many times.
- **Grass in the wind**, as an animated film paints a meadow — the field,
  not blade by blade (single tufts read as stamped icons, and were dropped).
  The lawns carry a painted texture from z16 (`lawn-texture` in
  `lib/iso-style.ts`: a seamless tile of fine tapered blades leaning east,
  from `scripts/iso/grass-texture.ts`, which paints the same blades three
  ways — `grass` at rest, `grass-bent` pressed over, `grass-back` springing
  back — registered as images in `components/maplibre-view.tsx`). Over it
  the wind (`components/iso-grass.tsx`, `lib/grass.ts`), never even: it
  rises and falls (`gustiness`: its speed a sum of slow sines, the waves'
  travel its integral, so they hurry in a gust and dawdle in a lull); its
  crests are unevenly spaced and each builds and dies as it goes, broken into
  patches that drift along it; small quick flurries run between in a gust.
  Each crest is cel-shaded in three hard-edged steps — a shadow in its wake
  showing the grass springing back, a band of light showing it pressed over
  (the grass-back and grass-bent textures, which line up with the grass at
  rest, so the same grass seems to bend), a brighter core — with bright
  streaks streaming through, long white wind lines riding it, and leaves
  tumbling ahead. The bands are cut to the lawns on the UI thread fifteen
  times a second (as a film draws on twos), from the tiles' unseen `lawns`
  the map reports in view when it comes to rest — each lawn's own visible
  part, no two overlapping (a smaller lawn, a court or a lake is cut out of
  the one it lies in; the layer has no tile buffer, so its pieces meet edge
  to edge). The wind's time is the wall clock's (`windTime`), shared with the
  trees. With Reduce Motion the light lies still.
- **Trees in the wind** (`scripts/iso/sway.ts`, `components/iso-tree-sway.tsx`):
  the crowns with nothing drawn in front of them — as far as they may lean,
  0.8 m — go into the tiles' `sway` layer (about one crown in two), dealt
  into four groups and drawn over everything standing, so each group can be
  moved whole by its `fill-translate` without the drawing's order coming
  wrong. A few times a second each group leans east with the wind's strength
  and flutters in its own time; the map glides between (a 260 ms
  transition). Trunks stay put. Still with Reduce Motion.
- **The walks on the city map** (before one is chosen): each walk's ground
  outlined and labelled. `npx tsx scripts/iso/walk-outlines.ts` traces the
  outline: everywhere within 60 m of the route and its stops, bays narrower
  than about 440 m filled in and corners rounded (a 220 m closing on a 5 m
  grid), the outer edge only (a loop's middle is the walk's too). It then
  smooths and simplifies the outline and writes it anticlockwise to
  `lib/walk-outlines.generated.ts`. Each walk is inked blue or vermilion,
  chosen so the walks that overlap most differ, so crossing outlines can be
  followed. The outline is a fine line with a screened band along its
  inside (`line-offset`), printed over the drawing under the walkers
  (`components/walk-outlines.tsx`). The label is baked to
  `assets/map/walks/<id>.png` (@2x, @3x) in Jost: the walk's travel label
  from the Tours page laid over the end of a paper slip with "WALK 07" and
  the name, hung on a fine line in the walk's ink down to a dot on the
  outline. Each label is pinned where it covers least of the other labels,
  the other outlines and the pins at the map's opening zoom, preferring the
  top of its own outline. On the map the labels sit over the pins
  (`afterId` the cluster counts). Where labels collide further out, the
  earlier walks' win (`symbol-sort-key`). Pressing a label lays out its
  walk. Re-run the script after a walk's route or stops change (the test
  checks every route point and stop lies inside its outline).
- **Walkers**: `npx tsx scripts/iso/walks.ts` (about a minute) writes
  `lib/iso-walks.generated.ts` — the streets the map draws, as a network on
  the terraces, and for each lane (either side of a stretch, where walkers
  keep right) how much of a walker there something nearer covers, found
  exactly along each ray toward the reader: trees by the shapes the map
  draws, buildings as solids with their true roofs (a house's gable, a
  model's hip, mansard, spire or dome), nearer terraces. Most lanes get a
  *skyline* — how far up the line over each point along the lane is covered
  (every 0.2 m across the drawing, in 0.3 m levels) — which each walker
  reads across the width of their figure, so a cut slopes with an eave and
  steps at a corner. That's exact at the figure's middle and slightly off
  at its edges (the edges stand a little nearer or further than the lane's
  point there), so lanes whose depth changes more than 2.5 m per metre
  across the drawing — those running toward the reader — are told cover by
  cover instead (11 columns across the figure, 24 levels up it, every
  metre). Every line is rounded to cover more, never less. Covered all the
  way up is out of sight (a climb up a terrace wall always is); glimpses
  under 8 m and cover under 6 m are smoothed away so no one blinks. The
  covers are packed as base-64 strings (≈1.4 MB with the network); a check
  against the slow ray-by-ray truth found 0.3% of covered figure left
  showing, all of it slivers by a tree or a corner at the walker's own
  depth. The figures are the cover's (`lib/walker-cast.ts`), turned into
  polygons by `lib/walker-shapes.ts`.
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
- **Catalogue frieze**: a street of Berkeley buildings in cream line knocked
  out of a blue band, under the Catalogue's opener. It's the city map,
  folded — its cover — and "Unfold the city map" sits under it. Pressed
  (`components/plate-unfold.tsx`, `lib/map-plate.ts`), it lifts off the page
  to the strip of the screen it's nearest, growing to the screen's width;
  the page beneath darkens a shade. The map is folded as a strip map, in
  strips as wide as the screen and as deep as the plate (six on most
  phones), so the plate is one strip and its cover is the next strip's
  back: the cover swings open toward the side with more to unfold, and the
  strips fan out from there both ways, one after another. Seen flat, from
  straight above: a strip swinging down shows as much of its depth as it
  lies flat, shaded while it's steep; the map itself shows only where the
  paper lies open, so it's the live map that opens out, and the folds stay
  pressed in (a faint line each) until it's all flat, then relax away.
  The map's slips (Close, the legend, where-am-I) come in as it lands.
  Closing it, any way, runs it all backward into its place on the page,
  which is empty while the map is out. The lifted plate waits for the
  map's first frame (at most 1.2 s) before it opens. Reduce Motion opens
  the map as any other way in does.
- Both are baked by `npx tsx scripts/build-print-art.ts`
  (→ `components/print-art.generated.ts`; `--preview <png>` for a sheet).
- **Index letters**: each letter of the Catalogue cut out of a block of ink,
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
Re-run it after adding photographs (the guide editor does, on save);
photographs uploaded there are `upload:` names it only lists. The large map is bundled PMTiles and
glyphs; the fold-out maps are baked. Only readers' photographs, sign-in and
sending things to the editors need the network.
`__tests__/offline.test.ts` fails if a photograph isn't bundled.
Both maps carry the OpenStreetMap credit (ODbL).

## Editing the guide — `scripts/editor/`
`pnpm editor` opens a page at http://localhost:4777 for adding and managing
landmarks and walks. It runs on this machine, not through the live server,
because it writes the files the app is built from. By default it answers
only to localhost and refuses anything cross-origin; "Phone" in the header
lets an iPhone in (below).

- **What it writes:** `data/landmarks.ts` (what the app reads) and
  `data/landmarks.json` (the mirror the admin page and photo scripts read),
  and `data/tours.ts`. An edit replaces that entry's block and nothing else,
  so git shows only what changed; each save backs up the files it touches to
  `scripts/.cache/editor-backups` and reads the data back to check, undoing
  the save if it isn't what was meant. The database isn't touched
  (`server/seedLandmarks.ts` syncs it).
- **Landmarks:** search and filter; every field; a map to place the pin; a
  photograph gallery; a warning when a place repeats another's name, street
  address or spot.
- **The pin:** type a street address and the pin is placed from it
  (OpenStreetMap's Nominatim, asked from the server at a request a second).
  A pin placed by hand is never moved on its own; on an existing landmark
  a changed address only offers to move it. Check the pin is on the
  building: a street with no match places it on the street.
- **Landmark number:** the city's own designation number (#1 is City Hall;
  there are gaps, and the Landmark, Structure of Merit and District series
  repeat numbers), so it is typed, never worked out. "5" is written #5, a
  repeat within a designation is warned of, and the field shows the highest
  in use. Leave it blank for a place the city hasn't designated.
- **Uploaded photographs:** drop files on the Photographs card or use
  Upload. Each is turned upright, flattened onto white, resized to 960px
  wide (never enlarged) and printed through mozjpeg exactly as
  `bundle-photos.mjs` prints the rest (`scripts/editor/photos.ts`; JPEG,
  PNG, WebP, AVIF, and HEIC, which macOS's `sips` converts first). The print is named for its bytes
  (`u-<hash>.jpg`), waits in `scripts/.cache/editor-uploads` until the
  landmark is saved, then joins `assets/photos`; the data names it
  `upload:u-<hash>.jpg`, and `data/photo-uploads.json` says who took it (a
  credit is required). The original is kept in `scripts/.cache/photos`.
  Saving a landmark whose photographs changed runs the bundler, which lists
  uploads without fetching them. The colophon names an upload's
  photographer among the other sources (`lib/credits.ts`). A landmark that a
  walk uses can't be deleted. Places that are only in the JSON are listed
  for review, with those that copy a place the app already has marked.
  Where the JSON and the app differ (a reader's approved edit lands only in
  the JSON), the entry says how, and either can be made to match the other.
- **Walks:** name, colour, notes, and stops — added by search (nearest to the
  last stop first), reordered, removed. Changing the stops resets the route
  to a straight line (flagged "route") until it's redrawn; a note change
  keeps it.
- **After an edit:** the page shows what's left to do and runs it — print
  new photographs (`scripts/bundle-photos.mjs`), draw a walk's route and
  street names (`route-walks.ts`, `bake-walk-streets.ts`), print its
  fold-out map (`scripts/iso/plates.ts`), and check the data. Only those
  scripts, with a walk's id as the one argument.
- **On an iPhone:** the same page is the phone's: at 820px or narrower it
  shows one screen at a time (the list, then the place; Back and the edge
  swipe return through the history), the page itself scrolls, inputs are 16px
  so iOS doesn't zoom, and Save/Revert sit in a bar along the bottom once
  something has changed. Photographs come from the camera or library
  ("Take or choose photographs"); the phone redraws a large one at 2400px as
  a JPEG before sending (a 4000px photo goes as about 600 KB; the server
  still prints it at 960), and the last credit typed is offered for the next
  upload. The header's tools fold into "Tools" above the list. It can be
  added to the Home Screen (`/icon.png`).
- **Letting a phone in** (`scripts/editor/phone.ts`): "Phone" in the header
  (shown only on this Mac) is a switch, off by default and remembered in
  `scripts/.cache/editor-phone.json`. On, the editor listens on every
  interface and answers to this Mac's own names, and only those: its
  Tailscale name, its `.local` name and its IPs (so a page that points its
  own domain here still arrives with the wrong Host). A browser on this Mac
  asking for localhost needs nothing; anything else must send the cookie
  that comes from typing the passcode (`XXXX-XXXX-XXXX`, ~59 bits, shown in
  the Phone sheet with a QR code for the best address). Five wrong tries,
  then a minute's wait that doubles. The cookie is signed, HttpOnly,
  SameSite=Strict and lasts 90 days; a new passcode signs every phone out.
  `/api/phone` is for this Mac alone. It is plain HTTP, so on a shared
  Wi-Fi the passcode and edits travel in the clear; Tailscale (the
  `ts.net` name) encrypts them and works away from home. Anything carrying
  a proxy's headers (`X-Forwarded-For`, Cloudflare's) is never treated as
  local.
- `__tests__/editor.test.ts` checks the files come apart and go back
  together byte for byte, and that every entry survives a write;
  `__tests__/editor-phone.test.ts` checks the passcode, cookie, guess limit
  and which Host headers are let through.

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
- **Watched places** ("Watch this place" on an entry; `lib/watches.ts`,
  `lib/watch-places.tsx`, spec in `docs/nearby-notifications-requirements.md`):
  an OS geofence at the place's visit radius, so a notice — "You're at the
  door of…", "walking the edge of…" for a district — can come with the app
  closed. Never more than one an hour or three a day; tapping it opens the
  entry and retires the watch, as does stamping the place; a notice left
  unread re-arms after thirty days. Twenty at most (iOS's region limit);
  half a year on, the entry asks "still watching?". Always-location and
  notices are asked for only at the tap; refused, the watch is kept as a
  bookmark. A vermilion eye on the entry, ring in the Catalogue, pin on the
  map, and a list on the Stamps page.
  Built to survive the OS's habits: the task is defined when the module is
  first read (a fence wakes the app headless, before any screen); fences are
  re-set only when they change (each setting reports every fence the reader
  stands in as newly entered); every ledger change, here or in the task,
  goes through one lock; and each place's notice has one identifier, so a
  repeat replaces rather than stacks.
- **Stamps** (`app/stamps.tsx`, from the Appendix): the walks as a passport
  page — each walked walk's label with its ring stamp — then places visited,
  day by day, places watched, and pages turned down. The Catalogue marks
  visited entries with a tick and turned-down ones with a corner.
Quiet is a feature: no badges, nothing asks the reader back, and the only
notice is one the reader asked for by watching a place. Location is asked
for only on the map, a walk, "near me", to stamp a visit, or to watch a
place.

## Colophon
The Appendix's colophon credits the typefaces (Jost, Berkeley Post, Noto
Sans on the maps), the inks and stock, the sources of the catalogue, the maps
(OpenStreetMap) and the lives, and every Commons photographer by name
(`lib/credits.ts`, from the bundled credits). "About this guide"
(`app/about.tsx`) says how each part was gathered.

## Motion
Page turns, entry leaves, ribbons drawn out, cover printing, the fold-out
map. Pages themselves arrive printed: text, labels and portraits are sharp
from the first frame of a turn, never fading or settling in after it. Eased
curves, no springs or bounce.
Reduce Motion swaps turns for dissolves and skips the rest.

### Living illustrations
The art moves the way a paper toy does: pieces slide, fold and swap; nothing
wobbles or morphs into something else.
- **The page's scroll is the clock** (`components/scroll-clock.tsx`): every
  scrolling page (the Tours, a walk, an entry, the Catalogue, the Appendix)
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
