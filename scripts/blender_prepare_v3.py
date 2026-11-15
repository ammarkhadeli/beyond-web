import bpy,os,json,math
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));SRC=os.path.join(ROOT,'assets-source','v3');OUT=os.path.join(ROOT,'public','assets');os.makedirs(os.path.join(OUT,'lunar'),exist_ok=True)
# Keep the source TIFF; produce a compressed color texture at its original8K resolution.
bpy.ops.wm.open_mainfile(filepath=os.path.join(SRC,'iss-blend','us_lab.blend'))
report={'objects':[],'materials':[],'images':[]}
for o in bpy.context.scene.objects:
 if o.type=='MESH':report['objects'].append({'name':o.name,'location':list(o.location),'rotation':list(o.rotation_euler),'dimensions':list(o.dimensions),'materials':[m.name if m else '' for m in o.data.materials]})
for m in bpy.data.materials:report['materials'].append({'name':m.name,'nodes':m.use_nodes,'color':list(m.diffuse_color),'tree':[(n.name,n.type,getattr(getattr(n,'image',None),'name',None)) for n in m.node_tree.nodes] if m.node_tree else []})
for im in bpy.data.images:report['images'].append({'name':im.name,'filepath':im.filepath,'size':list(im.size)})
json.dump(report,open(os.path.join(SRC,'iss-inspection.json'),'w'),indent=2);print('ISS INSPECTION',len(report['objects']),len(report['materials']))
