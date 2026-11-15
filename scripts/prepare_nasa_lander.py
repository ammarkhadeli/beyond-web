"""Decode NASA Apollo source into a self-contained GLB; inspect ISS docking ring."""
import bpy, os, json
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'assets-source', 'nasa')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SOURCE, 'apollo-lunar-module.glb'))
target = os.path.join(ROOT, 'public', 'assets', 'nasa-lunar-module.glb')
bpy.ops.export_scene.gltf(filepath=target+'.tmp.glb', export_format='GLB', export_draco_mesh_compression_enable=False, export_yup=True, export_cameras=False, export_lights=False)
os.replace(target+'.tmp.glb', target)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SOURCE, 'iss-vtad.glb'))
obj = bpy.data.objects.get('04 (PMA) Pressurized Mating Adapter 2')
points = [obj.matrix_world @ v.co for v in obj.data.vertices]
front = min(p.y for p in points)
ring = [p for p in points if p.y < front + .035]
low = [min(p[i] for p in ring) for i in range(3)]
high = [max(p[i] for p in ring) for i in range(3)]
center = [(low[i]+high[i])/2 for i in range(3)]
report = {'mesh': obj.name, 'coordinate_system': 'Blender Z up; forward -Y', 'front_ring_bounds_min': low, 'front_ring_bounds_max': high, 'front_ring_center': center, 'suggested_babylon_anchor_after_import_root_identity': [center[0], center[2], center[1]]}
with open(os.path.join(SOURCE, 'docking-anchor.json'), 'w') as f: json.dump(report, f, indent=2)
print('DOCKING_ANCHOR', json.dumps(report))
