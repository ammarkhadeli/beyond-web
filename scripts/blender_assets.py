import bpy, math, os, random
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'public','assets')
os.makedirs(OUT,exist_ok=True)
random.seed(68)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def material(name,color,metal=0,rough=.5,emission=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*emission,1);p.inputs['Emission Strength'].default_value=1
 return m
shell=material('Cabin titanium graphite',(.105,.12,.135),.65,.37)
paint=material('Ceramic light gray',(.54,.57,.59),.25,.47)
trim=material('Machined anodized edges',(.23,.26,.28),.85,.27)
black=material('Elastomer seals',(.016,.022,.025),.0,.7)
fabric=material('Seat woven graphite',(.055,.068,.075),.0,.93)
white=material('Pressure suit off-white',(.71,.72,.69),.0,.76)
blue=material('Switch muted blue',(.08,.22,.27),.3,.4)
orange=material('Safety orange',(.55,.12,.04),.15,.4)
label=material('Panel labels',(.66,.7,.68),0,.8)
light=material('Status lamps',(.02,.23,.16),.1,.3,(.06,.6,.38))
metal=material('Brushed stainless steel',(.48,.5,.52),.95,.25)
window=material('Window gasket',(.035,.045,.05),.1,.65)

def assign(obj,mat):obj.data.materials.append(mat);return obj
def smooth(obj):
 if obj.type=='MESH':
  for p in obj.data.polygons:p.use_smooth=True
 return obj

def cube(name,loc,scale,mat,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);assign(o,mat)
 if bevel:
  mod=o.modifiers.new('Rounded manufacturing edges','BEVEL');mod.width=bevel;mod.segments=3
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  mod=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def cyl(name,loc,radius,depth,mat,verts=40,axis=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc);o=bpy.context.object;o.name=name;assign(o,mat)
 if axis is not None:o.rotation_euler=axis
 b=o.modifiers.new('Edge bevel','BEVEL');b.width=min(radius*.09,.025);b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name);smooth(o);return o

def beam(name,a,b,radius,mat):
 delta=Vector(b)-Vector(a);o=cyl(name,(Vector(a)+Vector(b))*.5,radius,delta.length,mat,16);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o

def sphere(name,loc,scale,mat,segments=32,rings=20):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;assign(o,mat);smooth(o);return o

def lathe(name,profile,mat,segments=64):
 vs=[];fs=[]
 for z,r in profile:
  for i in range(segments):a=2*math.pi*i/segments;vs.append((r*math.cos(a),r*math.sin(a),z))
 for j in range(len(profile)-1):
  for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;fs.append((a,b,b+segments,a+segments))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);assign(o,mat);smooth(o);return o

def text(name,body,loc,size=.035,mat=label):
 bpy.ops.object.text_add(location=loc,rotation=(math.pi/2,0,0));o=bpy.context.object;o.name=name;o.data.body=body;o.data.size=size;o.data.extrude=.0003;o.data.space_character=1.1;assign(o,mat);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return o

def panel_face(name,loc,width,height,mat):
 x,y,z=loc;mesh=bpy.data.meshes.new(name);mesh.from_pydata([(x-width/2,y,z-height/2),(x+width/2,y,z-height/2),(x+width/2,y,z+height/2),(x-width/2,y,z+height/2)],[],[(0,1,2,3)]);mesh.update()
 uv=mesh.uv_layers.new(name='UVMap')
 for poly in mesh.polygons:
  for loop,co in zip(poly.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):uv.data[loop].uv=co
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);assign(o,mat);return o

def merge_by_material(prefix=''):
 groups={}
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH' or o.name.startswith('Display'):continue
  key=(o.data.materials[0].name if o.data.materials else 'none',o.name.split('.')[0] if o.name.startswith('Stage') else '')
  groups.setdefault(key,[]).append(o)
 for (mat,part),objs in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs:o.select_set(True)
  bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();objs[0].name=prefix+(part+'_' if part else '')+mat

def export(name,selected=False):
 if not selected:bpy.ops.object.select_all(action='SELECT')
 build_dir=os.path.join(ROOT,'assets-source','.build');os.makedirs(build_dir,exist_ok=True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(build_dir,name),export_format='GLB',export_apply=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False,use_selection=selected)
 os.replace(os.path.join(build_dir,name),os.path.join(OUT,name))
 print('EXPORTED',name)

# Enclosing pressure cabin. Eye at the origin, forward +Y, up +Z.
# Curved rear shell with the forward section cut away for window panels.
verts=[];faces=[];steps=72
for j in range(19):
 z=-1.36+j*.16;radius=2.25*math.sqrt(max(.08,1-((z+.05)/2.35)**2))
 for i in range(steps+1):
  angle=math.radians(70)+math.radians(220)*i/steps
  verts.append((math.sin(angle)*radius,math.cos(angle)*radius*.68+.18,z))
for j in range(18):
 for i in range(steps):a=j*(steps+1)+i;faces.append((a,a+1,a+steps+2,a+steps+1))
mesh=bpy.data.meshes.new('Pressure shell');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Curved capsule pressure shell',mesh);bpy.context.collection.objects.link(o);assign(o,shell);smooth(o)
# Curved roof closes the pressure cabin behind the upper window arch.
rv=[];rf=[]
for j in range(13):
 y=-1.2+j*2.8/12
 for i in range(25):
  x=-2.0+i*4/24;z=1.53+.29*(1-(x/2.0)**2)-.05*((y-.2)/1.4)**2;rv.append((x,y,z))
for j in range(12):
 for i in range(24):a=j*25+i;rf.append((a,a+1,a+26,a+25))
rm=bpy.data.meshes.new('Roof shell');rm.from_pydata(rv,[],rf);rm.update();ro=bpy.data.objects.new('Curved cabin roof',rm);bpy.context.collection.objects.link(ro);assign(ro,paint);smooth(ro)
# Forward window sill and arch; wide opening with proper seal and structural members.
left=[(-1.92,1.35,-.38),(-1.85,1.65,.8),(-1.25,1.8,1.43),(0,1.88,1.59),(1.25,1.8,1.43),(1.85,1.65,.8),(1.92,1.35,-.38)]
for i in range(len(left)-1):
 beam('Window load-bearing arch',left[i],left[i+1],.10,paint)
 a=Vector(left[i]);b=Vector(left[i+1]);a.y-=.05;b.y-=.05;beam('Window rubber seal',a,b,.043,black)
beam('Forward sill',(-1.92,1.35,-.38),(1.92,1.35,-.38),.11,paint)
# Lower glazed framing edges and thin central mullion, off-axis from pilot.
beam('Offset window mullion',(.83,1.66,-.37),(.76,1.86,1.49),.036,trim)
for sign in [-1,1]:
 for z in [-1.05,-.5,.1,.72]:
  cube('Side interior insulation tile',(sign*1.91,.25,z),(.15,.82,.5),paint,.06)
 beam('Side structural rib',(sign*2.02,-.7,-1.2),(sign*2.02,-.5,.9),.065,trim)
 # side view ports surrounded by chunky curved seals, coherent under free-look
 for a,b in [((sign*1.95,.9,-.2),(sign*2.0,.75,.83)),((sign*2.0,.75,.83),(sign*1.96,-.25,1.08)),((sign*1.96,-.25,1.08),(sign*1.98,-.55,-.2))]:beam('Side port framing',a,b,.055,black)
 for j in range(7):
  cyl('Frame captive screw',(sign*1.78,1.55,-.12+j*.18),.013,.018,metal,12,(math.pi/2,0,0))
# Solid pressure-vessel front surround, a beveled manufactured ring around the glazing.
inner=[(-1.75,-.18),(-1.70,.85),(-1.15,1.3),(0,1.4),(1.15,1.3),(1.70,.85),(1.75,-.18)]
outer=[(-2.12,-.42),(-2.10,1.05),(-1.44,1.65),(0,1.78),(1.44,1.65),(2.10,1.05),(2.12,-.42)]
vs=[];fs=[];n=len(inner)
for y in [1.55,1.81]:
 for shape in [outer,inner]:
  for x,z in shape:vs.append((x,y,z))
for i in range(n):
 j=(i+1)%n;fs.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
mesh=bpy.data.meshes.new('Pressure vessel window surround');mesh.from_pydata(vs,[],fs);mesh.update();obj=bpy.data.objects.new('Integrated window bulkhead',mesh);bpy.context.collection.objects.link(obj);assign(obj,paint)
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bevel=obj.modifiers.new('Machined frame bevel','BEVEL');bevel.width=.035;bevel.segments=3;bpy.ops.object.modifier_apply(modifier=bevel.name)
# Continuous lower bulkhead and fascia seal every gap between displays and the floor.
cube('Forward lower bulkhead',(0,1.51,-1.03),(4.22,.24,1.45),shell,.085)
cube('Instrument panel continuous fascia',(0,.935,-.61),(3.56,.15,.88),shell,.045)
for sign in [-1,1]:
 cube('Forward console side enclosure',(sign*1.9,.92,-.94),(.36,1.4,1.1),shell,.08)
# Molded instrument coaming and three recessed displays.
cube('Instrument coaming',(0,1.3,-.63),(3.5,.72,.75),shell,.12)
cube('Soft coaming lip',(0,1.19,-.24),(3.53,.58,.1),black,.045)
for idx,x in enumerate([-1.1,0,1.1]):
 cube('MFD housing',(x,.905,-.58),(1.02,.15,.67),trim,.04)
 cube('MFD rubber surround',(x,.813,-.58),(.94,.045,.59),black,.025)
 panel_face(['DisplayLeft','DisplayCenter','DisplayRight'][idx],(x,.782,-.55),.84,.47,material('Display surface '+str(idx),(.02,.025,.03),0,.7))
 for xx in [-.435,.435]:
  for zz in [-.28,.28]:cyl('MFD housing screw',(x+xx,.777,-.58+zz),.011,.01,metal,12,(math.pi/2,0,0))
 for j in range(6):
  cube('MFD pushkey',(x-.36+j*.144,.772,-.889),(.075,.055,.034),black,.007)
  cube('MFD key inset',(x-.36+j*.144,.74,-.885),(.035,.012,.006),label,.001)
 text('MFD engraved label',['PROPULSION','GUIDANCE / NAV','ELECTRICAL'][idx],(x-.34,.775,-.258),.025)
# Angled lower control shelves and service panel, cabling, guards, switch boots.
for sign in [-1,1]:
 side=cube('Side console',(sign*1.33,.0,-1.05),(.64,1.28,.34),shell,.075)
 for j in range(5):
  cyl('Knurled rotary knob',(sign*1.31,.45-j*.18,-.84),.045,.055,trim,24)
  for k in range(8):
   a=2*math.pi*k/8;cyl('Rotary knob grip',(sign*1.31+.041*math.cos(a),.45-j*.18+.041*math.sin(a),-.835),.006,.045,black,8)
  cube('Switch status lamp',(sign*1.52,.45-j*.18,-.856),(.035,.07,.018),light if j<3 else orange,.006)
 for j in range(6):
  cyl('Circuit selector boot',(sign*1.68,.65-j*.19,-.77),.024,.035,black,16)
  beam('Toggle handle',(sign*1.68,.65-j*.19,-.76),(sign*1.68,.68-j*.19,-.68),.008,metal)
 # grab rail, visible while looking left/right
 beam('Crew grab handle',(sign*1.8,-.2,-.3),(sign*1.8,.45,-.3),.025,metal)
 for y in [-.2,.45]:beam('Crew handle stem',(sign*1.8,y,-.3),(sign*1.95,y,-.3),.025,metal)
 # conduit realistic detail along body
 for j in range(4):beam('Harness conduit',(sign*1.76,-.9,-1.1+j*.08),(sign*1.76,.8,-1.1+j*.08),.012,black)
# Overhead control cluster, its upper edge outside the default view, revealed by looking up.
cube('Overhead systems panel',(0,.53,1.54),(1.32,.62,.12),shell,.045)
for i in range(8):
 cube('Overhead indicator',(-.5+i*.14,.28,1.46),(.05,.06,.025),light if i<6 else orange,.007)
# Seat and astronaut lower body, low-key contextual detail, restrained proportions.
cube('Pilot seat pan',(0,-.52,-1.1),(.74,.83,.18),fabric,.1)
back=cube('Pilot seat back',(0,-.93,-.5),(.78,.22,1.25),fabric,.12);back.rotation_euler.x=-.16
for sign in [-1,1]:
 sphere('Pressure suit thigh',(sign*.24,-.14,-1.0),(.19,.43,.2),white)
 sphere('Pressure suit knee',(sign*.27,.29,-1.03),(.2,.22,.2),white)
 sphere('Pressure suit boot',(sign*.28,.63,-1.28),(.18,.32,.14),black)
 for j in range(4):
  # stitching and articulated knee folds
  beam('Suit seam',(sign*.27-.13,.22+j*.035,-.87),(sign*.27+.13,.22+j*.035,-.87),.004,label)
# Compact control sticks inside reach.
for sign in [-1,1]:
 cyl('Hand controller base',(sign*.75,.1,-.97),.12,.08,black)
 beam('Control stick',(sign*.75,.1,-.94),(sign*.73,.13,-.64),.025,trim)
 grip=sphere('Ergonomic control grip',(sign*.73,.13,-.62),(.055,.07,.12),black,24,14)
 cube('Controller thumb switch',(sign*.73,.085,-.54),(.03,.025,.025),orange,.006)
# Floor grating and fittings
cube('Cabin floor',(0,.1,-1.47),(3.65,3.5,.12),shell,.06)
for x in range(-8,9):cube('Floor nonslip strip',(x*.18,-.05,-1.4),(.055,2.2,.018),black,.005)
merge_by_material('Cockpit_');export('crew-cockpit.glb')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Orbital launcher. 70 meters tall, bevelled construction and smooth continuous surfaces.
body=material('Launcher white thermal coating',(.83,.84,.8),.2,.43)
carbon=material('Carbon fiber interstage',(.035,.043,.049),.3,.39)
nozzle=material('Engine nickel alloy',(.17,.19,.21),.95,.32)
insul=material('Nozzle copper insulation',(.32,.17,.08),.75,.53)
rocketLabel=material('Launcher dark markings',(.025,.03,.035),.1,.5)
lathe('Stage1.Fuselage',[(1.3,1.42),(2,1.82),(3,1.85),(40,1.85),(42,1.8)],body,96)
lathe('Stage1.Engine skirt',[(.3,1.65),(.6,1.8),(2,1.85),(3,1.85)],carbon,96)
lathe('Stage1.Interstage',[(40,1.853),(43.3,1.853),(44,1.7)],carbon,96)
lathe('Stage2.Tank',[(43.6,1.69),(44.3,1.84),(54.7,1.84),(56,1.55)],body,96)
lathe('Stage2.Service module',[(55.5,1.55),(58.2,1.55),(58.7,1.95)],carbon,96)
lathe('Stage2.Crew capsule',[(58.4,1.95),(59,2.0),(60.5,1.8),(62,1.43),(63.8,.85),(65,.5),(65.6,.34)],body,96)
lathe('Stage2.Nose cap',[(65,.5),(65.5,.38),(66,.24),(66.5,.05)],carbon,64)
for z in [4,12,21,30,38,44.8,49,54,59]:
 lathe(('Stage1.' if z<43 else 'Stage2.')+'Weld seam',[(z-.025,1.854),(z+.025,1.854)],trim,96)
for i in range(9):
 a=i*2*math.pi/8 if i<8 else 0;r=1.06 if i<8 else 0
 bell=lathe('Stage1.Engine bell',[(.0,.43),(.13,.4),(.38,.3),(.65,.19),(.8,.18)],nozzle,40);bell.location=(math.cos(a)*r,math.sin(a)*r,-.15)
 rim=lathe('Stage1.Engine copper lip',[(-.14,.43),(-.08,.43)],insul,40);rim.location=(math.cos(a)*r,math.sin(a)*r,0)
for i in range(4):
 a=i*math.pi/2+.3;x,y=1.85*math.cos(a),1.85*math.sin(a)
 beam('Stage1.External raceway',(x,y,5),(x,y,38),.055,body)
 # Folded longitudinal fin/landing support housing
 o=cube('Stage1.Folded stabilizer',(x*1.03,y*1.03,5.5),(.26,.3,7.0),body,.09);o.rotation_euler.z=a
for i in range(12):
 a=2*math.pi*i/12
 cube('Stage2.RCS thruster',(1.8*math.cos(a),1.8*math.sin(a),60),(.16,.22,.2),carbon,.045)
for side in [-1,1]:
 o=cube('Stage2.Capsule window',(side*.68,-1.58,61.2),(.58,.09,.64),black,.13);o.rotation_euler.x=-.26
 # Side personnel hatch with machined surrounding rim
 o=cube('Stage2.Hatch outline',(1.79,0,60),(.08,1.1,1.55),trim,.16)
 o=cube('Stage2.Hatch',(1.84,0,60),(.07,.97,1.4),body,.14)
# Intentional clean stripe identifiers, no NASA or manufacturer branding.
for z in [14,18,22]:
 lathe('Stage1.Identification band',[(z,1.855),(z+.24,1.855)],rocketLabel,96)
# Export the free-flying crew spacecraft separately from its ascent upper stage.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.name.startswith('Stage2') and not any(part in o.name for part in ['Tank','Weld seam','Nose cap']):o.select_set(True)
dock=lathe('Orbital docking collar',[(65.55,.34),(65.65,.48),(65.90,.48)],trim,64)
hatch=cyl('Orbital docking hatch',(0,0,65.88),.38,.06,black,48)
# Construction operators deselect earlier objects: restore the capsule selection.
for o in bpy.context.scene.objects:
 o.select_set(o.name.startswith('Orbital docking') or (o.name.startswith('Stage2') and not any(part in o.name for part in ['Tank','Weld seam','Nose cap'])))
export('orbital-capsule.glb',True)
bpy.data.objects.remove(dock,do_unlink=True);bpy.data.objects.remove(hatch,do_unlink=True)
merge_by_material('Rocket_');export('orbital-launcher.glb')
# Save source containing the launcher; generator remains the full reproducible source.
os.makedirs(os.path.join(ROOT,'assets-source'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets-source','orbital-launcher.blend'))
print('ASSETS COMPLETE')
