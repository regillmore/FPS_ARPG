"""Safehouse stash box prototype for storing player inventory items."""

from __future__ import annotations

from dataclasses import dataclass

from direct.gui.DirectGui import DirectFrame, OnscreenText
from panda3d.core import (
    Geom,
    GeomNode,
    GeomTriangles,
    GeomVertexData,
    GeomVertexFormat,
    GeomVertexWriter,
    NodePath,
    TextNode,
    TransparencyAttrib,
    Vec3,
    Vec4,
)

from .inventory import Inventory


def _make_box(half_extents: Vec3, color: Vec4, name: str) -> NodePath:
    """Create a coloured box primitive used to assemble the stash model."""

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
        ((1, 0, 3, 2), Vec3(0, 0, -1)),
        ((4, 5, 6, 7), Vec3(0, 0, 1)),
        ((2, 3, 7, 6), Vec3(0, 1, 0)),
        ((0, 1, 5, 4), Vec3(0, -1, 0)),
        ((1, 2, 6, 5), Vec3(1, 0, 0)),
        ((3, 0, 4, 7), Vec3(-1, 0, 0)),
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


@dataclass
class StashBox:
    """World-space prop representing the prototype stash container."""

    node: NodePath
    inventory: Inventory
    interact_radius: float = 8.0

    def __post_init__(self) -> None:
        self._highlighted = False
        self._model_root = self.node.attachNewNode("stash_model")
        self._model_root.setTransparency(TransparencyAttrib.MAlpha)
        self._crate = self._build_crate(self._model_root)
        self.node.setColorScale(1, 1, 1, 1)

    def _build_crate(self, parent: NodePath) -> NodePath:
        """Create a simple sci-fi crate to visualise the stash location."""

        base = _make_box(Vec3(0.6, 0.6, 0.35), Vec4(0.2, 0.23, 0.28, 1), "stash_base")
        base.reparentTo(parent)
        base.setZ(0.35)

        lid = _make_box(Vec3(0.52, 0.52, 0.12), Vec4(0.32, 0.36, 0.42, 1), "stash_lid")
        lid.reparentTo(parent)
        lid.setZ(0.82)

        trim_color = Vec4(0.48, 0.65, 0.92, 1)
        strip = _make_box(Vec3(0.08, 0.6, 0.06), trim_color, "stash_trim_long")
        strip.reparentTo(parent)
        strip.setPos(0, 0, 0.72)

        strip_side = _make_box(Vec3(0.6, 0.08, 0.06), trim_color, "stash_trim_side")
        strip_side.reparentTo(parent)
        strip_side.setPos(0, 0, 0.72)
        strip_side.setH(90)

        return parent

    def destroy(self) -> None:
        if not self.node.isEmpty():
            self.node.removeNode()

    def is_player_in_range(self, player_np: NodePath) -> bool:
        if player_np is None or player_np.isEmpty():
            return False
        distance = player_np.getDistance(self.node)
        return distance <= self.interact_radius

    def set_highlighted(self, highlighted: bool) -> None:
        if highlighted == self._highlighted:
            return
        self._highlighted = highlighted
        if highlighted:
            self.node.setColorScale(1.2, 1.25, 1.35, 1)
        else:
            self.node.clearColorScale()


class StashOverlay:
    """Modal UI that exposes player and stash inventories side-by-side."""

    def __init__(self, player_inventory: Inventory, stash_inventory: Inventory) -> None:
        self.player_inventory = player_inventory
        self.stash_inventory = stash_inventory
        self.frame = DirectFrame(
            frameColor=(0.04, 0.05, 0.08, 0.96),
            frameSize=(-1.1, 1.1, -0.8, 0.8),
        )

        self.player_header = OnscreenText(
            text="Operative Inventory",
            parent=self.frame,
            pos=(-0.85, 0.55),
            scale=0.07,
            fg=(0.9, 0.92, 1.0, 1.0),
            align=TextNode.ALeft,
            shadow=(0, 0, 0, 0.8),
            mayChange=False,
        )
        self.player_body = OnscreenText(
            text="",
            parent=self.frame,
            pos=(-0.95, 0.42),
            scale=0.052,
            fg=(0.82, 0.86, 1.0, 1.0),
            align=TextNode.ALeft,
            mayChange=True,
        )

        self.stash_header = OnscreenText(
            text="Safehouse Stash",
            parent=self.frame,
            pos=(0.15, 0.55),
            scale=0.07,
            fg=(0.9, 0.92, 1.0, 1.0),
            align=TextNode.ALeft,
            shadow=(0, 0, 0, 0.8),
            mayChange=False,
        )
        self.stash_body = OnscreenText(
            text="",
            parent=self.frame,
            pos=(0.05, 0.42),
            scale=0.052,
            fg=(0.82, 0.86, 1.0, 1.0),
            align=TextNode.ALeft,
            mayChange=True,
        )

        self.instructions = OnscreenText(
            text="F - Close    Z - Deposit All    X - Withdraw All",
            parent=self.frame,
            pos=(0, -0.65),
            scale=0.05,
            fg=(0.75, 0.8, 0.95, 1.0),
            align=TextNode.ACenter,
            mayChange=True,
        )

        self.hide()

    def show(self) -> None:
        self.frame.show()
        self.refresh()

    def hide(self) -> None:
        self.frame.hide()

    def refresh(self) -> None:
        player_lines = self.player_inventory.build_summary_lines()
        stash_lines = self.stash_inventory.build_summary_lines()
        self.player_body.setText("\n".join(player_lines))
        self.stash_body.setText("\n".join(stash_lines))

    def destroy(self) -> None:
        for widget in (
            "instructions",
            "stash_body",
            "stash_header",
            "player_body",
            "player_header",
            "frame",
        ):
            element = getattr(self, widget, None)
            if element is not None:
                element.destroy()
                setattr(self, widget, None)


def transfer_all_items(source: Inventory, target: Inventory) -> int:
    """Move as many items as possible from ``source`` into ``target``."""

    moved_total = 0
    for stack in list(source.stacks):
        if stack is None:
            continue
        quantity = stack.quantity
        remainder = target.add_item(stack.template, quantity)
        moved = quantity - remainder
        if moved <= 0:
            continue
        source.remove_item(stack.template.id, moved)
        moved_total += moved
    return moved_total


__all__ = ["StashBox", "StashOverlay", "transfer_all_items"]

