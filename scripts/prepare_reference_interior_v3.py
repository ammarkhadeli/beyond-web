"""Convert NASA Astrobee's actual Destiny module and inspect its astronaut asset.

Run in Blender. Source geometry and UVs remain unchanged. Material-to-image
mapping comes from nasa/astrobee_media's us_lab.dae, since Blender 5 no longer
retains the original Blender Internal material texture slots.
"""
import bpy
import json
import math
import os
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets-source' / 'v3'
OUT = ROOT / 'public' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)


def bounds(obj):
    coords = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    return {'min': [min(v[a] for v in coords) for a in range(3)],
            'max': [max(v[a] for v in coords) for a in range(3)]}


def render_setup(scene, camera_position, look_at, filename, light_power=100):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(SRC / filename)
    scene.world = bpy.data.worlds.new('Reference validation world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.16, 0.18, 0.21, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .25
    scene.view_settings.view_transform = 'AgX'
    camera_data = bpy.data.cameras.new('Validation camera')
    camera = bpy.data.objects.new('Validation camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.location = camera_position
    camera.rotation_euler = (Vector(look_at) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.lens = 22
    camera_data.clip_start = .01
    for i, pos in enumerate([(-6, .36, .9), (-4, .36, .9), (-2, .36, .9)]):
        light_data = bpy.data.lights.new(f'Validation area {i}', 'AREA')
        light_data.energy = light_power
        light_data.shape = 'DISK'
        light_data.size = 1.2
        light = bpy.data.objects.new(light_data.name, light_data)
        scene.collection.objects.link(light)
        light.location = pos
    return camera


bpy.ops.wm.open_mainfile(filepath=str(SRC / 'iss-blend' / 'us_lab.blend'))
mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
texture_dir = SRC / 'iss' / 'astrobee_iss' / 'media' / 'materials' / 'textures'
texture_map = {
    'USLab_AFT_Bulkhead': 'Untitled.004.png',
    'USLab_FWD_Bulkhead': 'USLab_FWD_Bulkhead.png',
    'USLab_Racks_01': 'Untitled.002.png',
    'USLab_Racks_02': 'USLab_Racks_02.png',
    'USLab_Racks_03': 'Untitled.005.png',
    'Generic_Metals': 'Generic_Intersection.png',
    'Generic_Hub': 'Generic_Intersection.png',
    'Generic_Lights': 'Generic_Intersection.png',
    'Generic_Misc_Details': 'Generic_Misc_Details.png',
    'Generic_Misc_Details_LIGHTS': 'Generic_Misc_Details.png',
}
for obj in mesh_objects:
    for material in obj.data.materials:
        material.use_nodes = True
        material.node_tree.nodes.clear()
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Roughness'].default_value = .78
        shader.inputs['Metallic'].default_value = .12 if 'Metals' in material.name else 0
        output = nodes.new('ShaderNodeOutputMaterial')
        links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        image = bpy.data.images.load(str(texture_dir / texture_map[material.name]), check_existing=True)
        image.colorspace_settings.name = 'sRGB'
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        material.use_backface_culling = False

report = {
    'source': 'https://github.com/nasa/astrobee_gds/tree/master/gov.nasa.arc.verve.robot.freeflyer/models/DetailIssWorld',
    'textureSource': 'https://github.com/nasa/astrobee_media/tree/master/astrobee_iss',
    'credit': 'NASA IGOAL ISS interior, distributed by NASA Astrobee; NASA Media Usage Guidelines.',
    'module': 'US Laboratory / Destiny',
    'coordinates': 'Source Blender metres, X corridor axis, Z up. glTF export converts to X corridor, Y up, Z=-source Y.',
    'geometry': [{'name': o.name, 'vertices': len(o.data.vertices), 'polygons': len(o.data.polygons), 'bounds': bounds(o)} for o in mesh_objects],
    'textureMap': texture_map,
    'modifications': 'Restored original photographic UV textures as rough PBR materials. Original geometry/UVs/scale retained. No authored instruments or geometry added.',
    'cameraSourceCoordinates': [-1.5, .36, .05],
    'cameraTargetSourceCoordinates': [-7, .36, .05],
    'navigationSuggestedSourceCoordinates': {'x': [-6.7, -1.3], 'y': [-.35, 1.05], 'z': [-.7, .65]},
    'navigationNote': 'Conservative free-floating eye-position volume; source is zero-gravity module. Validate collisions at hatches and protrusions.',
}
for o in bpy.context.scene.objects:
    o.select_set(o in mesh_objects)
bpy.context.view_layer.objects.active = mesh_objects[0]
tmp = OUT / 'iss-interior.pending.glb'
bpy.ops.export_scene.gltf(filepath=str(tmp), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=False, export_extras=False, export_image_format='AUTO')
os.replace(tmp, OUT / 'iss-interior.glb')
report['bytes'] = (OUT / 'iss-interior.glb').stat().st_size
(OUT / 'iss-interior.json').write_text(json.dumps(report, indent=2))
print('ISS READY', json.dumps(report))
render_setup(bpy.context.scene, (-1.5, .36, .05), (-7, .36, .05), 'iss-interior-validation.png', 200)
bpy.ops.render.render(write_still=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC / 'astronaut.glb'))
astronauts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
report = {'source': 'https://science.nasa.gov/3d-resources/astronaut/',
          'credit': 'DigitalSpace Corporation; distributed by NASA 3D Resources',
          'armatures': [o.name for o in bpy.data.objects if o.type == 'ARMATURE'],
          'animations': [a.name for a in bpy.data.actions],
          'meshes': []}
for obj in astronauts:
    report['meshes'].append({'name': obj.name, 'vertices': len(obj.data.vertices),
        'polygons': len(obj.data.polygons), 'bounds': bounds(obj),
        'dimensions': list(obj.dimensions), 'materials': [m.name for m in obj.data.materials]})
    # Make positions inspectable while retaining original mesh/material/UV data.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=False)
report['nodes'] = [{'name':o.name, 'type':o.type, 'location':list(o.location), 'rotation':list(o.rotation_euler), 'scale':list(o.scale)} for o in bpy.data.objects]
(SRC / 'astronaut-inspection.json').write_text(json.dumps(report, indent=2))
print('ASTRONAUT INSPECTION', json.dumps(report))
bb = report['meshes'][0]['bounds']
center = Vector([(a+b)/2 for a,b in zip(bb['min'], bb['max'])])
size = max(b-a for a,b in zip(bb['min'], bb['max']))
camera = render_setup(bpy.context.scene, center+Vector((size*.7,-size*1.5,size*.2)), center, 'astronaut-validation.png', 100)
camera.data.lens = 45
for o in bpy.context.scene.objects:
    if o.type == 'LIGHT':
        o.location = center + Vector((size*.6, -size, size*.7))
        o.rotation_euler = (center-o.location).to_track_quat('-Z','Y').to_euler()
        o.data.energy = size*size*80
        o.data.size = size
bpy.ops.render.render(write_still=True)
