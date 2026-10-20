"""Generates the app's two Lottie celebrations (assets/animations/) with python-lottie.

    pip install lottie && python scripts/generate-lottie.py assets/animations

success-check.json  a disc pops in, a check stroke draws over it, a ring pulses out
celebrate-burst.json  a ring pulses out and dots fly outward (an icon sits on top in-app)

Group names (Ring, Disc, Check, Pulse, DotsA, DotsB) are the keypaths the app
recolors with theme colors through lottie-react-native's colorFilters.
"""
import json
import math
import sys

from lottie import objects, Color, NVector
from lottie.objects import easing

FR = 60
SIZE = 160
C = NVector(SIZE / 2, SIZE / 2)
PINK = Color(0.82, 0.18, 0.40)
LAV = Color(0.46, 0.31, 0.84)
WHITE = Color(1, 1, 1)


def ease_out():
    return easing.Sigmoid(0.2)


def kf(prop, frames_values, ease=None):
    for t, v in frames_values:
        prop.add_keyframe(t, v, ease or easing.EaseOut(0.6))


def success_check():
    an = objects.Animation(48, FR)
    an.width = an.height = SIZE
    an.name = "success-check"

    # Check mark, hidden until it starts drawing (a round cap at 0% shows as a dot)
    check_layer = objects.ShapeLayer()
    check_layer.name = "Check"
    check_layer.in_point = 12
    g = check_layer.add_shape(objects.Group())
    g.name = "Check"
    path = objects.Path()
    path.shape.value.add_point(NVector(58, 82))
    path.shape.value.add_point(NVector(74, 97))
    path.shape.value.add_point(NVector(104, 66))
    g.add_shape(path)
    trim = objects.Trim()
    trim.end.value = 0
    kf(trim.end, [(12, 0), (30, 100)])
    g.add_shape(trim)
    st = objects.Stroke(WHITE, 10)
    st.line_cap = objects.LineCap.Round
    st.line_join = objects.LineJoin.Round
    g.add_shape(st)
    an.add_layer(check_layer)

    # Disc pops in with a small overshoot
    disc_layer = objects.ShapeLayer()
    disc_layer.name = "Disc"
    g = disc_layer.add_shape(objects.Group())
    g.name = "Disc"
    g.add_shape(objects.Ellipse(NVector(0, 0), NVector(108, 108)))
    g.add_shape(objects.Fill(PINK))
    g.transform.position.value = C
    kf(g.transform.scale, [(0, NVector(0, 0)), (14, NVector(110, 110)), (22, NVector(100, 100))])
    an.add_layer(disc_layer)

    # Soft ring pulsing outward behind it
    ring_layer = objects.ShapeLayer()
    ring_layer.name = "Ring"
    ring_layer.in_point = 8
    g = ring_layer.add_shape(objects.Group())
    g.name = "Ring"
    ell = objects.Ellipse(NVector(0, 0), NVector(108, 108))
    kf(ell.size, [(8, NVector(108, 108)), (36, NVector(152, 152))])
    g.add_shape(ell)
    st = objects.Stroke(PINK, 6)
    kf(st.width, [(8, 6), (36, 1)])
    g.add_shape(st)
    g.transform.position.value = C
    kf(g.transform.opacity, [(8, 70), (36, 0)])
    an.add_layer(ring_layer)
    return an


def celebrate_burst():
    an = objects.Animation(48, FR)
    an.width = an.height = SIZE
    an.name = "celebrate-burst"

    for idx, (name, color) in enumerate((("DotsA", PINK), ("DotsB", LAV))):
        layer = objects.ShapeLayer()
        layer.name = name
        for i in range(idx, 10, 2):
            angle = (i / 10) * 2 * math.pi - math.pi / 2
            g = layer.add_shape(objects.Group())
            g.name = name
            r = 6 if idx == 0 else 5
            g.add_shape(objects.Ellipse(NVector(0, 0), NVector(r * 2, r * 2)))
            g.add_shape(objects.Fill(color))
            start = NVector(C.x + 26 * math.cos(angle), C.y + 26 * math.sin(angle))
            end = NVector(C.x + 70 * math.cos(angle), C.y + 70 * math.sin(angle))
            kf(g.transform.position, [(4, start), (30, end)])
            kf(g.transform.scale, [(4, NVector(0, 0)), (10, NVector(110, 110)), (40, NVector(0, 0))])
        an.add_layer(layer)

    layer = objects.ShapeLayer()
    layer.name = "Pulse"
    g = layer.add_shape(objects.Group())
    g.name = "Pulse"
    ell = objects.Ellipse(NVector(0, 0), NVector(40, 40))
    kf(ell.size, [(0, NVector(40, 40)), (28, NVector(150, 150))])
    g.add_shape(ell)
    st = objects.Stroke(PINK, 8)
    kf(st.width, [(0, 8), (28, 1)])
    g.add_shape(st)
    g.transform.position.value = C
    kf(g.transform.opacity, [(0, 90), (28, 0)])
    an.add_layer(layer)
    return an


if __name__ == "__main__":
    out = sys.argv[1]
    for an in (success_check(), celebrate_burst()):
        data = an.to_dict()
        with open(f"{out}/{an.name}.json", "w") as f:
            json.dump(data, f, separators=(",", ":"))
        print(an.name, len(json.dumps(data)), "bytes")
