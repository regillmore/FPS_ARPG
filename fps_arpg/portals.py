"""Teleporting portal doorway helpers for the FPS ARPG prototype."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

from panda3d.core import (
    CardMaker,
    ClipPlaneAttrib,
    GraphicsEngine,
    GraphicsOutput,
    Lens,
    NodePath,
    Plane,
    PlaneNode,
    Point3,
    RenderState,
    SamplerState,
    Texture,
    TransparencyAttrib,
    Vec3,
    Vec4,
)

if TYPE_CHECKING:  # pragma: no cover - used only for type checking
    from direct.showbase.ShowBase import ShowBase


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
        self._base_surface_color = surface.getColor()
        self._buffer: Optional[GraphicsOutput] = None
        self._texture: Optional[Texture] = None
        self._camera: Optional[NodePath] = None
        self._clip_plane: Optional[NodePath] = None
        self._graphics_engine: Optional[GraphicsEngine] = None

    def link(self, other: "PortalDoorway") -> None:
        """Create a bidirectional link between two doorways."""

        self.linked = other
        other.linked = self

    # ------------------------------------------------------------------
    def enable_see_through(self, app: "ShowBase") -> None:
        """Allocate the render target and camera used for see-through views."""

        if self.linked is None:
            return
        if self._buffer is not None:
            return

        buffer_name = f"{self.root.getName()}_portal_buffer"
        buffer = app.win.makeTextureBuffer(buffer_name, 0, 0)
        buffer.setClearColorActive(True)
        buffer.setClearColor(app.win.getClearColor())
        buffer.setSort(-100)

        texture = buffer.getTexture()
        if texture is not None:
            texture.setMinfilter(SamplerState.FTLinear)
            texture.setMagfilter(SamplerState.FTLinear)
            texture.setWrapU(SamplerState.WMClamp)
            texture.setWrapV(SamplerState.WMClamp)
            self.surface.setTexture(texture, 1)
            self.surface.setColor(1.0, 1.0, 1.0, 1.0)

        portal_camera = app.makeCamera(buffer, lens=app.camLens.makeCopy())
        portal_camera.reparentTo(app.render)

        # Ensure the portal camera never sees geometry behind the linked doorway.
        plane = Plane(Vec3(0.0, -1.0, 0.0), Point3(0.0, 0.02, 0.0))
        clip_node = PlaneNode(f"{self.root.getName()}_clip_plane", plane)
        clip_np = self.linked.root.attachNewNode(clip_node)
        clip_attr = ClipPlaneAttrib.make()
        clip_attr = clip_attr.addOnPlane(clip_np)
        portal_camera.node().setInitialState(RenderState.make(clip_attr))

        self._clip_plane = clip_np
        self._camera = portal_camera
        self._buffer = buffer
        self._texture = texture
        self._graphics_engine = app.graphicsEngine
        self.surface.setTransparency(TransparencyAttrib.MAlpha)
        self.surface.setTwoSided(True)

    def disable_see_through(self) -> None:
        """Tear down any render targets created for the portal."""

        if self._camera is not None and not self._camera.isEmpty():
            self._camera.removeNode()
        self._camera = None

        if self._clip_plane is not None and not self._clip_plane.isEmpty():
            self._clip_plane.removeNode()
        self._clip_plane = None

        if self._texture is not None and not self.surface.isEmpty():
            self.surface.clearTexture()
            self.surface.setColor(self._base_surface_color)
        self._texture = None

        if self._buffer is not None and self._graphics_engine is not None:
            self._graphics_engine.removeWindow(self._buffer)
        self._buffer = None
        self._graphics_engine = None

    def update_view(self, camera_np: NodePath, camera_lens: Lens, reference: NodePath) -> None:
        """Position the portal camera so it mimics the viewer through the link."""

        if self.linked is None or self._camera is None:
            return

        current_lens = self._camera.node().getLens()
        if current_lens is not camera_lens:
            self._camera.node().setLens(camera_lens)

        viewer_world = camera_np.getPos(reference)
        local_point = self.root.getRelativePoint(reference, viewer_world)
        mirrored_point = Point3(local_point.x, -local_point.y, local_point.z)
        mirrored_point += Vec3(0.0, 0.05, 0.0)
        target_world = reference.getRelativePoint(self.linked.root, mirrored_point)
        self._camera.setPos(reference, target_world)

        viewer_hpr = camera_np.getHpr(reference)
        source_hpr = self.root.getHpr(reference)
        target_hpr = self.linked.root.getHpr(reference)
        relative_hpr = viewer_hpr - source_hpr
        new_hpr = target_hpr + relative_hpr
        new_hpr.x += 180.0
        self._camera.setHpr(reference, new_hpr)

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

        if not (curr_local.y > -0.5 >= prev_local.y):
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
        mirrored_point.y = min(self.EXIT_FORWARD_OFFSET, mirrored_point.y)

        exit_world = reference.getRelativePoint(self.linked.root, mirrored_point)

        source_hpr = self.root.getHpr(reference)
        target_hpr = self.linked.root.getHpr(reference)

        relative_heading = heading - source_hpr.x
        relative_pitch = pitch - source_hpr.y

        new_heading = target_hpr.x + relative_heading + 180
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
    surface.setTwoSided(True)

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
