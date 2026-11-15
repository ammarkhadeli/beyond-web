"""Inspect official source models without modifying their source GLBs."""
import bpy, json, os, math, sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets-source', 'nasa')
reports = []
runtime = '--runtime' in sys.argv
names = ['nasa-lunar-module', 'nasa-iss'] if runtime else ['apollo-lunar-module', 'iss-b', 'iss-vtad']
for name in names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = os.path.join(ROOT, 'public', 'assets') if runtime else OUT
    bpy.ops.import_scene.gltf(filepath=os.path.join(source, name + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (low + high) / 2
    dims = high - low
    materials = []
    for m in bpy.data.materials:
        textures = [n.image.name for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image] if m.node_tree else []
        materials.append({'name': m.name, 'textures': textures})
    report = {
        'name': name, 'coordinate_system': 'Blender Z up after glTF import',
        'bounds_min': list(low), 'bounds_max': list(high), 'dimensions': list(dims),
        'mesh_count': len(meshes), 'vertices': sum(len(o.data.vertices) for o in meshes),
        'triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),
        'materials': materials,
        'images': [{'name': i.name, 'size': list(i.size), 'packed': bool(i.packed_file)} for i in bpy.data.images],
        'meshes': [{'name': o.name, 'location': list(o.matrix_world.translation), 'dimensions': list(o.dimensions)} for o in meshes]
    }
    reports.append(report)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('inspection world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.09, .11, .14, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    maxdim = max(dims)
    for title, rotation, strength in [('key',(.45,-.35,-.4),3),('fill',(.8,.4,2.5),1.8)]:
        data = bpy.data.lights.new(title,'SUN');data.energy=strength;data.angle=.2
        obj=bpy.data.objects.new(title,data);scene.collection.objects.link(obj);obj.rotation_euler=rotation
    data=bpy.data.cameras.new('inspection camera');camera=bpy.data.objects.new('inspection camera',data);scene.collection.objects.link(camera)
    camera.location = center + Vector((1.15,-1.55,.9))*maxdim
    camera.rotation_euler = (center-camera.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO';data.ortho_scale=maxdim*1.42;data.clip_end=maxdim*20
    scene.camera=camera
    scene.render.filepath=os.path.join(OUT,name+'-preview.png')
    bpy.ops.render.render(write_still=True)
    print('NASA_ASSET',name,'dimensions',list(dims),'meshes',len(meshes),'textures',len(report['images']), flush=True)
with open(os.path.join(OUT,'runtime-inspection.json' if runtime else 'inspection.json'),'w',encoding='utf-8') as f:json.dump(reports,f,indent=2)
