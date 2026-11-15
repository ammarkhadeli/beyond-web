"""Derive meter-scale suited first-person bodies from NASA/DigitalSpace mesh.

This is a posed adaptation of a static reference mesh, not a motion-captured or
articulated astronaut. Original UV photography is retained. No synthetic images.
"""
import bpy, bmesh, json, math, os
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT/'assets-source'/'v3'
OUT = ROOT/'public'/'assets'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC/'astronaut-original.glb'))
bpy.context.view_layer.update()
obj = next(o for o in bpy.context.scene.objects if o.type=='MESH')
world = obj.matrix_world.copy()
obj.parent = None
obj.matrix_world = Matrix.Identity(4)
for v in obj.data.vertices:
    v.co = world @ v.co
# The source is 74.26 units tall, interpreted as inches (1.886 m suited stature).
for v in obj.data.vertices:
    v.co *= .0254
report = {'source':'https://science.nasa.gov/3d-resources/astronaut/',
          'credit':'DigitalSpace Corporation; NASA 3D Resources',
          'sourceAsset':'assets-source/v3/astronaut-original.glb', 'sourceRevision':'d8d4d8341229e09c77a68a48438bc90f9d9f0720',
          'sourceTriangles':len(obj.data.polygons), 'rig':None, 'animations':[],
          'adaptation':'Scaled by 0.0254 to a 1.886 m suited stature. Original UV photographic textures retained. Welded duplicate vertices for smooth normals. Head, upper torso and rear backpack excluded in first-person variants to prevent camera clipping; arms and legs statically posed by vertex transforms.',
          'limitations':'Reference suit model, not a photogrammetric body scan or historical Apollo A7L reproduction. No skeleton, finger articulation, reaching animation, or hand-to-control constraints.',
          'coordinates':'Blender Z-up, front -Y; glTF Y-up, front +Z. First-person origin at approximate pelvis (source raw centre); eye in Blender (0,-0.34,0.68), glTF (0,0.68,0.34).',
          'materials':[]}
for idx,material in enumerate(obj.data.materials):
    report['materials'].append({'name':material.name,'nodes':[(n.type, getattr(getattr(n,'image',None),'name',None), list(getattr(getattr(n,'image',None),'size',[]))) for n in material.node_tree.nodes]})
    material.use_nodes=True
    material.use_backface_culling=True
    material.node_tree.nodes.clear()
    nodes=material.node_tree.nodes;links=material.node_tree.links
    shader=nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Roughness'].default_value=.82
    texture=nodes.new('ShaderNodeTexImage')
    texture.image=bpy.data.images.load(str(SRC/f'astronaut-texture-{idx*2+1}.png'))
    links.new(texture.outputs['Color'],shader.inputs['Base Color'])
    output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface'])
bm=bmesh.new();bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00002)
bm.normal_update();bm.to_mesh(obj.data);bm.free()
for p in obj.data.polygons:p.use_smooth=True
original=obj.data.copy()

def export(name):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    pending=OUT/(name+'.pending.glb')
    bpy.ops.export_scene.gltf(filepath=str(pending),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=True)
    os.replace(pending,OUT/(name+'.glb'))

obj.name='NASA_DigitalSpace_Suit'
export('astronaut-reference')

def pose(seated):
    obj.data=original.copy()
    bm=bmesh.new();bm.from_mesh(obj.data)
    # Remove helmet/neck around the eye and the backpack, which would intersect
    # the original command module seat. Do not modify source geometry on disk.
    remove=[]
    for f in bm.faces:
        c=f.calc_center_median()
        if (c.z>.08 and abs(c.x)<.34) or c.z>.60 or (c.y>.18 and c.z>-.24): remove.append(f)
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    bm.to_mesh(obj.data);bm.free()
    for v in obj.data.vertices:
        x,y,z=v.co
        # Suited arms rotate forward about their shoulder; lower them slightly.
        if abs(x)>.32 and z>.10:
            side=1 if x>0 else -1
            pivot=Vector((side*.31,0,.38))
            factor=min(1,max(0,(abs(x)-.32)/.12))
            rot=Matrix.Rotation(-side*math.radians(72)*factor,4,'Z')
            v.co=pivot+rot.to_3x3()@(v.co-pivot)
            v.co.z-=.15*factor
        if seated and z<-.13:
            hip=Vector((x,0,-.13));hipweight=min(1,max(0,(-.13-z)/.12));hiprot=Matrix.Rotation(math.radians(-76)*hipweight,4,'X').to_3x3()
            point=Vector((x,y,z))
            # Bend calf at the knee before rotating the complete leg at hip.
            if z<-.48:
                knee=Vector((x,0,-.53))
                kneeweight=min(1,max(0,(-.48-z)/.12))
                point=knee+Matrix.Rotation(math.radians(78)*kneeweight,4,'X').to_3x3()@(point-knee)
            v.co=hip+hiprot@(point-hip)
    obj.data.update()
    for p in obj.data.polygons:p.use_smooth=True

subdivision=obj.modifiers.new('Suit silhouette smoothing','SUBSURF');subdivision.levels=1;subdivision.render_levels=1
pose(False);obj.name='Suited_body_headless_standing';export('astronaut-body-standing')
standing_mesh=obj.data.copy()
pose(True);obj.name='Suited_body_headless_seated';export('astronaut-body-seated')
seated_mesh=obj.data.copy()
# Runtime contract: complete source stature 1.75 m and lowest boot at Y=0.
contract={}
for label,mesh in [('standing',standing_mesh),('seated',seated_mesh)]:
    obj.data=mesh.copy()
    factor=1.75/1.8862722
    lowest=min(v.co.z for v in obj.data.vertices)*factor
    for v in obj.data.vertices:
        v.co*=factor
        v.co.z-=lowest
    obj.name='NASA_suited_'+label
    export('astronaut-'+label)
    contract[label]={'file':'astronaut-'+label+'.glb','heightScale':factor,'sourcePelvisHeight':-lowest,'eyeHeight':1.65 if label=='standing' else 1.3,'eyeForward':.315,'forward':'glTF +Z (Blender -Y)','origin':'lowest boot; Y=0 in glTF','headRemoved':True}
obj.data=seated_mesh
report['runtimeContract']=contract
report['textureRecovery']='Used original uncompressed NASA revision. Its 174 out-of-range UVs caused Draco quantization to collapse the remaining suit UV detail; original retains 2131 unique UVs and correct fabric mapping.'
(OUT/'astronaut-reference.json').write_text(json.dumps(report,indent=2))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(SRC/'astronaut-firstperson-validation.png')
scene.world=bpy.data.worlds.new('Validation');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.15,.17,.2,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.view_settings.view_transform='AgX'
bpy.ops.object.camera_add(location=(0,-.34,.69));camera=bpy.context.object;scene.camera=camera;camera.data.lens=21;camera.data.clip_start=.01
camera.rotation_euler=(Vector((0,-.65,-.22))-camera.location).to_track_quat('-Z','Y').to_euler()
for i,position in enumerate([(-1,-1,1),(1,-1,.3)]):
    data=bpy.data.lights.new(f'Validation{i}','AREA');data.energy=45;data.size=2
    light=bpy.data.objects.new(data.name,data);scene.collection.objects.link(light);light.location=position
    light.rotation_euler=(Vector((0,-.3,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.render.render(write_still=True)
print('ASTRONAUT ASSETS READY',json.dumps(report))
