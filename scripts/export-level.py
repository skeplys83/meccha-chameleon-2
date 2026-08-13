"""Export one .blend to public/maps/<id>.glb with the settings the game expects.

Driven by export-level.sh — run that rather than this. Blender-side only:
nothing here knows anything about the game beyond where to put the file.

    blender --background <in.blend> --python export-level.py -- <out.glb>
"""

import os
import sys

import bpy

out = os.path.abspath(sys.argv[sys.argv.index("--") + 1])

# The kit palette must never be exported: it is 211 models parked off the side
# of the map, and including it multiplies the file size and drops a field of
# furniture into the level. It is normally excluded in the .blend already; this
# forces it for the duration of the export so a .blend saved with it ticked on
# still exports correctly. Not saved, so the file on disk is left alone.
restore = []
for child in bpy.context.view_layer.layer_collection.children:
    if child.name == "kit" and not child.exclude:
        print("  ! the 'kit' collection was visible — excluding it for this export")
        child.exclude = True
        restore.append(child)

# Every *other* collection is forced the other way, for the mirror-image reason.
# `use_visible` below means a collection you toggled off in the outliner to see
# past it — `collision` is the one you always want out of the way — exports as
# if it were not in the file. Hiding the colliders that way silently shipped a
# dungeon with nothing to stand on. Restored after, so the .blend is untouched.
unhidden = []
for child in bpy.context.view_layer.layer_collection.children:
    if child.name == "kit":
        continue
    if child.exclude or child.hide_viewport or child.collection.hide_viewport:
        print(f"  ! the '{child.name}' collection was hidden — showing it for this export")
        unhidden.append((child, child.exclude, child.hide_viewport, child.collection.hide_viewport))
        child.exclude = False
        child.hide_viewport = False
        child.collection.hide_viewport = False

hidden_objects = []
for obj in bpy.data.objects:
    if obj.hide_get() if obj.name in bpy.context.view_layer.objects else False:
        hidden_objects.append(obj)
        obj.hide_set(False)
if hidden_objects:
    print(f"  ! {len(hidden_objects)} hidden object(s) — showing them for this export")

# A `*_lift` empty parks part of the map out of the way while you work on what
# was under it — the dungeon's roof rides one. The offset is a view of the
# level, not part of it, so it is zeroed for the export and put back after.
# Leave the roof in the air permanently; every export still comes out right.
lifted = []
for obj in bpy.data.objects:
    if obj.name.endswith("_lift") and obj.type == "EMPTY" and tuple(obj.location) != (0, 0, 0):
        print(f"  ! '{obj.name}' is raised — exporting it at the origin")
        lifted.append((obj, tuple(obj.location)))
        obj.location = (0.0, 0.0, 0.0)

# Children follow the parent only once the dependency graph has caught up.
if lifted:
    bpy.context.view_layer.update()

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    # Only what is visible: this is what leaves the kit palette behind.
    use_visible=True,
    # glTF is Y-up, Blender is Z-up. Without this the whole map lies on its side.
    export_yup=True,
    # Export the evaluated mesh, not the pre-modifier cage.
    export_apply=True,
    # A map with no lights arrives black.
    export_lights=True,
    export_cameras=False,
    # Object custom properties land in node `extras`. Nothing reads them today;
    # they are the obvious place for per-object gameplay data later.
    export_extras=True,
)

for child in restore:
    child.exclude = False
for child, exclude, hide_vl, hide_coll in unhidden:
    child.exclude, child.hide_viewport, child.collection.hide_viewport = exclude, hide_vl, hide_coll
for obj in hidden_objects:
    obj.hide_set(True)

# A level with no collision loads, draws, and drops you through the floor — so
# it fails here instead. The prefixes are the ones `world/levelScene.ts` reads.
PREFIXES = ("col_", "colhull_", "coltri_", "colball_")
colliders = [o.name for o in bpy.data.objects if o.name.startswith(PREFIXES)]
if not colliders:
    raise SystemExit(f"refusing to write {out}: no col_* objects — nothing to stand on")

print(f"exported {out}  ({len(colliders)} colliders)")
