"""Columbia scanned hull with a referenced, original Apollo service module.
Metric deck origin and orientation match the interior scan. Blender Z is up.
The Smithsonian hull is the returned artifact, including its flown surface.
SM details reference https://www.nasa.gov/history/diagrams/apollo.html and
NASA Information Summaries (167718main_early_years.pdf): 3.9m diameter, 7.5m length.
"""
import os,json
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exec(open(os.path.join(root,'scripts','blender_assets.py'),encoding='utf8').read().split('# Enclosing pressure cabin.')[0])
SRC=os.path.join(ROOT,'assets-source','v3')
for part in ['shell-90k-uvs-150k-4096-high','top-160k-uvs-150k-4096-high','filler-web']:
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=os.path.join(SRC,'x3d-cm-exterior-'+part+'.glb'))
 objects=[o for o in bpy.data.objects if o not in before]
 for o in objects:
  if o.parent is None:o.scale*=.01
 bpy.context.view_layer.update()
 for o in objects:
  if o.type!='MESH':continue
  matrix=o.matrix_world.copy()
  for v in o.data.vertices:v.co=matrix@v.co
  o.parent=None;o.matrix_world.identity();o.name='CM-Scan-'+part
  for m in o.data.materials:
   if m and m.use_nodes:
    p=m.node_tree.nodes.get('Principled BSDF')
    if p:p.inputs['Metallic'].default_value=.25;p.inputs['Roughness'].default_value=.53

aluminum=material('Service module aluminum',(.51,.53,.54),.8,.36)
radiator=material('Thermal radiator white coating',(.75,.76,.73),.08,.73)
ablator=material('Heat shield ablator',(.16,.10,.055),.08,.92)
nozzle=material('SPS nozzle radiative finish',(.075,.067,.059),.7,.6)
gold=material('Service module insulation',(.43,.24,.055),.78,.46)
lathe('CM-Aft heat shield',[(.05,.01),(.06,.5),(.10,1.1),(.20,1.65),(.34,1.91),(.436,1.955)],ablator,128)
cyl('CM-Docking collar',(0,0,3.19),.40,.12,aluminum,64)
lathe('CM-Docking collar recess',[(3.26,.38),(3.26,.28),(3.27,.27)],black,64)
for a in range(0,360,120):
 angle=math.radians(a);beam('CM-Docking probe leg',(.28*math.cos(angle),.28*math.sin(angle),3.24),(0,0,3.58),.022,aluminum)
sphere('CM-Docking probe',(0,0,3.60),(.055,.055,.09),aluminum)

# SM cylindrical pressure skin, circular caps and curved thermal-control sectors.
lathe('SM-Body',[(-4.10,1.91),(-4.04,1.95),(-.12,1.95),(-.04,1.91)],aluminum,128)
cyl('SM-Aft engine bulkhead',(0,0,-4.08),1.92,.07,aluminum,96)
cyl('SM-Forward bulkhead',(0,0,-.06),1.92,.08,aluminum,96)
def sector(name,angle,width,z0,z1,r,mat):
 vs=[];faces=[];n=24
 for z in [z0,z1]:
  for i in range(n+1):
   a=angle-width/2+width*i/n;vs.append((r*math.cos(a),r*math.sin(a),z))
 for i in range(n):faces.append((i,i+1,n+i+2,n+i+1))
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);assign(o,mat);smooth(o)
for j in range(6):
 a=math.tau*j/6
 beam('SM-Sector joint',(1.956*math.cos(a),1.956*math.sin(a),-4),(1.956*math.cos(a),1.956*math.sin(a),-.12),.013,trim)
 sector('SM-Upper fuel-cell radiator',a+.29,.38,-1.13,-.25,1.962,radiator)
 sector('SM-Lower radiator',a+.50,.85,-3.87,-2.23,1.962,radiator)
 for k in range(11):
  aa=a+.50-.41+k*.082
  beam('SM-Radiator coolant channel',(1.969*math.cos(aa),1.969*math.sin(aa),-3.82),(1.969*math.cos(aa),1.969*math.sin(aa),-2.27),.007,paint)
 for z in [-.2,-1.2,-2.15,-3.96]:
  sector('SM-Panel seam',a+.50,.95,z-.008,z+.008,1.963,trim)
 # Small access panel perimeter and captive fasteners on the exposed band.
 sector('SM-Service access panel',a+.32,.26,-1.95,-1.36,1.964,paint)
 for aa in [a+.20,a+.44]:
  for z in [-1.91,-1.4]:sphere('SM-Panel fastener',(1.972*math.cos(aa),1.972*math.sin(aa),z),(.012,.012,.012),metal,12,6)

# Four reaction-control quads, each with tangential and axial nozzle pairs.
for j in range(4):
 a=math.tau*j/4+math.pi/4;rad=Vector((math.cos(a),math.sin(a),0));tan=Vector((-math.sin(a),math.cos(a),0));base=rad*2.03+Vector((0,0,-1.62))
 b=cube('SM-RCS quad housing',base,(.38,.48,.43),gold,.035);b.rotation_euler.z=a
 for d,offset in [(tan,Vector((0,0,.07))),(-tan,Vector((0,0,-.07))),(Vector((0,0,1)),tan*.08),(Vector((0,0,-1)),-tan*.08)]:
  bell=lathe('SM-RCS thruster',[(0,.035),(.07,.04),(.18,.09),(.18,.074),(.07,.027),(0,.025)],nozzle,32)
  bell.location=base+offset+d*.15;bell.rotation_euler=d.to_track_quat('Z','Y').to_euler()

# SPS bell is open, with a dark inner surface and exterior reinforcement rings.
profile=[(-4.05,.30),(-4.35,.32),(-4.70,.46),(-5.2,.65),(-5.9,.86),(-6.65,1.08),(-7.48,1.25),(-7.50,1.23),(-6.65,1.05),(-5.9,.83),(-5.2,.62),(-4.70,.43),(-4.35,.29),(-4.05,.27)]
lathe('SM-SPS nozzle',profile,nozzle,128)
for z,r in [(-4.7,.46),(-5.2,.65),(-5.9,.86),(-6.65,1.08),(-7.48,1.25)]:
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.012,major_segments=96,minor_segments=8,location=(0,0,z));o=bpy.context.object;o.name='SM-Nozzle reinforcement';assign(o,trim)
for j in range(6):
 a=math.tau*j/6;beam('SM-Engine mounting strut',(1.5*math.cos(a),1.5*math.sin(a),-4.08),(.35*math.cos(a),.35*math.sin(a),-4.62),.035,metal)

# High-gain antenna: a four-reflector array mounted on the aft boom.
beam('SM-High gain antenna boom',(1.4,0,-3.8),(2.7,0,-4.8),.035,aluminum)
for y in [-.38,.38]:
 for z in [-5.18,-4.42]:
  dish=lathe('SM-High gain reflector',[(0,.01),(.025,.13),(.09,.26),(.16,.35)],aluminum,48)
  dish.rotation_euler.y=math.pi/2;dish.location=(2.72,y,z)
  beam('SM-Reflector support',(2.65,0,-4.8),(2.72,y,z),.018,aluminum)
  beam('SM-Antenna feed',(2.72,y,z),(3.04,y,z),.008,metal)

# Batch only within each separation group; retain the scanned textured meshes.
for prefix in ['CM-','SM-']:
 groups={}
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH' and o.name.startswith(prefix) and not o.name.startswith('CM-Scan'):
   key=o.data.materials[0].name if o.data.materials else 'none';groups.setdefault(key,[]).append(o)
 for mat,objects in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=prefix+mat
export('apollo-csm.glb')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.world.color=(.12,.12,.12)
bpy.ops.object.light_add(type='AREA',location=(7,-7,8));light=bpy.context.object;light.data.energy=2000;light.data.size=8;light.rotation_euler=(Vector((0,0,-1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA',location=(-4,2,2));light=bpy.context.object;light.data.energy=900;light.data.size=6;light.rotation_euler=(Vector((0,0,-1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(12,-16,7));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,-1.8))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=48;scene.camera=camera
scene.render.filepath=os.path.join(SRC,'apollo-csm-preview.png');bpy.ops.render.render(write_still=True)
