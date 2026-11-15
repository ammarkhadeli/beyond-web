import bpy,os,json
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'assets-source','v3','Saturn-V.glb'))
info=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 pts=[o.matrix_world@Vector(c) for c in o.bound_box]
 info.append({'name':o.name,'min':[min(p[k] for p in pts) for k in range(3)],'max':[max(p[k] for p in pts) for k in range(3)],'materials':[m.name for m in o.data.materials]})
json.dump(info,open(os.path.join(ROOT,'assets-source','v3','saturn-inspection.json'),'w'),indent=2)
print('SATURN_INSPECTION',info)
# Normalize NASA model to the documented overall Saturn V height, with feet at 0.
scale=110.6/(12.84592342376709+.1408900022506714)
center=Vector((-.010494,-.743012,-.1408900022506714))
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 matrix=o.matrix_world.copy()
 for vertex in o.data.vertices:vertex.co=(matrix@vertex.co-center)*scale
 o.matrix_world.identity()
 # Split connected stage geometry along physical stack boundaries, preserving UVs.
 import bmesh
 for stage,low,high in [('SIC',-1,42),('SII',42,67),('SIVB',67,88),('CSM',88,200)]:
  copied=o.data.copy();bm=bmesh.new();bm.from_mesh(copied)
  remove=[face for face in bm.faces if not low<=face.calc_center_median().z<high]
  bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(copied);bm.free()
  if len(copied.polygons):
   item=bpy.data.objects.new(stage+'-'+o.name,copied);bpy.context.collection.objects.link(item)
 bpy.data.objects.remove(o,do_unlink=True)
output=os.path.join(ROOT,'public','assets','nasa-saturn-v.glb');temp=os.path.join(ROOT,'assets-source','v3','saturn-export.glb')
bpy.ops.export_scene.gltf(filepath=temp,export_format='GLB',export_apply=True)
os.replace(temp,output)
