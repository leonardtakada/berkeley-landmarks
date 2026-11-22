"""Pocket guide case, study 03: the compass.

A round graphite body (63 x 25.6 mm) around the Waveshare ESP32-S3-Touch-AMOLED-1.75:
sharp 45-degree edge breaks, a flat bezel with engraved bearings and a north mark, a silver inlay ring at the
glass, a fine knurl band, two flush curved keys for PWR and BOOT,
and a caseback that holds the GPS patch and the speaker side by side, with a
sunflower-spiral speaker grille and the Campanile device engraved in two depths.

Run:   python device/enclosure/compass_case.py      (needs manifold3d, trimesh, numpy, scipy, pillow, contourpy)
Out:   device/enclosure/out/compass_*.stl, already turned to their print orientation,
       plus compass.glb (assembled, coloured) for the viewer.

Coordinates: x right and y up as you look at the screen, origin at the board's
centre; z = 0 is the outside of the caseback, z = DEPTH the bezel face.

How it holds together: the board drops into the body face first, glass against the
lip (a ring of thin double-sided foam tape on the lip seals it and takes up print
tolerance). The caseback's three posts land on the board's own standoffs and press
it forward; three M2 screws fix the caseback into heat-set inserts in the body.
Everything on the board's back (USB-C, microSD, switches) stays within its 3.5 mm
standoffs except one connector at the bottom edge, so the battery lies behind the
standoffs and the patch and speaker share the layer behind that.
"""

from math import cos, sin, radians, sqrt
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import CrossSection, JoinType, Manifold, OpType

SEG = 128

# ---- board -----------------------------------------------------------------
GLASS_D = 49.0         # display module diameter (measured)
GLASS_STEP = 2.05      # depth of the glass stack at full diameter (Waveshare drawing)
ACTIVE_D = 43.76       # lit area
PCB_D = 46.0           # (measured)
PCB_BACK = 6.9         # glass front to the back of the PCB (Waveshare drawing)
BOARD_DEPTH = 10.40    # glass front to the ends of the standoffs (Waveshare drawing)
CONNECTOR_DEPTH = 14.0 # glass front to the tip of the tall connector (measured)
CONNECTOR = (-7.0, 7.0, -21.0, -15.5)   # its footprint, at the bottom edge  (location told, size guessed)
STANDOFFS = [(0.0, 20.5), (13.75, -14.7), (-13.75, -14.7)]  # M2, female (Waveshare drawing)
BUTTON_ANGLE = 34.0    # PWR at +34 deg, BOOT at -34 deg (Waveshare drawing)
BUTTON_R = PCB_D / 2   # switch tips flush with the PCB edge (measured)
BUTTON_DEPTH = 6.4     # glass front to switch centre                MEASURE
SD_DEPTH = 7.8         # glass front to microSD slot centre          MEASURE
SD_CARD_R = GLASS_D / 2   # an inserted card ends flush with the display edge (measured)
USB_DEPTH = 8.5        # glass front to USB-C centre                 MEASURE
USB_W, USB_H = 8.94, 3.26                                # USB-C receptacle face
USB_FACE_X = -sqrt((GLASS_D / 2) ** 2 - (USB_W / 2) ** 2)  # its corners on the display circle (measured)

# ---- parts behind the board ---------------------------------------------------
PATCH = (27.0, 27.0, 6.85)      # ceramic GPS patch, lead out one side (measured)
SPEAKER = (20.0, 30.0, 7.0)     # w x h x t as placed: 30 long, standing on the y axis (measured)
BATTERY = (37.0, 20.0, 5.0)     # flat LiPo (measured)
PATCH_AT = (-23.9, -10.0)       # lower-left corner of the patch
SPEAKER_AT = (3.7, -12.3)       # lower-left corner of the speaker
BATTERY_Y = 2.0                 # battery centre; clears the standoffs and the bottom connector

# ---- case --------------------------------------------------------------------
R_OUT = 31.5                    # body radius (63 mm)
R_IN = 30.0                     # inside of the wall behind the board
FACE = 1.2                      # bezel thickness over the glass
LIP_D = 45.6                    # screen opening: covers the glass's black border
CLEAR = 0.2
GAP = 0.2                       # between stacked parts
CASEBACK = 1.4
EDGE = 0.3                      # every outside edge: a sharp 45-degree break, no rounds

DEPTH = round(FACE + BOARD_DEPTH + GAP + BATTERY[2] + GAP + max(PATCH[2], SPEAKER[2]) + GAP + CASEBACK, 2)
GLASS_FRONT = DEPTH - FACE
STANDOFF_END = GLASS_FRONT - BOARD_DEPTH
WIDE_TOP = STANDOFF_END - GAP           # the cavity widens to R_IN below here
BATTERY_Z = (WIDE_TOP - BATTERY[2], WIDE_TOP)
LAYER_Z = CASEBACK + GAP                # patch and speaker sit on the caseback

POCKET_R = GLASS_D / 2 + CLEAR          # glass and board pocket
CASE_SCREWS = [(27.5 * cos(radians(a)), 27.5 * sin(radians(a))) for a in (90, 225, 315)]
POST_R = 2.0                            # caseback posts onto the standoffs

# barrel bands, front to back, after a fast 50 mm lens: a narrower front ring, a smooth
# band that carries the keys, a fine straight knurl, a mount ring stepped in; hairline steps between
FRONT_RING = 3.6                        # height of the front ring
FRONT_STEP = 0.5                        # how much narrower it is
KNURL_Z = (4.6, 11.0)
BASE_Z = (0.0, 4.2)
BASE_STEP = 0.3
KNURL_RIBS = 180
INLAY = (23.6, 25.4)

# keys: curved tiles flush with the barrel, cut from the control band, each on a stem
KEY_HALF = 13.0                         # half-width in degrees (14.3 mm of arc)
KEY_H = 7.0                             # height along the axis
KEY_T = 1.6                             # tile thickness
KEY_TRAVEL = 0.6
KEY_GAP = 0.15                          # hairline round each key
STEM_STEP = 28.0                        # radius where the stem's guide narrows

# caseback: two matched circles, the speaker grille and the logo
SPEAKER_C = (SPEAKER_AT[0] + SPEAKER[0] / 2, SPEAKER_AT[1] + SPEAKER[1] / 2)
LOGO_C = (-SPEAKER_C[0], SPEAKER_C[1])
DISC_R = 9.2
GRILLE_HOLES = 100
LOGO_H = 12.5
LOGO_PNG = Path(__file__).resolve().parents[2] / "assets/images/logo-on-blue.png"
LOGO_TOWER = LOGO_PNG.with_name("logo-tower.png")   # same frame, the tower alone


# ---- helpers ---------------------------------------------------------------
def ops_add(ms):
    return Manifold.batch_boolean(ms, OpType.Add)


def circle(r, x=0.0, y=0.0):
    return CrossSection.circle(r, SEG).translate((x, y))


def slab(cs, z0, z1):
    return cs.extrude(z1 - z0).translate((0, 0, z0))


def cyl(r, z0, z1, x=0.0, y=0.0):
    return Manifold.cylinder(z1 - z0, r, r, SEG).translate((x, y, z0))


def cone(r0, r1, z0, z1, x=0.0, y=0.0):
    return Manifold.cylinder(z1 - z0, r0, r1, SEG).translate((x, y, z0))


def ring(r_in, r_out, z0, z1):
    return cyl(r_out, z0, z1) - cyl(r_in, z0 - 1, z1 + 1)


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def radial_rod(r, start, end, angle, z):
    return (Manifold.cylinder(end - start, r, r, SEG)
            .rotate((0, 90, 0)).translate((start, 0, 0))
            .rotate((0, 0, angle)).translate((0, 0, z)))


def chamfered_cyl(r, z0, z1, back, front):
    """A cylinder with 45-degree breaks on its back and front edges."""
    parts = [cyl(r, z0 + back, z1 - front)]
    if back:
        parts.append(cone(r - back, r, z0, z0 + back + 0.001))
    if front:
        parts.append(cone(r, r - front, z1 - front - 0.001, z1))
    return Manifold.batch_hull(parts)


def sector(r0, r1, a_mid, half_deg, z0, z1, n=48):
    a0, a1 = radians(a_mid - half_deg), radians(a_mid + half_deg)
    ts = np.linspace(a0, a1, n)
    pts = [(r1 * cos(t), r1 * sin(t)) for t in ts] + [(r0 * cos(t), r0 * sin(t)) for t in ts[::-1]]
    return slab(CrossSection([pts]), z0, z1)


def rrect(w, h, r, cx=0.0, cy=0.0):
    r = min(r, w / 2 - 0.01, h / 2 - 0.01)
    return CrossSection.square((w - 2 * r, h - 2 * r), True).offset(
        r, JoinType.Round, circular_segments=SEG).translate((cx, cy))


def port_x(x_out, x_in, w_y, h_z, r, zc, chamfer=0.4):
    """A rounded port cut along x from the outside (x_out) inward, its mouth broken at 45 degrees."""
    body_ = rrect(h_z, w_y, r).extrude(x_in - x_out).rotate((0, 90, 0)).translate((x_out, 0, zc))
    mouth = Manifold.batch_hull([
        rrect(h_z + 2 * chamfer, w_y + 2 * chamfer, r + chamfer).extrude(0.01).rotate((0, 90, 0)).translate((x_out, 0, zc)),
        rrect(h_z, w_y, r).extrude(0.01).rotate((0, 90, 0)).translate((x_out + chamfer + 1.0, 0, zc)),
    ])
    return body_ + mouth


# ---- body ------------------------------------------------------------------
def body():
    base = chamfered_cyl(R_OUT - BASE_STEP, 0, BASE_Z[1] + 0.05, EDGE, 0)
    barrel = chamfered_cyl(R_OUT, BASE_Z[1], DEPTH - FRONT_RING, 0.15, 0.15)
    front = chamfered_cyl(R_OUT - FRONT_STEP, DEPTH - FRONT_RING - 0.05, DEPTH, 0, EDGE + 0.1)
    shell = base + barrel + front

    cavity = [
        cyl(R_IN, -1, WIDE_TOP),                       # behind the board
        cyl(POCKET_R, WIDE_TOP - 0.01, GLASS_FRONT),   # board and glass pocket
        cyl(LIP_D / 2, GLASS_FRONT - 1, DEPTH + 1),    # screen opening
        cone(LIP_D / 2, LIP_D / 2 + 0.5, DEPTH - 0.5, DEPTH + 0.001),  # sharp break at the lip
    ]
    shell -= ops_add(cavity)

    # case screw bosses, merged into the wall, with heat-set insert holes
    for x, y in CASE_SCREWS:
        shell += cyl(2.8, CASEBACK, WIDE_TOP, x, y) ^ cyl(R_OUT - 0.5, 0, DEPTH)

    cuts = []
    for x, y in CASE_SCREWS:
        cuts.append(cyl(1.6, CASEBACK - 0.01, CASEBACK + 4.5, x, y))

    # keys: a window in the barrel for each tile, then the stem's stepped bore
    zb = GLASS_FRONT - BUTTON_DEPTH
    floor = R_OUT - KEY_T - KEY_TRAVEL
    gap_deg = KEY_GAP / R_OUT * 180 / 3.14159
    for a in (BUTTON_ANGLE, -BUTTON_ANGLE):
        cuts.append(sector(floor, R_OUT + 1, a, KEY_HALF + gap_deg, zb - KEY_H / 2 - KEY_GAP, zb + KEY_H / 2 + KEY_GAP))
        cuts.append(radial_rod(2.2, BUTTON_R - 1.0, STEM_STEP, a, zb))
        cuts.append(radial_rod(1.7, BUTTON_R - 1.0, floor + 0.1, a, zb))
    # microSD: a slot out from the card's end, its mouth broken, and a shallow fingertip scoop
    zs = GLASS_FRONT - SD_DEPTH
    cuts.append(box(SD_CARD_R - 2.0, R_OUT + 1, -6.4, 6.4, zs - 1.3, zs + 1.3))
    cuts.append(Manifold.batch_hull([box(R_OUT - 0.4, R_OUT + 1, -6.8, 6.8, zs - 1.7, zs + 1.7),
                                     box(R_OUT - 1.4, R_OUT - 1.3, -6.4, 6.4, zs - 1.3, zs + 1.3)]))
    cuts.append(Manifold.sphere(4.0, SEG).translate((R_OUT + 2.6, 0, zs)))
    # USB-C: port opening, then room for the plug's overmold back to the receptacle face
    zu = GLASS_FRONT - USB_DEPTH
    cuts.append(port_x(-R_OUT - 1, USB_FACE_X + 1.0, USB_W + 0.9, USB_H + 0.7, 1.4, zu, 0).mirror((1, 0, 0)).mirror((1, 0, 0)))
    usb = rrect(7.0, 12.6, 3.0).extrude(R_OUT + 1 + USB_FACE_X).rotate((0, 90, 0)).translate((-R_OUT - 1, 0, zu))
    mouth = Manifold.batch_hull([
        rrect(7.8, 13.4, 3.4).extrude(0.01).rotate((0, 90, 0)).translate((-R_OUT - 0.01, 0, zu)),
        rrect(7.0, 12.6, 3.0).extrude(0.01).rotate((0, 90, 0)).translate((-R_OUT + 0.4, 0, zu)),
        rrect(7.8, 13.4, 3.4).extrude(0.01).rotate((0, 90, 0)).translate((-R_OUT - 1, 0, zu)),
    ])
    cuts += [usb, mouth]

    # face: inlay channel, bearings every 5 deg, long every 30, a north mark
    cuts.append(ring(INLAY[0], INLAY[1], DEPTH - 0.6, DEPTH + 1))
    ticks, north = face_marks(DEPTH - 0.4, DEPTH + 1)
    cuts += [ticks, north]

    # barrel: fine straight knurl, hairline steps between the bands
    for i in range(KNURL_RIBS):
        a = radians(360 * (i + 0.5) / KNURL_RIBS)
        cuts.append(cyl(0.3, KNURL_Z[0], KNURL_Z[1], (R_OUT + 0.08) * cos(a), (R_OUT + 0.08) * sin(a)))
    cuts.append(ring(R_OUT - 0.3, R_OUT + 1, KNURL_Z[1], KNURL_Z[1] + 0.35))

    shell -= ops_add(cuts)
    return shell


def face_marks(z0, z1):
    """Bearings every 5 deg (long every 30) and the north mark; cut into the face, then paint-filled."""
    ticks = []
    for i in range(1, 72):
        r0, w = (26.6, 0.7) if i % 6 == 0 else (27.9, 0.45)
        ticks.append(box(r0, 29.6, -w / 2, w / 2, z0, z1).rotate((0, 0, 90 - i * 5)))
    north = slab(CrossSection([[(-1.5, 26.4), (1.5, 26.4), (0.0, 29.6)]]), z0 - 0.2, z1)
    return ops_add(ticks), north


# ---- keys ------------------------------------------------------------------
def key_cap(accent=False):
    """A curved tile, flush with the barrel, with one hairline groove across it. At angle 0, z centred on 0."""
    tile = sector(R_OUT - KEY_T, R_OUT, 0, KEY_HALF, -KEY_H / 2, KEY_H / 2)
    cuts = [radial_rod(1.48, R_OUT - KEY_T - 0.1, R_OUT - 0.6, 0, 0)]       # socket for the stem
    cuts.append(ring(R_OUT - 0.25, R_OUT + 1, -0.2, 0.2) ^ box(0, 40, -40, 40, -9, 9))
    # break the tile's outer edges like the barrel's
    cuts.append(ring(R_OUT - 0.15, R_OUT + 1, KEY_H / 2 - 0.15, KEY_H / 2 + 1))
    cuts.append(ring(R_OUT - 0.15, R_OUT + 1, -KEY_H / 2 - 1, -KEY_H / 2 + 0.15))
    return tile - ops_add(cuts)


def key_stem():
    """Shoulder rod: 3.9 mm in the guide (it can't come out), 2.9 mm through the wall into the cap."""
    inner = radial_rod(1.95, BUTTON_R + 0.2, STEM_STEP - KEY_TRAVEL, 0, 0)
    outer = radial_rod(1.45, STEM_STEP - KEY_TRAVEL, R_OUT - 0.65, 0, 0)
    return inner + outer


def key_grooves_fill():
    """The PWR key's centre groove, paint-filled red."""
    return ring(R_OUT - 0.24, R_OUT - 0.02, -0.19, 0.19) ^ sector(0, 40, 0, KEY_HALF - 0.05, -1, 1)


# ---- caseback --------------------------------------------------------------
def logo_regions():
    """The Campanile device traced from the app's artwork, sized for the caseback.

    Returns (deep, shallow) CrossSections centred on 0: the cream faces cut deeper than
    the orange ones, so the device keeps its light and shade in one colour. The streets and
    window slits are widened to 0.45 mm so they print."""
    from PIL import Image
    from scipy import ndimage
    import contourpy

    px = np.asarray(Image.open(LOGO_PNG).convert("RGBA")).astype(float)
    h_px = px.shape[0]
    mm = LOGO_H / h_px
    step = lambda d: max(1, int(round(d / mm)))
    ink = px[:, :, 3] > 128
    whole = ndimage.binary_fill_holes(ndimage.binary_closing(ink, iterations=12))
    # the tower stays solid (its slits are too fine at this size); a 0.4 mm moat parts it from the slab
    tower_px = np.asarray(Image.open(LOGO_TOWER).convert("RGBA"))[:, :, 3] > 128
    tower = ndimage.binary_fill_holes(ndimage.binary_closing(tower_px, iterations=8))
    slab_ = whole & ~ndimage.binary_dilation(tower, iterations=step(0.4))
    # the streets, widened to 0.45 mm
    streets = slab_ & ~ink
    width_now = 14
    streets = ndimage.binary_dilation(streets, iterations=max(0, int(round((0.45 / mm - width_now) / 2)))) & slab_
    slab_ = ndimage.binary_opening(slab_ & ~streets, iterations=step(0.12))
    ink = tower | slab_
    cream = ndimage.binary_closing(px[:, :, 1] > 170, iterations=6) & ink
    cream = ndimage.binary_opening(cream, iterations=step(0.15))

    def trace(mask):
        f = ndimage.gaussian_filter(mask.astype(float), 1.2)
        gen = contourpy.contour_generator(z=f, line_type="Separate")
        polys = []
        for line in gen.lines(0.5):
            if len(line) < 8:
                continue
            pts = [((x - px.shape[1] / 2) * mm, (h_px / 2 - y) * mm) for x, y in line]
            polys.append(pts)
        from manifold3d import FillRule
        return CrossSection(polys, FillRule.EvenOdd).simplify(0.01)

    return trace(cream), trace(ink)


def caseback():
    plate = chamfered_cyl(R_IN - CLEAR, 0, CASEBACK, EDGE, 0)
    parts = [plate]
    for x, y in STANDOFFS:     # posts that press the board's standoffs, a nub into each thread
        parts.append(cyl(POST_R, CASEBACK - 0.1, STANDOFF_END, x, y))
        parts.append(cyl(0.75, STANDOFF_END - 0.1, STANDOFF_END + 1.2, x, y))
    fences = []
    for (x0, y0), (w, h, _) in ((PATCH_AT, PATCH), (SPEAKER_AT, SPEAKER)):
        outline = rrect(w + 2 * (CLEAR + 0.8), h + 2 * (CLEAR + 0.8), 1.0, x0 + w / 2, y0 + h / 2)
        inner = rrect(w + 2 * CLEAR, h + 2 * CLEAR, 0.5, x0 + w / 2, y0 + h / 2)
        fences.append(slab(outline - inner, CASEBACK - 0.1, CASEBACK + 2.0))
    fence = ops_add(fences) ^ cyl(R_IN - CLEAR - 0.2, 0, DEPTH)
    for (x0, y0), (w, h, _) in ((PATCH_AT, PATCH), (SPEAKER_AT, SPEAKER)):
        fence -= slab(rrect(w + 2 * CLEAR, h + 2 * CLEAR, 0.3, x0 + w / 2, y0 + h / 2), 0, DEPTH)
    for x, y in STANDOFFS:
        fence -= cyl(POST_R + 0.3, 0, DEPTH, x, y)
    fence -= box(-1.0, 1.0, -30, 30, 0, DEPTH)            # gap for the patch's lead
    parts.append(fence)
    m = ops_add(parts)

    cuts = []
    for x, y in CASE_SCREWS:                               # countersunk M2
        cuts.append(cyl(1.15, -1, CASEBACK + 1, x, y))
        cuts.append(cone(2.15, 1.15, -0.01, 1.0, x, y))
    # a hairline ring just inside the rim
    cuts.append(ring(R_IN - CLEAR - 1.6, R_IN - CLEAR - 1.35, -1, 0.2))

    # speaker grille: a shallow dish with a sharp chamfered edge, perforated on a sunflower
    # spiral, the holes shrinking from 1.0 mm at the centre to 0.7 at the rim
    cx, cy = SPEAKER_C
    cuts.append(cyl(DISC_R, -1, 0.3, cx, cy) + cone(DISC_R + 0.3, DISC_R, -0.001, 0.3, cx, cy))
    golden = radians(137.50776)
    r_max = DISC_R - 1.0
    c = r_max / sqrt(GRILLE_HOLES)
    for k in range(1, GRILLE_HOLES + 1):
        r = c * sqrt(k - 0.5)
        d = 1.0 - 0.3 * (r / r_max) ** 1.5
        cuts.append(cyl(d / 2, -1, CASEBACK + 1, cx + r * cos(k * golden), cy + r * sin(k * golden)))

    # the logo in the matching circle: a hairline ring, the device cut 0.4 / 0.25 deep.
    # Mirrored in x so it reads the right way round when you turn the guide over.
    lx, ly = LOGO_C
    cuts.append(ring(DISC_R - 0.12, DISC_R + 0.12, -1, 0.25).translate((lx, ly, 0)))
    deep, shallow = logo_regions()
    cuts.append(slab(deep.mirror((1, 0)).translate((lx, ly)), -1, 0.4))
    cuts.append(slab(shallow.mirror((1, 0)).translate((lx, ly)), -1, 0.25))
    return m - ops_add(cuts)


def inlay_ring():
    return ring(INLAY[0] + CLEAR / 2, INLAY[1] - CLEAR / 2, 0, 0.6)


# ---- export ----------------------------------------------------------------
def to_trimesh(m):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3]
    f = np.asarray(mesh.tri_verts)
    return trimesh.Trimesh(vertices=v, faces=f, process=False)


def ghosts():
    pcb_back = GLASS_FRONT - PCB_BACK
    board = ops_add([
        cyl(22.3, pcb_back + 1.0, GLASS_FRONT - GLASS_STEP),                 # display body
        cyl(PCB_D / 2, pcb_back, pcb_back + 1.0),                            # PCB
        cyl(21.5, STANDOFF_END + 0.3, pcb_back) - ops_add([cyl(2.4, 0, DEPTH, x, y) for x, y in STANDOFFS]),  # parts on its back
        ops_add([cyl(1.6, STANDOFF_END, pcb_back, x, y) for x, y in STANDOFFS]),
        box(CONNECTOR[0], CONNECTOR[1], CONNECTOR[2], CONNECTOR[3], GLASS_FRONT - CONNECTOR_DEPTH, pcb_back),
        box(USB_FACE_X, USB_FACE_X + 7.3, -USB_W / 2, USB_W / 2,
            GLASS_FRONT - USB_DEPTH - USB_H / 2, GLASS_FRONT - USB_DEPTH + USB_H / 2),
    ])
    bw, bh, bt = BATTERY
    px, py = PATCH_AT
    sx, sy = SPEAKER_AT
    return [
        (board, (40, 80, 160), "ghost_board"),
        (box(-bw / 2, bw / 2, BATTERY_Y - bh / 2, BATTERY_Y + bh / 2, *BATTERY_Z), (200, 170, 60), "ghost_battery"),
        (box(sx, sx + SPEAKER[0], sy, sy + SPEAKER[1], LAYER_Z, LAYER_Z + SPEAKER[2]), (150, 150, 160), "ghost_speaker"),
        (box(px, px + PATCH[0], py, py + PATCH[1], LAYER_Z, LAYER_Z + PATCH[2]), (210, 190, 150), "ghost_patch"),
    ]


def main():
    out = Path(__file__).with_name("out")
    out.mkdir(exist_ok=True)
    bod, back, inlay = body(), caseback(), inlay_ring()
    cap, stem = key_cap(), key_stem()

    prints = {
        "compass_body": (bod, lambda m: m.rotate((180, 0, 0))),      # face down: flipped, not mirrored
        "compass_caseback": (back, lambda m: m),                     # outside down
        "compass_key": (cap, lambda m: m),                           # on its flat end, print two
        "compass_key_stem": (stem, lambda m: m.rotate((0, -90, 0))), # standing, print two
        "compass_inlay_ring": (inlay, lambda m: m),
    }
    for name, (m, to_bed) in prints.items():
        pm = to_bed(m)
        pm = pm.translate((0, 0, -pm.bounding_box()[2]))
        tm = to_trimesh(pm)
        tm.export(out / f"{name}.stl")
        size = np.round(tm.bounds[1] - tm.bounds[0], 1)
        print(f"{name:20s} {size} mm  {pm.status().name}  genus {pm.genus()}  {pm.volume() / 1000:.1f} cm3")

    zb = GLASS_FRONT - BUTTON_DEPTH
    placed = [
        (bod, "body"), (back, "caseback"),
        (cap.rotate((0, 0, BUTTON_ANGLE)).translate((0, 0, zb)), "key_pwr"),
        (cap.rotate((0, 0, -BUTTON_ANGLE)).translate((0, 0, zb)), "key_boot"),
        (stem.rotate((0, 0, BUTTON_ANGLE)).translate((0, 0, zb)), "stem_pwr"),
        (stem.rotate((0, 0, -BUTTON_ANGLE)).translate((0, 0, zb)), "stem_boot"),
        (inlay.translate((0, 0, DEPTH - 0.6)), "inlay_ring"),
        (cyl(GLASS_D / 2, GLASS_FRONT - GLASS_STEP, GLASS_FRONT), "screen"),
    ] + [(m, n) for m, _, n in ghosts()]
    ticks, north = face_marks(DEPTH - 0.38, DEPTH - 0.06)
    fills = [(ticks, "fill_white"),
             (north ^ cyl(40, DEPTH - 0.58, DEPTH - 0.06)
              + key_grooves_fill().rotate((0, 0, BUTTON_ANGLE)).translate((0, 0, zb)), "fill_red")]

    # collisions between anything that shouldn't touch
    solid = dict((n, m) for m, n in placed)
    names = list(solid)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            pair = {a, b}
            if pair <= {"screen", "ghost_board"} or pair in ({"key_pwr", "stem_pwr"}, {"key_boot", "stem_boot"}):
                continue
            v = (solid[a] ^ solid[b]).volume()
            if v > 0.05:
                print(f"  overlap {a} x {b}: {v:.2f} mm3")
    print(f"depth {DEPTH} mm, diameter {2 * R_OUT} mm, USB-C face x {USB_FACE_X:.2f}")

    scene = trimesh.Scene()
    for m, name in placed + fills:
        tm = to_trimesh(m)
        tm.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
            baseColorFactor=[128, 128, 128, 255], metallicFactor=0.0, roughnessFactor=0.7))
        scene.add_geometry(tm, node_name=name, geom_name=name)
    scene.export(out / "compass.glb")
    print("compass.glb written")


if __name__ == "__main__":
    main()
