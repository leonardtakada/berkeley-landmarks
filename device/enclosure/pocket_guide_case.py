"""Pocket guide case, study 02: a Slab body with a Disc face.

A graphite bar (56 x 88 x 19 mm) around the Waveshare ESP32-S3-Touch-AMOLED-1.75:
the round screen under a lip with a silver inlay ring, hairline grooves ringing
it out to the edges, a smoked window over the GPS patch above, radial plungers
for PWR and BOOT, the speaker firing through a drilled grid on the back.

Run:   python device/enclosure/pocket_guide_case.py      (needs manifold3d, trimesh, numpy)
Out:   device/enclosure/out/*.stl, already turned to their print orientation,
       plus case.glb (assembled, coloured) for the viewer.

Coordinates: x right and y up as you look at the screen, origin at the board's
centre; z = 0 is the outside of the back, z = DEPTH the face.
Board numbers are from Waveshare's drawing (docs.waveshare.com, "Dimensions").
Every number marked MEASURE is a guess until it's checked with calipers.
"""

from math import cos, sin, radians, sqrt
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import CrossSection, JoinType, Manifold

SEG = 96  # circle segments

# ---- board (Waveshare drawing) -------------------------------------------
GLASS_D = 48.96        # screen module outer diameter
GLASS_STEP = 2.05      # depth of the glass stack at full diameter
ACTIVE_D = 43.76       # lit area
PCB_D = 46.0
BOARD_DEPTH = 10.40    # glass front to the back of the standoffs
STANDOFFS = [(0.0, 20.5), (13.75, -14.7), (-13.75, -14.7)]  # M2, female, 3.5 tall
BUTTON_ANGLE = 34.0    # PWR at +34 deg, BOOT at -34 deg, on the right edge
BUTTON_R = 23.3        # radius of the switch actuator tips          MEASURE
BUTTON_DEPTH = 6.4     # glass front to switch centre                MEASURE
SD_DEPTH = 7.8         # glass front to microSD slot centre (right edge, y 0)  MEASURE
USB_DEPTH = 8.5        # glass front to USB-C centre (left edge, y 0)          MEASURE
USB_FACE_X = -23.8     # USB-C receptacle face

# ---- parts that aren't on the board yet ------------------------------------
PATCH = (27.0, 27.0, 6.85)      # ceramic GPS patch, lead out one side  (measured)
SPEAKER = (30.0, 20.0, 7.0)     # enclosed speaker that came in the box (measured)
BATTERY = (37.0, 20.0, 5.0)     # flat LiPo, lying across the middle    (measured)
BATTERY_Y = 0.0                 # centred, so the plugs at the PCB's top and bottom edges stay clear
BOARD_FULL_DEPTH = 14.0         # glass front to the tip of the tallest connector (measured)

# ---- case ------------------------------------------------------------------
WIDTH = 56.0
TOP, BOTTOM = 56.0, -32.0       # outline relative to the board centre
DEPTH = 19.0
CORNER = 7.0                    # plan-view corner radius
FRONT_FILLET, BACK_FILLET = 2.0, 3.0
WALL = 2.0                      # side walls
FACE = 1.2                      # face thickness, also the lip over the glass
BACK = 1.6                      # back wall
SPLIT = 7.0                     # z of the parting line
LIP_D = 45.6                    # screen opening: covers the glass's black border
CLEAR = 0.2                     # fit clearance per side

GLASS_FRONT = DEPTH - FACE                  # 17.8
STANDOFF_END = GLASS_FRONT - BOARD_DEPTH    # 7.4
WINDOW_OPEN = (34.0, 21.0)                  # smoked window opening (w, h)
WINDOW_Y = 39.9                 # patch centre: its lower edge clears the glass ring by 0.3
WINDOW_FLANGE = 0.8
CASE_SCREWS = [(23.5, 51.5), (-23.5, 51.5), (23.0, -27.5), (-23.0, -27.5)]  # M2 + heat-set inserts
LANYARD = (-16.0, -28.5)

H = TOP - BOTTOM
CY = (TOP + BOTTOM) / 2


# ---- helpers ---------------------------------------------------------------
def rrect(w, h, r, cx=0.0, cy=0.0):
    r = min(r, w / 2 - 0.01, h / 2 - 0.01)
    return CrossSection.square((w - 2 * r, h - 2 * r), True).offset(
        r, JoinType.Round, circular_segments=SEG).translate((cx, cy))


def slab(cs, z0, z1):
    return cs.extrude(z1 - z0).translate((0, 0, z0))


def cyl(r, z0, z1, x=0.0, y=0.0):
    return Manifold.cylinder(z1 - z0, r, r, SEG).translate((x, y, z0))


def ring(r_in, r_out, z0, z1):
    return cyl(r_out, z0, z1) - cyl(r_in, z0 - 1, z1 + 1)


def radial_rod(r, start, end, angle, z):
    """Cylinder of radius r along the in-plane direction `angle`, from radius start to end."""
    return (Manifold.cylinder(end - start, r, r, SEG)
            .rotate((0, 90, 0)).translate((start, 0, 0))
            .rotate((0, 0, angle)).translate((0, 0, z)))


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def rounded_body(inset=0.0, z0=0.0, z1=DEPTH, front=FRONT_FILLET, back=BACK_FILLET):
    """The outline extruded with quarter-round edges front and back, as a hull of slices."""
    w, h, r = WIDTH - 2 * inset, H - 2 * inset, CORNER - inset
    slices = []
    for edge, zf in ((back, lambda t: z0 + edge * (1 - cos(t))), (front, lambda t: z1 - edge * (1 - cos(t)))):
        for i in range(9):
            t = radians(90 * i / 8)
            d = edge * (1 - sin(t))
            slices.append(slab(rrect(w - 2 * d, h - 2 * d, r - d, 0, CY), zf(t) - 0.01, zf(t) + 0.01))
    return Manifold.batch_hull(slices)


# ---- front shell -----------------------------------------------------------
def front_shell():
    outer = rounded_body()
    cavity = slab(rrect(WIDTH - 2 * WALL, H - 2 * WALL, CORNER - WALL, 0, CY), BACK, GLASS_FRONT)
    shell = outer - cavity

    # locating ring around the glass stack
    shell += ring(GLASS_D / 2 + CLEAR, GLASS_D / 2 + 1.6, GLASS_FRONT - GLASS_STEP - 0.5, GLASS_FRONT) ^ outer

    # case screw bosses with heat-set insert holes (M2: 3.2 mm, 4.5 deep)
    for x, y in CASE_SCREWS:
        shell += cyl(2.8, SPLIT, GLASS_FRONT + 0.1, x, y) ^ outer
    # lanyard post
    shell += cyl(3.0, SPLIT, GLASS_FRONT + 0.1, *LANYARD) ^ outer

    # plunger guides, radial at +-34 deg
    zb = GLASS_FRONT - BUTTON_DEPTH
    for a in (BUTTON_ANGLE, -BUTTON_ANGLE):
        shell += radial_rod(3.4, 25.0, 40.0, a, zb) ^ outer

    # patch cradle: four corner posts behind the window
    pw, ph, pt = PATCH
    patch_back = GLASS_FRONT - WINDOW_FLANGE - pt
    for sx in (-1, 1):                    # side posts near the ends; the middle stays open for the lead
        for sy in (-1, 1):
            x, y = sx * (pw / 2 + CLEAR + 0.9), WINDOW_Y + sy * (ph / 2 - 3.0)
            post = box(x - 0.9, x + 0.9, y - 2.0, y + 2.0, patch_back - 1.0, GLASS_FRONT)
            shell += post ^ outer

    # ---- cuts ----
    cuts = []
    cuts.append(cyl(LIP_D / 2, GLASS_FRONT - 1, DEPTH + 1))                       # screen opening
    cuts.append(Manifold.cylinder(1.6, LIP_D / 2 - 0.8, LIP_D / 2 + 0.8, SEG)       # 45 deg lip chamfer
                .translate((0, 0, DEPTH - 0.8)))
    ww, wh = WINDOW_OPEN
    cuts.append(slab(rrect(ww, wh, 3.0, 0, WINDOW_Y), GLASS_FRONT - 1, DEPTH + 1))  # window opening
    cuts.append(slab(rrect(ww + 3, wh + 3, 4.0, 0, WINDOW_Y),                      # window flange seat
                     GLASS_FRONT - WINDOW_FLANGE - 0.01, GLASS_FRONT + 0.01))
    for x, y in CASE_SCREWS:
        cuts.append(cyl(1.6, SPLIT - 1, SPLIT + 4.5, x, y))
    cuts.append(cyl(1.3, -1, DEPTH + 1, *LANYARD))
    for a in (BUTTON_ANGLE, -BUTTON_ANGLE):                                         # stepped bores
        cuts.append(radial_rod(2.2, 20.0, 30.0, a, zb))
        cuts.append(radial_rod(1.7, 20.0, 45.0, a, zb))
    # microSD slot (right) with a thumb dimple
    zs = GLASS_FRONT - SD_DEPTH
    cuts.append(box(21.0, WIDTH, -6.5, 6.5, zs - 1.4, zs + 1.4))
    cuts.append(Manifold.sphere(6.5, SEG).translate((WIDTH / 2 + 4.6, 0, zs)))
    # USB-C (left): port opening, then a recess for the plug's overmold
    zu = GLASS_FRONT - USB_DEPTH
    cuts.append(rrect_x(-WIDTH, USB_FACE_X + 1.0, 9.8, 3.9, 1.5, zu))
    cuts.append(rrect_x(-WIDTH, -WIDTH / 2 + 1.5, 13.0, 7.5, 3.0, zu))
    # inlay channel around the screen for a silver ring (or paint)
    cuts.append(ring(23.6, 25.4, DEPTH - 0.6, DEPTH + 1))
    cuts.append(face_grooves(outer))

    return shell - Manifold.batch_boolean(cuts, manifold_op_add())


def rrect_x(x0, x1, w_y, h_z, r, zc):
    """A rounded rectangle in the y-z plane, extruded along x from x0 to x1, centred on y 0."""
    cs = rrect(h_z, w_y, r)                # in (z, y)
    m = cs.extrude(x1 - x0)                # along z
    return m.rotate((0, 90, 0)).translate((x0, 0, zc))


def manifold_op_add():
    from manifold3d import OpType
    return OpType.Add


def face_grooves(outer):
    """Hairline rings, centred on the screen, engraved where the face is flat."""
    grooves = []
    r = 27.0
    while r < 50:
        grooves.append(ring(r - 0.25, r + 0.25, DEPTH - 0.4, DEPTH + 1))
        r += 1.2
    rings = Manifold.batch_boolean(grooves, manifold_op_add())
    flat = slab(rrect(WIDTH - 2 * (FRONT_FILLET + 0.6), H - 2 * (FRONT_FILLET + 0.6),
                      CORNER - FRONT_FILLET, 0, CY), DEPTH - 1, DEPTH + 1)
    keep_out = slab(rrect(WINDOW_OPEN[0] + 3, WINDOW_OPEN[1] + 3, 4.0, 0, WINDOW_Y), DEPTH - 2, DEPTH + 2)
    keep_out += cyl(3.2, DEPTH - 2, DEPTH + 2, *LANYARD)
    return (rings ^ flat) - keep_out


# ---- back shell ------------------------------------------------------------
def back_shell():
    outer = rounded_body()
    cavity = slab(rrect(WIDTH - 2 * WALL, H - 2 * WALL, CORNER - WALL, 0, CY), BACK, DEPTH)
    shell = outer - cavity
    for x, y in CASE_SCREWS:
        shell += cyl(2.8, BACK - 0.1, SPLIT, x, y) ^ outer
    shell += cyl(3.0, BACK - 0.1, SPLIT, *LANYARD) ^ outer
    # bosses that meet the board's own standoffs (0.15 short so the lip sets the board)
    for x, y in STANDOFFS:
        shell += cyl(2.5, BACK - 0.1, STANDOFF_END - 0.15, x, y)
    # battery fence
    bw, bh, bt = BATTERY
    by = BATTERY_Y
    fence = slab(rrect(bw + 2 * (CLEAR + 1.0), bh + 2 * (CLEAR + 1.0), 2.0, 0, by), BACK - 0.1, BACK + 2.0)
    fence -= slab(rrect(bw + 2 * CLEAR, bh + 2 * CLEAR, 1.0, 0, by), BACK - 1, BACK + 3)
    fence -= box(-6, 6, by - 30, by + 30, BACK - 1, BACK + 3)        # gaps for the lead and a finger
    shell += fence
    # speaker gasket rim behind the GPS zone
    sw, sh, st = SPEAKER
    sy = WINDOW_Y
    rim = slab(rrect(sw + 2 * (CLEAR + 1.2), sh + 2 * (CLEAR + 1.2), 2.0, 0, sy), BACK - 0.1, BACK + 2.5)
    rim -= slab(rrect(sw + 2 * CLEAR, sh + 2 * CLEAR, 1.0, 0, sy), BACK - 1, BACK + 3)
    shell += rim ^ outer

    cuts = []
    for x, y in CASE_SCREWS + STANDOFFS:
        cuts.append(cyl(1.15, -1, DEPTH, x, y))        # M2 clearance
        cuts.append(cyl(2.1, -1, 1.4, x, y))           # head counterbore
    cuts.append(cyl(1.3, -1, DEPTH + 1, *LANYARD))
    # speaker grille: drilled grid
    gx = np.arange(-sw / 2 + 2.5, sw / 2 - 2.4, 2.4)
    gy = np.arange(-sh / 2 + 2.5, sh / 2 - 2.4, 2.4)
    for x in gx:
        for y in gy:
            cuts.append(cyl(0.6, -1, BACK + 1, x, sy + y))
    # same port and slot cuts as the front, where they cross the parting line
    zu = GLASS_FRONT - USB_DEPTH
    cuts.append(rrect_x(-WIDTH, -WIDTH / 2 + 1.5, 13.0, 7.5, 3.0, zu))
    return (shell - Manifold.batch_boolean(cuts, manifold_op_add()))


# ---- small parts -----------------------------------------------------------
def window():
    ww, wh = WINDOW_OPEN
    front = slab(rrect(ww - 2 * CLEAR, wh - 2 * CLEAR, 3.0 - CLEAR, 0, 0), 0, FACE)
    flange = slab(rrect(ww + 3 - 2 * CLEAR, wh + 3 - 2 * CLEAR, 4.0 - CLEAR, 0, 0), -WINDOW_FLANGE, 0)
    return front + flange          # z 0 = the face's inner plane


def plunger():
    """Shoulder rod: 4.0 mm inside the guide, 3.0 mm through the wall, 0.8 proud."""
    zb = GLASS_FRONT - BUTTON_DEPTH
    a = radians(BUTTON_ANGLE)
    wall_r = (WIDTH / 2) / cos(a)
    inner = radial_rod(1.95, BUTTON_R + 0.2, 29.2, 0, 0)
    outer = radial_rod(1.45, 29.2, wall_r + 0.8, 0, 0)
    tip = Manifold.sphere(1.45, SEG).translate((wall_r + 0.8, 0, 0))
    return inner + outer + tip


def inlay_ring():
    return ring(23.6 + CLEAR / 2, 25.4 - CLEAR / 2, 0, 0.6)


# ---- export ----------------------------------------------------------------
def to_trimesh(m):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3]
    f = np.asarray(mesh.tri_verts)
    return trimesh.Trimesh(vertices=v, faces=f, process=False)


def main():
    out = Path(__file__).with_name("out")
    out.mkdir(exist_ok=True)

    front, back = front_shell(), back_shell()
    front = front.trim_by_plane((0, 0, 1), SPLIT)
    back = back.trim_by_plane((0, 0, -1), -SPLIT)
    win, plg, inlay = window(), plunger(), inlay_ring()

    parts = {
        # name: (part, print transform, colour for the viewer, transform into place)
        "front_shell": (front, lambda m: m.rotate((180, 0, 0)), (58, 63, 71)),  # face down: flipped, not mirrored
        "back_shell": (back, lambda m: m, (58, 63, 71)),
        "gps_window": (win, lambda m: m.translate((0, 0, WINDOW_FLANGE)), (74, 46, 51)),
        "plunger": (plg, lambda m: m.rotate((0, -90, 0)), (233, 236, 239)),
        "inlay_ring": (inlay, lambda m: m, (220, 224, 228)),
    }
    for name, (m, to_bed, _) in parts.items():
        placed_m = to_bed(m)
        bb = placed_m.bounding_box()
        placed_m = placed_m.translate((0, 0, -bb[2]))   # sit it on the bed
        tm = to_trimesh(placed_m)
        tm.export(out / f"{name}.stl")
        size = np.round(tm.bounds[1] - tm.bounds[0], 1)
        print(f"{name:12s} {size} mm  {placed_m.status().name}  genus {placed_m.genus()}  "
              f"{placed_m.volume() / 1000:.1f} cm3  min z {tm.bounds[0][2]:.2f}")

    # assembled scene for the viewer
    zb = GLASS_FRONT - BUTTON_DEPTH
    placed = [
        (front, (58, 63, 71), "front_shell"),
        (back, (46, 50, 57), "back_shell"),
        (win.translate((0, WINDOW_Y, GLASS_FRONT)), (74, 46, 51), "gps_window"),
        (plg.rotate((0, 0, BUTTON_ANGLE)).translate((0, 0, zb)), (233, 236, 239), "plunger_pwr"),
        (plg.rotate((0, 0, -BUTTON_ANGLE)).translate((0, 0, zb)), (233, 236, 239), "plunger_boot"),
        (inlay.translate((0, 0, DEPTH - 0.6)), (220, 224, 228), "inlay_ring"),
        (cyl(GLASS_D / 2, GLASS_FRONT - GLASS_STEP, GLASS_FRONT), (12, 13, 16), "screen"),
    ]
    # stand-ins for what goes inside (viewer only, not printed)
    pcb_back = GLASS_FRONT - 6.9
    board = (cyl(22.3, pcb_back + 1.0, GLASS_FRONT - GLASS_STEP)              # display body
             + cyl(PCB_D / 2, pcb_back, pcb_back + 1.0)                       # PCB
             + Manifold.batch_boolean([cyl(1.6, STANDOFF_END, pcb_back, x, y) for x, y in STANDOFFS],
                                      manifold_op_add()))
    bw, bh, bt = BATTERY
    by = BATTERY_Y
    sw, sh, st = SPEAKER
    pw, ph, pt = PATCH
    placed += [
        (board, (40, 80, 160), "ghost_board"),
        (box(-bw / 2, bw / 2, by - bh / 2, by + bh / 2, BACK + 0.2, BACK + 0.2 + bt), (200, 170, 60), "ghost_battery"),
        (box(-sw / 2, sw / 2, WINDOW_Y - sh / 2, WINDOW_Y + sh / 2, BACK + 0.2, BACK + 0.2 + st), (150, 150, 160), "ghost_speaker"),
        (box(-pw / 2, pw / 2, WINDOW_Y - ph / 2, WINDOW_Y + ph / 2,
             GLASS_FRONT - WINDOW_FLANGE - pt, GLASS_FRONT - WINDOW_FLANGE), (210, 190, 150), "ghost_patch"),
    ]
    scene = trimesh.Scene()
    for m, rgb, name in placed:
        tm = to_trimesh(m)
        tm.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
            baseColorFactor=[*rgb, 255], metallicFactor=0.0, roughnessFactor=0.7))
        scene.add_geometry(tm, node_name=name, geom_name=name)
    scene.export(out / "case.glb")
    print("case.glb written")


if __name__ == "__main__":
    main()
