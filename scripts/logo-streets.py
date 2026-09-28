"""The streets of the cover's Campanile device, for the architects to walk.

The device stands on an isometric slab cut by a grid of streets; the streets
are knocked out of the ink, so the cover's blue shows through them. This
reads that grid off the artwork and bakes:

  components/logo-streets.generated.ts   the street network, in image pixels
  assets/images/logo-tower.png           the tower alone, to print over anyone
                                         walking behind it

How: the slab's top face is found from its two upper edges (fitted to the
alpha) and its left and right corners; the image is resampled into the face's
own isometric (a, b) coordinates, where the streets become straight rows and
columns; each street's centre line is found from those profiles. Every stretch
of street between crossings is kept if it is open in the artwork, or if the
tower hides it (the streets run on behind it), but never under the tower's
own footprint.

  python3 scripts/logo-streets.py
"""

import json

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "assets/images/logo-on-blue.png"
OUT_TS = "components/logo-streets.generated.ts"
OUT_TOWER = "assets/images/logo-tower.png"
BOARD = (10, 44, 141)  # PAPER.board, for the tower's window slits

img = Image.open(SRC).convert("RGBA")
px = np.array(img).astype(float)
alpha = px[:, :, 3]
H, W = alpha.shape
opaque = alpha > 128


# ── The slab's top face ───────────────────────────────────────────────────
def fit_edge(xs):
    """A line through the first ink below y=330 in each column (the notches
    where streets meet the edge sit lower, so the fit drops them)."""
    pts = []
    for x in xs:
        col = np.where(opaque[330:, x])[0]
        if len(col):
            pts.append((x, 330 + col[0]))
    pts = np.array(pts, float)
    keep = np.ones(len(pts), bool)
    for _ in range(5):
        m, c = np.polyfit(pts[keep, 0], pts[keep, 1], 1)
        res = pts[:, 1] - (m * pts[:, 0] + c)
        keep = res < np.percentile(res[keep], 70) + 1.5
    return m, c


m1, c1 = fit_edge(range(20, 235))  # upper left
m2, c2 = fit_edge(range(415, 635))  # upper right
xT = (c2 - c1) / (m1 - m2)
T = np.array([xT, m1 * xT + c1])  # the back corner, behind the tower
ys, xs = np.where(opaque[330:, :])
ys = ys + 330
xl, xr = xs.min(), xs.max()
L = np.array([xl, m1 * xl + c1])
R = np.array([xr, m2 * xr + c2])
U, V = R - T, L - T  # a runs towards the right corner, b towards the left


def at(a, b):
    return T + a * U + b * V


# ── The face, resampled square: streets become rows and columns ──────────
N = 640
g = (np.arange(N) + 0.5) / N
AA, BB = np.meshgrid(g, g, indexing="xy")
X = T[0] + AA * U[0] + BB * V[0]
Y = T[1] + AA * U[1] + BB * V[1]
street = ndimage.map_coordinates(alpha, [Y, X], order=1) < 110


def centre(guess, profile):
    lo, hi = int((guess - 0.04) * N), int((guess + 0.04) * N)
    seg = profile[lo:hi]
    w = seg - seg.min()
    return float((np.arange(lo, hi) * w).sum() / w.sum() + 0.5) / N


GUESS = [0.19, 0.365, 0.53, 0.69, 0.855]
A_LINES = [centre(x, street.mean(axis=0)) for x in GUESS]
B_LINES = [centre(x, street.mean(axis=1)) for x in GUESS]

# ── The tower ─────────────────────────────────────────────────────────────
# Its shaft is upright between these columns; its foot is a diamond whose
# front corners were read off the artwork (left, front, right).
SHAFT = (249, 400)
FOOT = [(250.0, 518.0), (326.0, 564.0), (400.0, 520.0)]


def front_y(x):
    (lx, ly), (fx, fy), (rx, ry) = FOOT
    if x < fx:
        return ly + (x - lx) * (fy - ly) / (fx - lx)
    return fy + (x - fx) * (ry - fy) / (rx - fx)


def hidden(p):
    return SHAFT[0] <= p[0] <= SHAFT[1] and p[1] < front_y(p[0])


def to_ab(p):
    d = np.array(p) - T
    det = U[0] * V[1] - U[1] * V[0]
    return ((d[0] * V[1] - d[1] * V[0]) / det, (U[0] * d[1] - U[1] * d[0]) / det)


fa = [to_ab(p) for p in FOOT]
FOOTPRINT = (fa[0][0], fa[2][0], fa[2][1], fa[0][1])  # a0, a1, b0, b1


def under_tower(a, b, m=0.005):
    a0, a1, b0, b1 = FOOTPRINT
    return a0 - m < a < a1 + m and b0 - m < b < b1 + m


def keep(pa, pb):
    seen = open_ = under = 0
    for t in np.linspace(0, 1, 24):
        a, b = pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t
        if under_tower(a, b):
            under += 1
            continue
        p = at(a, b)
        if hidden(p):
            continue
        seen += 1
        open_ += ndimage.map_coordinates(alpha, [[p[1]], [p[0]]], order=1)[0] < 110
    if under > 2:
        return False
    return seen < 6 or open_ / seen >= 0.8


# ── The network ───────────────────────────────────────────────────────────
nodes: dict = {}


def node(a, b):
    return nodes.setdefault((round(a, 4), round(b, 4)), len(nodes))


edges = []
for b in B_LINES:
    stops = [0.0] + A_LINES + [1.0]
    for a0, a1 in zip(stops, stops[1:]):
        if keep((a0, b), (a1, b)):
            edges.append((node(a0, b), node(a1, b)))
for a in A_LINES:
    stops = [0.0] + B_LINES + [1.0]
    for b0, b1 in zip(stops, stops[1:]):
        if keep((a, b0), (a, b1)):
            edges.append((node(a, b0), node(a, b1)))

points = [None] * len(nodes)
edge_of = [False] * len(nodes)
for (a, b), i in nodes.items():
    p = at(a, b)
    points[i] = [round(float(p[0]), 1), round(float(p[1]), 1)]
    edge_of[i] = a in (0.0, 1.0) or b in (0.0, 1.0)

ts = f"""// Generated by scripts/logo-streets.py from {SRC} — don't edit by hand.
//
// The streets cut into the Campanile device's slab, in the image's own
// pixels ({W} × {H}). `edge` marks the street ends at the slab's rim, where
// walkers come and go; `tower` is the region the tower hides (its shaft, down
// to the front of its foot), which assets/images/logo-tower.png prints over.
export const LOGO_STREETS = {{
  size: [{W}, {H}] as const,
  nodes: {json.dumps(points)} as [number, number][],
  edge: {json.dumps(edge_of)},
  links: {json.dumps([list(e) for e in edges])} as [number, number][],
  tower: {{ left: {SHAFT[0]}, right: {SHAFT[1]}, foot: {json.dumps([list(p) for p in FOOT])} as [number, number][] }},
}};
"""
open(OUT_TS, "w").write(ts)

# ── The tower alone ───────────────────────────────────────────────────────
tower = np.zeros_like(px)
for x in range(SHAFT[0], SHAFT[1] + 1):
    y1 = int(np.ceil(front_y(x)))
    col = px[:y1, x].copy()
    # The window slits are knocked out to the board; from in front they
    # read as dark openings, so nobody behind shows through them.
    inside = np.arange(y1) > np.argmax(col[:, 3] > 128)
    slit = inside & (col[:, 3] < 250)
    k = col[:, 3:4] / 255.0
    col[:, :3] = np.where(slit[:, None], col[:, :3] * k + np.array(BOARD) * (1 - k), col[:, :3])
    col[:, 3] = np.where(slit, 255, col[:, 3])
    tower[:y1, x] = col
Image.fromarray(tower.astype(np.uint8), "RGBA").save(OUT_TOWER, optimize=True)

print(f"face T={T.round(1)} L={L.round(1)} R={R.round(1)}")
print(f"streets a={[round(x, 3) for x in A_LINES]} b={[round(x, 3) for x in B_LINES]}")
print(f"footprint a {FOOTPRINT[0]:.3f}–{FOOTPRINT[1]:.3f}, b {FOOTPRINT[2]:.3f}–{FOOTPRINT[3]:.3f}")
print(f"wrote {OUT_TS} ({len(points)} crossings, {len(edges)} streets) and {OUT_TOWER}")
