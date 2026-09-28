"""
Berkeley Post — the guide's title face, after the cut-paper lettering of a
Showa-era poster (POST, in the Showa Modern book): heavy, upright, a little
condensed; small slotted counters; blunt terminals; edges that read as cut
with scissors rather than drawn with a compass.

Each capital is built from a few heavy strokes, slabs and slots (unioned and
cut with skia-pathops), then its outline is softened at the corners and
given a slight, smooth irregularity. Lower case sets as small capitals.

    python3 scripts/build-title-font.py [--proof out.svg]
      → assets/fonts/BerkeleyPost.otf

Needs fontTools and skia-pathops (pip install fonttools skia-pathops).
"""

import math
import random
import sys

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen

OUT = "assets/fonts/BerkeleyPost.otf"
UPM = 1000
CAP = 700
SB = 34  # side bearing: tight, like lettering cut to fit a panel
SMALL = 0.8  # lower case: small capitals at this size

# ── Primitives ──────────────────────────────────────────────────────────────
K = 0.5523


def path_from(points_or_cmds):
    p = pathops.Path()
    pen = p.getPen()
    for cmd in points_or_cmds:
        op, *args = cmd
        if op == "M":
            pen.moveTo(args[0])
        elif op == "L":
            pen.lineTo(args[0])
        elif op == "C":
            pen.curveTo(*args)
        elif op == "Z":
            pen.closePath()
    return p


def poly(*pts):
    return path_from([("M", pts[0]), *[("L", q) for q in pts[1:]], ("Z",)])


def rrect(x0, y0, x1, y1, tl=0, tr=0, br=0, bl=0):
    """A rectangle with its own radius at each corner (y up)."""
    c = []
    c.append(("M", (x0 + bl, y0)))
    c.append(("L", (x1 - br, y0)))
    if br:
        c.append(("C", (x1 - br + br * K, y0), (x1, y0 + br - br * K), (x1, y0 + br)))
    c.append(("L", (x1, y1 - tr)))
    if tr:
        c.append(("C", (x1, y1 - tr + tr * K), (x1 - tr + tr * K, y1), (x1 - tr, y1)))
    c.append(("L", (x0 + tl, y1)))
    if tl:
        c.append(("C", (x0 + tl - tl * K, y1), (x0, y1 - tl + tl * K), (x0, y1 - tl)))
    c.append(("L", (x0, y0 + bl)))
    if bl:
        c.append(("C", (x0, y0 + bl - bl * K), (x0 + bl - bl * K, y0), (x0 + bl, y0)))
    c.append(("Z",))
    return path_from(c)


def rect(x0, y0, x1, y1, r=0):
    return rrect(x0, y0, x1, y1, r, r, r, r)


def ellipse(cx, cy, rx, ry):
    return rrect(cx - rx, cy - ry, cx + rx, cy + ry, 0, 0, 0, 0) if False else path_from(
        [
            ("M", (cx + rx, cy)),
            ("C", (cx + rx, cy + ry * K), (cx + rx * K, cy + ry), (cx, cy + ry)),
            ("C", (cx - rx * K, cy + ry), (cx - rx, cy + ry * K), (cx - rx, cy)),
            ("C", (cx - rx, cy - ry * K), (cx - rx * K, cy - ry), (cx, cy - ry)),
            ("C", (cx + rx * K, cy - ry), (cx + rx, cy - ry * K), (cx + rx, cy)),
            ("Z",),
        ]
    )


def slot(x0, y0, x1, y1):
    """A counter cut as a narrow pill, like the slits in POST's P and O."""
    r = (x1 - x0) / 2
    return rrect(x0, y0, x1, y1, r, r, r, r)


def stroke(cmds, width, cap=pathops.LineCap.BUTT_CAP):
    """A heavy stroke along an open centreline."""
    p = pathops.Path()
    pen = p.getPen()
    for op, *args in cmds:
        if op == "M":
            pen.moveTo(args[0])
        elif op == "L":
            pen.lineTo(args[0])
        elif op == "C":
            pen.curveTo(*args)
    pen.endPath()
    p.stroke(width, cap, pathops.LineJoin.ROUND_JOIN, 4)
    return p


def union(*paths):
    return pathops.op(paths[0], _merge(paths[1:]), pathops.PathOp.UNION) if len(paths) > 1 else simplify(paths[0])


def _merge(paths):
    acc = paths[0]
    for q in paths[1:]:
        acc = pathops.op(acc, q, pathops.PathOp.UNION)
    return acc


def minus(a, *cuts):
    acc = a
    for c in cuts:
        acc = pathops.op(acc, c, pathops.PathOp.DIFFERENCE)
    return acc


def simplify(p):
    q = pathops.Path(p)
    q.simplify()
    return q


# ── The capitals (y up; cap height 700) ─────────────────────────────────────
S = 178  # stem


def g_A():
    return 520, minus(
        poly((0, 0), (158, 700), (362, 700), (520, 0), (338, 0), (308, 140), (212, 140), (182, 0)),
        poly((226, 262), (294, 262), (262, 500), (258, 500)),
    )


def g_B():
    return 500, minus(
        union(rrect(0, 360, 468, 700, 36, 176, 150, 0), rrect(0, 0, 500, 390, 0, 150, 186, 36)),
        slot(S, 472, 292, 608),
        slot(S, 96, 312, 276),
    )


def g_C():
    return 492, stroke(
        [("M", (430, 540)), ("C", (400, 630), (330, 612), (250, 612)), ("C", (150, 612), (92, 520), (92, 350)),
         ("C", (92, 180), (150, 88), (250, 88)), ("C", (330, 88), (400, 80), (432, 170))],
        176,
    )


def g_D():
    return 506, minus(rrect(0, 0, 506, 700, 30, 250, 250, 30), slot(S, 170, 318, 530))


def g_E():
    return 470, union(rect(0, 0, S, 700), rrect(0, 532, 462, 700, 0, 22, 12, 0), rrect(0, 282, 404, 432, 0, 14, 14, 0), rrect(0, 0, 476, 168, 0, 12, 22, 0))


def g_F():
    return 450, union(rect(0, 0, S + 4, 700), rrect(0, 532, 456, 700, 0, 22, 12, 0), rrect(0, 262, 396, 412, 0, 14, 14, 0))


def g_G():
    c = stroke(
        [("M", (438, 560)), ("C", (400, 640), (330, 612), (256, 612)), ("C", (150, 612), (92, 520), (92, 350)),
         ("C", (92, 180), (150, 88), (256, 88)), ("C", (360, 88), (430, 130), (430, 240))],
        176,
    )
    return 520, union(c, rect(262, 236, 518, 360), rect(342, 0, 518, 360, 0))


def g_H():
    return 526, union(rect(0, 0, S, 700), rect(526 - S, 0, 526, 700), rect(S - 10, 280, 526 - S + 10, 430))


def g_I():
    return 186, rect(0, 0, 186, 700)


def g_J():
    return 400, union(
        rect(222, 190, 400, 700),
        minus(rrect(0, 0, 400, 330, 0, 0, 190, 170), slot(150, 168, 222, 400), rect(0, 176, 222, 400)),
    )


def g_K():
    return 540, union(
        rect(0, 0, S, 700),
        poly((150, 300), (352, 700), (544, 700), (306, 330)),
        poly((236, 420), (390, 420), (548, 0), (356, 0)),
    )


def g_L():
    return 462, union(rect(0, 0, S + 4, 700), rrect(0, 0, 468, 176, 0, 16, 26, 0))


def g_M():
    return 640, poly(
        (0, 0), (0, 700), (196, 700), (320, 420), (444, 700), (640, 700), (640, 0), (468, 0), (468, 372),
        (372, 176), (268, 176), (172, 372), (172, 0),
    )


def g_N():
    return 540, poly((0, 0), (0, 700), (184, 700), (372, 318), (372, 700), (540, 700), (540, 0), (358, 0), (170, 380), (170, 0))


def g_O():
    return 520, minus(ellipse(260, 350, 260, 352), slot(206, 172, 314, 528))


def g_P():
    return 486, union(
        minus(rrect(0, 290, 486, 700, 34, 196, 160, 0), slot(S, 440, 298, 604)),
        poly((0, 0), (0, 700), (S, 700), (S + 8, 0)),
        poly((-8, 0), (S + 22, 0), (S + 4, 40), (0, 40)),
    )


def g_Q():
    w, o = g_O()
    return 540, union(o, poly((300, 128), (430, 150), (556, -70), (400, -70)))


def g_R():
    return 526, union(
        minus(rrect(0, 300, 486, 700, 34, 196, 160, 0), slot(S, 446, 298, 606)),
        rect(0, 0, S, 700),
        poly((190, 340), (360, 340), (530, 0), (340, 0)),
    )


def g_S():
    return 500, stroke(
        [("M", (430, 548)), ("C", (398, 604), (330, 614), (260, 614)), ("C", (160, 614), (94, 570), (94, 490)),
         ("C", (94, 408), (170, 384), (260, 354)), ("C", (350, 324), (416, 290), (416, 202)),
         ("C", (416, 122), (350, 88), (250, 88)), ("C", (166, 88), (104, 110), (72, 154))],
        172,
    )


def g_T():
    bar = path_from(
        [("M", (0, 500)), ("C", (10, 530), (36, 540), (70, 540)), ("L", (470, 540)),
         ("C", (504, 540), (530, 530), (540, 500)), ("L", (540, 700)), ("L", (0, 700)), ("Z",)]
    )
    return 540, union(bar, poly((184, 540), (356, 540), (376, 0), (164, 0)))


def g_U():
    return 520, union(
        rect(0, 250, S, 700),
        rect(520 - S, 250, 520, 700),
        minus(rrect(0, 0, 520, 420, 0, 0, 250, 250), slot(S, 170, 520 - S, 700)),
    )


def g_V():
    return 530, poly((0, 700), (186, 700), (265, 272), (344, 700), (530, 700), (360, 0), (170, 0))


def g_W():
    return 700, poly(
        (0, 700), (168, 700), (212, 318), (300, 560), (400, 560), (488, 318), (532, 700), (700, 700),
        (600, 0), (446, 0), (350, 268), (254, 0), (100, 0),
    )


def g_X():
    return 540, union(poly((0, 700), (188, 700), (544, 0), (356, 0)), poly((352, 700), (540, 700), (184, 0), (-4, 0)))


def g_Y():
    return 540, poly((0, 700), (188, 700), (270, 472), (352, 700), (540, 700), (362, 300), (362, 0), (180, 0), (180, 300))


def g_Z():
    return 510, poly((16, 700), (500, 700), (500, 566), (226, 168), (512, 168), (512, 0), (6, 0), (6, 134), (282, 532), (16, 532))


def g_period():
    return 186, rect(0, 0, 186, 186, 40)


def g_comma():
    return 186, union(rect(0, 40, 186, 186, 40), poly((40, 60), (186, 60), (100, -150), (20, -150)))


def g_hyphen():
    return 300, rect(0, 250, 300, 400, 20)


def g_quote():
    return 186, union(rect(0, 520, 186, 700, 40), poly((40, 540), (186, 540), (110, 360), (30, 360)))


def g_colon():
    return 186, union(rect(0, 0, 186, 186, 40), rect(0, 360, 186, 546, 40))


GLYPHS = {
    **{c: globals()[f"g_{c}"] for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"},
    ".": g_period,
    ",": g_comma,
    "-": g_hyphen,
    "'": g_quote,
    "’": g_quote,
    ":": g_colon,
}

# ── Cut, not drawn: soften and roughen the outline ─────────────────────────


def flatten(path, step=7.0):
    """Contours of `path` as lists of points about `step` apart."""
    contours = []
    for contour in path.contours:
        pts = []
        start = None
        cur = None
        for verb, seg in contour.segments:
            if verb == "moveTo":
                start = cur = seg[0]
                pts.append(cur)
            elif verb == "lineTo":
                a, b = cur, seg[0]
                n = max(1, int(math.dist(a, b) / step))
                pts += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(1, n + 1)]
                cur = b
            elif verb in ("curveTo", "qCurveTo"):
                if verb == "qCurveTo":
                    (q1, q2) = seg[0], seg[-1]
                    c1 = (cur[0] + 2 / 3 * (q1[0] - cur[0]), cur[1] + 2 / 3 * (q1[1] - cur[1]))
                    c2 = (q2[0] + 2 / 3 * (q1[0] - q2[0]), q2[1] + 2 / 3 * (q1[1] - q2[1]))
                    seg = (c1, c2, q2)
                a, c1, c2, b = cur, *seg
                length = math.dist(a, c1) + math.dist(c1, c2) + math.dist(c2, b)
                n = max(2, int(length / step))
                for i in range(1, n + 1):
                    t = i / n
                    mt = 1 - t
                    pts.append(
                        (
                            mt**3 * a[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t**3 * b[0],
                            mt**3 * a[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t**3 * b[1],
                        )
                    )
                cur = b
            elif verb == "closePath":
                pass
        if len(pts) > 2 and math.dist(pts[0], pts[-1]) < 0.5:
            pts.pop()
        if len(pts) > 2:
            contours.append(pts)
    return contours


def cut(path, seed):
    """Round the corners a touch (ink spread) and let the edge wander slightly."""
    rnd = random.Random(seed)
    out = pathops.Path()
    pen = out.getPen()
    for pts in flatten(path):
        n = len(pts)
        # ink spread: a short moving average rounds every corner a little
        soft = []
        for i in range(n):
            xs = [pts[(i + k) % n] for k in range(-3, 4)]
            soft.append((sum(p[0] for p in xs) / 7, sum(p[1] for p in xs) / 7))
        # a smooth wander along the normal, a few units either way
        phases = [rnd.uniform(0, 2 * math.pi) for _ in range(2)]
        freqs = [rnd.uniform(0.016, 0.026), rnd.uniform(0.045, 0.07)]
        amps = [3.4, 1.4]
        along = 0.0
        moved = []
        for i in range(n):
            a, b = soft[i - 1], soft[(i + 1) % n]
            tx, ty = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(tx, ty) or 1
            nx, ny = ty / ln, -tx / ln
            along += math.dist(soft[i - 1], soft[i])
            d = sum(A * math.sin(f * along + ph) for A, f, ph in zip(amps, freqs, phases))
            moved.append((round(soft[i][0] + nx * d, 1), round(soft[i][1] + ny * d, 1)))
        pen.moveTo(moved[0])
        for p in moved[1:]:
            pen.lineTo(p)
        pen.closePath()
    out.simplify()
    return out


# ── Build ───────────────────────────────────────────────────────────────────


def build():
    glyphs = {}  # name → (advance, pathops.Path)
    cmap = {}
    names = {".": "period", ",": "comma", "-": "hyphen", "'": "quotesingle", "’": "quoteright", ":": "colon"}
    for ch, fn in GLYPHS.items():
        w, p = fn()
        name = names.get(ch, ch)
        shape = cut(p, seed=ord(ch))
        glyphs[name] = (w + 2 * SB, shape)
        cmap[ord(ch)] = name
        if ch.isalpha():
            # lower case: the same letter as a small capital
            small = pathops.Path(p)
            small.transform(SMALL, 0, 0, SMALL, 0, 0)
            lname = ch.lower()
            glyphs[lname] = (round(w * SMALL) + 2 * SB, cut(small, seed=ord(ch) + 1000))
            cmap[ord(lname)] = lname
    glyphs["space"] = (230, pathops.Path())
    cmap[32] = "space"
    cmap[0xA0] = "space"
    return glyphs, cmap


def write_font(glyphs, cmap):
    order = [".notdef"] + sorted(glyphs)
    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    charstrings = {}
    metrics = {}
    for name in order:
        if name == ".notdef":
            pen = T2CharStringPen(400, None)
            pen.moveTo((40, 0)); pen.lineTo((360, 0)); pen.lineTo((360, 700)); pen.lineTo((40, 700)); pen.closePath()
            charstrings[name] = pen.getCharString()
            metrics[name] = (400, 40)
            continue
        adv, shape = glyphs[name]
        pen = T2CharStringPen(adv, None)
        moved = pathops.Path(shape)
        moved.transform(1, 0, 0, 1, SB, 0)
        moved.draw(pen)
        charstrings[name] = pen.getCharString()
        lsb = int(moved.bounds[0]) if name != "space" else 0
        metrics[name] = (adv, lsb)
    fb.setupCFF("BerkeleyPost-Regular", {"FullName": "Berkeley Post"}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=860, descent=-180)
    fb.setupNameTable(
        {
            "familyName": "Berkeley Post",
            "styleName": "Regular",
            "uniqueFontIdentifier": "BerkeleyPost-Regular-1.0",
            "fullName": "Berkeley Post",
            "psName": "BerkeleyPost-Regular",
            "version": "Version 1.000",
            "copyright": "© 2026 Auto Indicator LLC",
            "designer": "Drawn for Berkeley Tours after Showa-era poster lettering",
        }
    )
    fb.setupOS2(sTypoAscender=860, sTypoDescender=-180, sTypoLineGap=0, usWinAscent=880, usWinDescent=200, sCapHeight=CAP, sxHeight=round(CAP * SMALL))
    fb.setupPost()
    fb.save(OUT)
    print(f"wrote {OUT} ({len(glyphs)} glyphs)")


def proof(glyphs, cmap, out):
    """An SVG sheet: the alphabet and the titles, set in the new face."""
    lines = [
        "POST",
        "ABCDEFGHIJKLM",
        "NOPQRSTUVWXYZ",
        "BERKELEY TOURS",
        "THE TOURS · THE REGISTRY".replace("·", "-"),
        "THE ARCHITECTS",
        "Berkeley Tours",
        "The Registry",
    ]
    scale = 0.09
    y = 90
    body = []
    for line in lines:
        x = 20
        for ch in line:
            name = cmap.get(ord(ch))
            if not name:
                continue
            adv, shape = glyphs[name]
            d = []
            for contour in shape.contours:
                for verb, seg in contour.segments:
                    if verb == "moveTo":
                        d.append("M%.1f %.1f" % (seg[0][0] + SB, seg[0][1]))
                    elif verb == "lineTo":
                        d.append("L%.1f %.1f" % (seg[0][0] + SB, seg[0][1]))
                    elif verb == "curveTo":
                        d.append("C" + " ".join("%.1f %.1f" % (p[0] + SB, p[1]) for p in seg))
                    elif verb == "qCurveTo":
                        d.append("Q" + " ".join("%.1f %.1f" % (p[0] + SB, p[1]) for p in seg))
                    elif verb == "closePath":
                        d.append("Z")
            body.append(
                f'<path transform="translate({x:.1f} {y}) scale({scale} {-scale})" d="{" ".join(d)}" fill="#0B2E8C"/>'
            )
            x += adv * scale
        y += 86
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="{y}" viewBox="0 0 1300 {y}"><rect width="1300" height="{y}" fill="#FAF6EC"/>{"".join(body)}</svg>'
    open(out, "w").write(svg)
    print(f"proof → {out}")


if __name__ == "__main__":
    g, c = build()
    write_font(g, c)
    if "--proof" in sys.argv:
        proof(g, c, sys.argv[sys.argv.index("--proof") + 1])
