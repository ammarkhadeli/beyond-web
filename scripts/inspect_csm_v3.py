import bpy, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for part in ['shell-90k-uvs-150k-4096-high','top-160k-uvs-150k-4096-high','filler-web']:
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(root,'assets-source','v3','x3d-cm-exterior-'+part+'.glb'))
    objects=[o for o in bpy.data.objects if o not in before]
    for o in objects:
        if o.parent is None:o.scale*=.01
    bpy.context.view_layer.update()
    verts=[o.matrix_world@Vector(v) for o in objects if o.type=='MESH' for v in o.bound_box]
    print('CSM BOUNDS',part,[min(v[k] for v in verts) for k in range(3)],[max(v[k] for v in verts) for k in range(3)])
