import bpy,os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(root,'assets-source','v3','lunar-cabin.blend'))
origin=Vector((-.45,-.45,1.65));target=Vector((-.2,1.02,1.52));deps=bpy.context.evaluated_depsgraph_get()
for t in [target,Vector((-.45,1.3,1.65)),Vector((0,1.1,1.6)),Vector((-.8,1.1,1.7))]:
 result=bpy.context.scene.ray_cast(deps,origin,(t-origin).normalized());print('RAY',result[0],tuple(result[1]),result[4].name if result[4]else'none')
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  vs=[o.matrix_world@Vector(p)for p in o.bound_box];print(o.name,[round(min(p[i]for p in vs),3)for i in range(3)],[round(max(p[i]for p in vs),3)for i in range(3)])
r=bpy.context.scene.ray_cast(deps,origin,(target-origin).normalized());o=r[4];face=o.data.polygons[r[3]];print('HITFACE',r[3], [tuple(o.matrix_world@o.data.vertices[k].co) for k in face.vertices]);print('matrix',o.matrix_world)
