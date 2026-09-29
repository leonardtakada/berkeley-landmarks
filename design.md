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
  page, so a turn clears them first: the tapped ribbon curls up off the page
  like paper — rolling from its cut end toward the reader, the underside of
  the roll showing — while the others fade out. It unrolls onto the new page
  as the leaf lands (in solid blue if its section opened) and the others fade
  back. The ribbon is cut into slices laid along the curve in one shared
  perspective. The leaf starts `PAGE_TURN_DELAY_MS` behind the curl.
- **Sections**: leaves bound at the left spine, ~650ms page turn
  (`components/book-pages.tsx`). Part One The Tours, Part Two The Registry,
  Appendix. The book begins at the head-band: the strip above it (the status
  bar) is not the book, and stays put in the open page's stock — paper, or
  the board on the cover — while the leaves turn in a clipped frame below.
  A leaf turns in perspective about its top edge, so that edge runs along
  the band instead of rising past it, and the ribbons always hang over paper.
  (The frame clips, so a lifted leaf can't be drawn over the ribbons.)
- **Entries**: leaves laid over the book, hinged at the right
  (`lib/page-turn.ts`); swipe back from the left edge.
- **Map** (`app/map.tsx`): the live canvas has no texture; its chrome is
  flat slips. The camera follows the reader: a landmark flies in above its
  sheet; "the large map" frames the whole walk; "set out on foot" starts at
  stop 1, and each step frames the leg of the route between two stops
  (`lib/route-legs.ts`). Camera moves wait for the map to load.
- **Fold-out map** (`components/fold-out-map.tsx`): folded, a blue cover
  naming the walk, its length, the streets it follows and a locator; open,
  the route over the street plan (baked per walk from OpenStreetMap by
  `scripts/bake-walk-streets.ts`), with street names, numbered stops, start
  and finish, a locator, scale and north point. Where stops crowd together
  (a street of one architect's houses) their numbers stand aside on short
  leaders so each can be read.
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
