"""Teleporting portal doorway helpers for the FPS ARPG prototype."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from panda3d.core import (
    CardMaker,
    NodePath,
    Point3,
    TransparencyAttrib,
    Vec4,
)


@dataclass
class PortalTeleportResult:
    """Data describing a teleport that should be applied to the player."""

    position: Point3
    heading: float
    pitch: float


class PortalDoorway:
    """Representation of a planar teleportation doorway."""

    EXIT_FORWARD_OFFSET = 0.75
    HORIZONTAL_MARGIN = 0.35
    VERTICAL_MARGIN = 0.75

    def __init__(
        self,
        root: NodePath,
        *,
        width: float,
        height: float,
        surface: NodePath,
        frame: NodePath,
    ) -> None:
        self.root = root
        self.width = width
        self.height = height
        self.surface = surface
        self.frame = frame
        self.linked: Optional["PortalDoorway"] = None

    def link(self, other: "PortalDoorway") -> None:
        """Create a bidirectional link between two doorways."""

        self.linked = other
        other.linked = self

    def detect_crossing(
        self,
        previous_world_pos: Point3,
        current_world_pos: Point3,
        reference: NodePath,
    ) -> bool:
        """Return ``True`` if the player crossed through the doorway plane."""

        if self.linked is None:
            return False

        prev_local = self.root.getRelativePoint(reference, previous_world_pos)
        curr_local = self.root.getRelativePoint(reference, current_world_pos)

        if not (prev_local.y > 0 >= curr_local.y):
            return False

        half_width = self.width * 0.5 + self.HORIZONTAL_MARGIN
        if abs(curr_local.x) > half_width:
            return False

        lower_bound = -self.VERTICAL_MARGIN
        upper_bound = self.height + self.VERTICAL_MARGIN
        if not (lower_bound <= curr_local.z <= upper_bound):
            return False

        return True

    def compute_destination(
        self,
        world_position: Point3,
        heading: float,
        pitch: float,
        reference: NodePath,
    ) -> Optional[PortalTeleportResult]:
        """Compute the teleported position and orientation for the player."""

        if self.linked is None:
            return None

        local_point = self.root.getRelativePoint(reference, world_position)
        mirrored_point = Point3(local_point.x, -local_point.y, local_point.z)
        mirrored_point.y = max(self.EXIT_FORWARD_OFFSET, mirrored_point.y)

        exit_world = reference.getRelativePoint(self.linked.root, mirrored_point)

        source_hpr = self.root.getHpr(reference)
        target_hpr = self.linked.root.getHpr(reference)

        relative_heading = heading - source_hpr.x
        relative_pitch = pitch - source_hpr.y

        new_heading = target_hpr.x + relative_heading
        new_pitch = target_hpr.y + relative_pitch

        return PortalTeleportResult(
            position=exit_world,
            heading=new_heading,
            pitch=new_pitch,
        )


def build_portal_doorway(
    parent: NodePath,
    name: str,
    *,
    width: float = 2.5,
    height: float = 4.5,
    surface_color: Vec4 = Vec4(0.2, 0.4, 0.9, 0.65),
    frame_color: Vec4 = Vec4(0.12, 0.12, 0.16, 1.0),
) -> PortalDoorway:
    """Construct a simple rectangular doorway with a glowing surface."""

    root = parent.attachNewNode(name)

    frame = root.attachNewNode(f"{name}_frame")
    frame_thickness = 0.18

    def make_frame_card(card_name: str, x1: float, x2: float, z1: float, z2: float) -> NodePath:
        cm = CardMaker(card_name)
        cm.setFrame(x1, x2, z1, z2)
        np = frame.attachNewNode(cm.generate())
        np.setTransparency(TransparencyAttrib.MAlpha)
        np.setColor(frame_color)
        return np

    # Top and bottom segments
    make_frame_card(
        f"{name}_frame_top",
        -width * 0.5 - frame_thickness,
        width * 0.5 + frame_thickness,
        height,
        height + frame_thickness,
    )
    make_frame_card(
        f"{name}_frame_bottom",
        -width * 0.5 - frame_thickness,
        width * 0.5 + frame_thickness,
        -frame_thickness,
        0.0,
    )
    # Left and right verticals
    make_frame_card(
        f"{name}_frame_left",
        -width * 0.5 - frame_thickness,
        -width * 0.5,
        0.0,
        height,
    )
    make_frame_card(
        f"{name}_frame_right",
        width * 0.5,
        width * 0.5 + frame_thickness,
        0.0,
        height,
    )

    surface_cm = CardMaker(f"{name}_surface")
    surface_cm.setFrame(-width * 0.5, width * 0.5, 0.0, height)
    surface = root.attachNewNode(surface_cm.generate())
    surface.setTransparency(TransparencyAttrib.MAlpha)
    surface.setColor(surface_color)
    surface.setDepthWrite(False)
    surface.setLightOff(True)

    glow = root.attachNewNode(f"{name}_glow")
    glow_cm = CardMaker(f"{name}_glow_card")
    glow_scale = 1.1
    glow_cm.setFrame(
        -width * 0.5 * glow_scale,
        width * 0.5 * glow_scale,
        -0.15,
        height + 0.2,
    )
    glow_card = glow.attachNewNode(glow_cm.generate())
    glow_card.setTransparency(TransparencyAttrib.MAlpha)
    glow_card.setColor(surface_color[0], surface_color[1], surface_color[2], 0.25)
    glow_card.setDepthWrite(False)
    glow_card.setLightOff(True)

    return PortalDoorway(
        root=root,
        width=width,
        height=height,
        surface=surface,
        frame=frame,
    )
