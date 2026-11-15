import bpy,os,math,json
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));OUT=os.path.join(ROOT,'assets-source','v3')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for part in ['hull','seats','panel','graffiti']:
 name=f'x3d-cm-interior-{part}-uvs-150k-4096-high.glb'
 if not os.path.exists(os.path.join(OUT,name)):
  import glob
  names=glob.glob(os.path.join(OUT,f'*interior-{part}*high.glb'));name=os.path.basename(names[0])
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,name))
 objects=[o for o in bpy.data.objects if o not in before]
 for o in objects:
  if o.parent is None:o.scale*=.01
 bpy.context.view_layer.update()
 bounds=[o.matrix_world@Vector(c) for o in objects if o.type=='MESH' for c in o.bound_box]
 print('BOUNDS',part,[min(p[k] for p in bounds) for k in range(3)],[max(p[k] for p in bounds) for k in range(3)])
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world.color=(.12,.12,.12)
scene.view_settings.view_transform='AgX'
for pos,power,size in [((0,.0,1.7),80,.5),((0,0,2.5),100,.6),((-1,-.6,2),60,.3)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,-.3,2.1))-o.location).to_track_quat('-Z','Y').to_euler()
for name,eye,target in [('commander',(-.55,-.95,1.62),(-.55,-.65,2.18)),('commander-wide',(-.72,-1.0,1.7),(-.55,-.65,2.18)),('center',(0,-1.,1.68),(0,-.65,2.18))]:
 bpy.ops.object.camera_add(location=eye);c=bpy.context.object;c.rotation_euler=(Vector(target)-c.location).to_track_quat('-Z','Y').to_euler();c.data.lens=18;c.data.clip_start=.03;scene.camera=c;scene.render.filepath=os.path.join(OUT,'cockpit-'+name+'.png');bpy.ops.render.render(write_still=True)
