"""Procedural low-poly weapon geometry builders for the prototype."""

from __future__ import annotations

from typing import Callable, Dict

from panda3d.core import (
    Geom,
    GeomNode,
    GeomTriangles,
    GeomVertexData,
    GeomVertexFormat,
    GeomVertexWriter,
    NodePath,
    Vec3,
    Vec4,
)

from .weapons import WeaponBlueprint


Builder = Callable[[WeaponBlueprint], NodePath]


def build_weapon_model(blueprint: WeaponBlueprint) -> NodePath:
    """Return a low-poly model representing ``blueprint``."""

    builder = _WEAPON_BUILDERS.get(blueprint.id, _build_generic_rifle)
    model = builder(blueprint)
    model.setName(f"{blueprint.id}_model")
    return model


def _build_generic_rifle(blueprint: WeaponBlueprint) -> NodePath:
    """Fallback builder for weapons without bespoke geometry."""

    root = NodePath("generic_rifle")
    body = _make_box(Vec3(0.06, 0.42, 0.08), Vec4(0.18, 0.18, 0.2, 1), "body")
    body.reparentTo(root)

    barrel = _make_box(Vec3(0.025, 0.28, 0.025), Vec4(0.1, 0.1, 0.12, 1), "barrel")
    barrel.reparentTo(root)
    barrel.setPos(0, 0.42, 0.015)

    stock = _make_box(Vec3(0.055, 0.2, 0.09), Vec4(0.16, 0.16, 0.18, 1), "stock")
    stock.reparentTo(root)
    stock.setPos(0, -0.36, -0.01)

    grip = _make_box(Vec3(0.03, 0.12, 0.09), Vec4(0.22, 0.22, 0.24, 1), "grip")
    grip.reparentTo(root)
    grip.setPos(-0.05, -0.05, -0.18)
    grip.setHpr(0, -20, 0)

    scope = _make_box(Vec3(0.035, 0.16, 0.035), Vec4(0.24, 0.24, 0.3, 1), "scope")
    scope.reparentTo(root)
    scope.setPos(0, 0.1, 0.12)

    return root


def _build_sentinel_rifle(blueprint: WeaponBlueprint) -> NodePath:
    """Customised low-poly geometry for the Sentinel Rifle."""

    root = NodePath("sentinel_rifle")

    body = _make_box(Vec3(0.065, 0.46, 0.09), Vec4(0.26, 0.3, 0.35, 1), "body")
    body.reparentTo(root)
    body.setPos(-0.01, 0, 0.01)

    barrel = _make_box(Vec3(0.022, 0.34, 0.022), Vec4(0.15, 0.18, 0.22, 1), "barrel")
    barrel.reparentTo(root)
    barrel.setPos(0, 0.5, 0.03)

    muzzle = _make_box(Vec3(0.028, 0.08, 0.028), Vec4(0.1, 0.12, 0.15, 1), "muzzle")
    muzzle.reparentTo(root)
    muzzle.setPos(0, 0.82, 0.03)

    stock = _make_box(Vec3(0.07, 0.24, 0.1), Vec4(0.2, 0.22, 0.26, 1), "stock")
    stock.reparentTo(root)
    stock.setPos(-0.01, -0.42, -0.01)

    cheek_rest = _make_box(Vec3(0.05, 0.16, 0.045), Vec4(0.28, 0.32, 0.38, 1), "cheek_rest")
    cheek_rest.reparentTo(root)
    cheek_rest.setPos(0.02, -0.2, 0.07)

    grip = _make_box(Vec3(0.032, 0.14, 0.1), Vec4(0.22, 0.24, 0.28, 1), "grip")
    grip.reparentTo(root)
    grip.setPos(-0.06, -0.02, -0.22)
    grip.setHpr(0, -24, 0)

    magazine = _make_box(Vec3(0.05, 0.12, 0.12), Vec4(0.18, 0.2, 0.24, 1), "magazine")
    magazine.reparentTo(root)
    magazine.setPos(0.02, -0.04, -0.18)
    magazine.setHpr(0, 12, 0)

    optics = _make_box(Vec3(0.04, 0.2, 0.04), Vec4(0.32, 0.36, 0.42, 1), "optics")
    optics.reparentTo(root)
    optics.setPos(0.015, 0.12, 0.14)

    battery = _make_box(Vec3(0.03, 0.14, 0.055), Vec4(0.22, 0.28, 0.34, 1), "battery")
    battery.reparentTo(root)
    battery.setPos(-0.05, 0.1, -0.06)

    return root


def _make_box(half_extents: Vec3, color: Vec4, name: str) -> NodePath:
    """Create a coloured box primitive."""

    format = GeomVertexFormat.getV3n3c4()
    vdata = GeomVertexData(name, format, Geom.UHStatic)
    vertex = GeomVertexWriter(vdata, "vertex")
    normal = GeomVertexWriter(vdata, "normal")
    color_writer = GeomVertexWriter(vdata, "color")

    hx, hy, hz = half_extents
    corners = [
        Vec3(-hx, -hy, -hz),
        Vec3(hx, -hy, -hz),
        Vec3(hx, hy, -hz),
        Vec3(-hx, hy, -hz),
        Vec3(-hx, -hy, hz),
        Vec3(hx, -hy, hz),
        Vec3(hx, hy, hz),
        Vec3(-hx, hy, hz),
    ]

    faces = [
        ((0, 1, 2, 3), Vec3(0, 0, -1)),  # Bottom
        ((4, 5, 6, 7), Vec3(0, 0, 1)),  # Top
        ((3, 2, 6, 7), Vec3(0, 1, 0)),  # Front
        ((0, 1, 5, 4), Vec3(0, -1, 0)),  # Back
        ((2, 1, 5, 6), Vec3(1, 0, 0)),  # Right
        ((3, 0, 4, 7), Vec3(-1, 0, 0)),  # Left
    ]

    prim = GeomTriangles(Geom.UHStatic)
    vert_index = 0

    for indices, face_normal in faces:
        for idx in indices:
            vertex.addData3f(corners[idx])
            normal.addData3f(face_normal)
            color_writer.addData4f(color)
        prim.addVertices(vert_index, vert_index + 1, vert_index + 2)
        prim.addVertices(vert_index, vert_index + 2, vert_index + 3)
        vert_index += 4

    geom = Geom(vdata)
    geom.addPrimitive(prim)
    node = GeomNode(name)
    node.addGeom(geom)
    return NodePath(node)


_WEAPON_BUILDERS: Dict[str, Builder] = {
    "sentinel_rifle": _build_sentinel_rifle,
}


__all__ = ["build_weapon_model"]
