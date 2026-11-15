"""Referenced LM crew compartment; original geometry, not a complete historical reconstruction.
Sources: NASA TN D-6722, NASA LM crew station report1975, Apollo11 AS11-36-5389.
Coordinates: standing deck Z=0, forward+Y; camera(-.45,-.45,1.65).
"""
import os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exec(open(os.path.join(root,'scripts','blender_assets.py'),encoding='utf8').read().split('# Enclosing pressure cabin.')[0])
from mathutils import Matrix
panel=material('LM gray-green painted instrument panels',(.105,.145,.16),.12,.64)
liner=material('LM insulated pressure liner',(.38,.40,.37),.02,.88)
rail=material('LM titanium handrails',(.28,.31,.32),.72,.38)
ink=material('LM white engraved lettering',(.72,.75,.69),.03,.85)
red=material('LM caution switch caps',(.34,.035,.02),.15,.48)
olive=material('LM restraint webbing',(.24,.23,.16),0,.96)
ivory=material('LM cream switch escutcheons',(.49,.44,.33),.02,.8)
amber=material('LM unlit amber caution legends',(.19,.11,.025),0,.65)
dial=material('LM black instrument dial enamel',(.009,.014,.014),.05,.61)

# Curved shell and ribbed aft pressure wall, open at the forward triangular windows.
vs=[];fs=[];steps=64
for j in range(17):
 z=.03+j*2.2/16
 for i in range(steps+1):
  a=math.radians(60)+math.radians(240)*i/steps
  vs.append((1.23*math.sin(a),1.1*math.cos(a)-.1,z))
for j in range(16):
 for i in range(steps):
  a=j*(steps+1)+i;fs.append((a,a+1,a+steps+2,a+steps+1))
mesh=bpy.data.meshes.new('LM pressure shell');mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new('LM insulated curved cabin',mesh);bpy.context.collection.objects.link(o);assign(o,liner);smooth(o)
cube('LM deck',(0,-.10,-.06),(2.45,2.1,.12),panel,.09)
cube('LM ceiling',(0,-.10,2.25),(2.4,2.1,.13),liner,.1)
for x in [-1.15,-.77,-.39,0,.39,.77,1.15]:
 beam('Pressure vessel stiffener',(x,-1.1,.08),(x,-1.1,2.16),.022,rail)
for z in [.08,.44,.8,1.16,1.52,1.88,2.16]:
 beam('Aft insulation seam',(-1.03,-1.11,z),(1.03,-1.11,z),.006,paint)
for x in [-.72,.72]:
 cube('Equipment stowage cover',(x,-1.04,.82),(.75,.14,1.24),liner,.06)
 for z in [.3,.8,1.3]:
  cube('Stowage retaining strap',(x,-.946,z),(.75,.018,.035),olive,.008)
  cube('Stowage buckle',(x+.22,-.925,z),(.07,.014,.055),metal,.005)
# Aft cylindrical ascent engine cover between crew positions.
sphere('Ascent engine cover',(0,-.7,.37),(.4,.49,.38),liner,48,24)
for x in [-.48,.48]:
 for j in range(8):cube('Anti-slip foot restraint',(x,-.3+j*.075,.011),(.37,.025,.018),black,.006)

# Forward bulkhead with two real, separate triangular apertures (no fake panoramic screen).
cube('Lower forward pressure wall',(0,1.10,.47),(2.5,.17,.94),liner,.05)
cube('Upper forward pressure wall',(0,1.10,2.19),(2.5,.17,.24),liner,.04)
cube('Central structural web',(0,1.1,1.56),(.84,.16,1.16),panel,.025)
for sign in [-1,1]:
 # Three glazing boundaries, pressure-vessel infill outside the aperture.
 aperture=[(sign*.43,1.02,1.03),(sign*.43,1.02,2.07),(sign*1.12,1.02,2.07)]
 for i in range(3):
  a=Vector(aperture[i]);b=Vector(aperture[(i+1)%3]);beam('Triangular window machined surround',a,b,.033,rail);a.y-=.016;b.y-=.016;beam('Triangular window elastomer seal',a,b,.015,black)
  for k in range(1,8):
   p=a.lerp(b,k/8);cyl('Window flange screw',p+Vector((0,-.03,0)),.006,.009,metal,12,(math.pi/2,0,0))
 # Opaque lower outer triangular section.
 points=[(sign*.43,1.10,1.03),(sign*1.2,1.10,1.03),(sign*1.2,1.10,2.11)]
 mm=bpy.data.meshes.new('Forward pressure vessel segment');mm.from_pydata(points,[],[(0,1,2)]);mm.update();ob=bpy.data.objects.new('Window external pressure surround',mm);bpy.context.collection.objects.link(ob);assign(ob,liner)
 beam('Window side structural post',(sign*1.21,1.02,.94),(sign*1.21,1.02,2.18),.042,rail)
 # Grabbable rails and restraint belts adjacent to each standing station.
 beam('Crew vertical grab rail',(sign*.99,.73,.96),(sign*.99,.73,1.89),.019,rail)
 for z in [1.0,1.83]:beam('Grab rail attachment',(sign*.99,.73,z),(sign*1.1,.94,z),.015,rail)
 # Landing point designator is engraved on commander's glazing only.
 if sign==-1:
  for j in range(8):
   z=1.39+j*.055;beam('Landing point designator reticle',(-.63,1.009,z),(-.54,1.009,z),.0011,ink)
  beam('Landing point designator vertical',(-.585,1.009,1.39),(-.585,1.009,1.81),.0011,ink)

# Small instrument subpanels with separate sockets, legible inscriptions and fasteners.
def plate(name,x,y,z,w,h):
 cube(name,(x,y,z),(w,.035,h),panel,.012)
 for xx in [-w/2+.015,w/2-.015]:
  for zz in [-h/2+.015,h/2-.015]:
   cyl('Captive panel fastener',(x+xx,y-.023,z+zz),.005,.006,metal,12,(math.pi/2,0,0))
   beam('Fastener slot',(x+xx-.003,y-.027,z+zz),(x+xx+.003,y-.027,z+zz),.0007,black)
 return y-.025

def label_at(body,x,y,z,size=.012):return text('LM engraved '+body,body,(x,y,z),size,ink)
def toggle(name,x,y,z,on=False):
 cyl(name+' bezel',(x,y,z),.011,.014,metal,20,(math.pi/2,0,0))
 cyl(name+' switch rubber seal',(x,y-.009,z),.008,.005,black,16,(math.pi/2,0,0))
 beam(name+' lever',(x,y-.01,z),(x,y-.045,z+(.016 if on else -.016)),.004,metal)
 sphere(name+' tip',(x,y-.048,z+(.016 if on else -.016)),(.005,.01,.005),ink,12,8)
def selector(name,x,y,z):
 cyl(name+' selector skirt',(x,y,z),.021,.012,black,32,(math.pi/2,0,0))
 cyl(name+' selector',(x,y-.014,z),.013,.027,rail,24,(math.pi/2,0,0))
 cube(name+' grip',(x,y-.031,z),(.012,.014,.042),black,.004)
 label_at(name,x-.026,y-.024,z+.036,.009)

# Main panels 1 and 2: grouping and legends from NASA crew-station report,
# figure 3 (PDF page 14), cross-checked against flown photo AS11-36-5389.
# This is a reduced, readable reconstruction; not every switch is simulated.
def outline(name,x,y,z,w,h):
 for a,b in [((x-w/2,y,z-h/2),(x+w/2,y,z-h/2)),((x+w/2,y,z-h/2),(x+w/2,y,z+h/2)),((x+w/2,y,z+h/2),(x-w/2,y,z+h/2)),((x-w/2,y,z+h/2),(x-w/2,y,z-h/2))]:
  beam(name,a,b,.0007,ink)

def display_surface(name,x,y,z,w,h):
 if name.startswith('LMAttitude'):
  # A circular textured face keeps the spherical FDAI visually distinct from a
  # modern rectangular display while retaining the runtime texture interface.
  radius=min(w,h)/2
  cyl(name+' circular inset',(x,y,z),radius+.004,.018,black,64,(math.pi/2,0,0))
  vertices=[(x,y-.012,z)]+[(x+radius*math.cos(math.tau*i/64),y-.012,z+radius*math.sin(math.tau*i/64)) for i in range(64)]
  faces=[(0,i+1,(i+1)%64+1) for i in range(64)]
  mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
  uv=mesh.uv_layers.new(name='UVMap')
  for poly in mesh.polygons:
   for loop in poly.loop_indices:
    v=mesh.vertices[mesh.loops[loop].vertex_index].co
    uv.data[loop].uv=((v.x-x)/w+.5,(v.z-z)/h+.5)
  face=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(face);assign(face,dial)
 else:
  cube(name+' inset housing',(x,y,z),(w+.015,.018,h+.015),black,.006)
  panel_face(name,(x,y-.012,z),w,h,dial)

def instrument_ring(name,x,y,z,r):
 cyl(name+' octagonal case',(x,y,z),r*1.22,.035,black,8,(math.pi/2,0,0))
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.006,major_segments=48,minor_segments=10,location=(x,y-.022,z),rotation=(math.pi/2,0,0));assign(bpy.context.object,rail)
 for i in range(24):
  a=math.tau*i/24;rr=r*(.84 if i%3==0 else .90)
  beam(name+' degree tick',(x+rr*math.sin(a),y-.030,z+rr*math.cos(a)),(x+r*.96*math.sin(a),y-.030,z+r*.96*math.cos(a)),.0008,ink)
 for dx,dz in [(-1,-1),(-1,1),(1,-1),(1,1)]:
  cyl(name+' mounting screw',(x+dx*r*.93,y-.026,z+dz*r*.93),.003,.004,metal,12,(math.pi/2,0,0))

def meter(name,x,y,z,w=.047,h=.12):
 cube(name+' meter case',(x,y,z),(w+.011,.018,h+.012),black,.005)
 panel_face(name+' static scale',(x,y-.012,z),w,h,dial)
 for k in range(7):
  zz=z-h*.4+k*h*.8/6
  beam(name+' scale division',(x-w*.30,y-.014,zz),(x-w*(.03 if k%2==0 else .15),y-.014,zz),.00065,ink)
 beam(name+' reference pointer',(x+w*.34,y-.015,z),(x-w*.02,y-.015,z),.001,ink)
 label_at(name,x-w*.49,y-.015,z+h*.5+.014,.0064)

for sign in [-1,1]:
 x=sign*.205;f=plate('LM main panel '+('1' if sign<0 else '2'),x,.943,1.595,.396,1.01)
 label_at('1' if sign<0 else '2',x-.176,f-.005,2.065,.017)
 # Actual LM caution/warning legends, dark until a real simulation alarm drives them.
 legends=(['ASC PRESS','DES QTY','RCS A REG','RCS B REG','ENG STOP','RCS','CES AC','CES DC','DC BUS','BATTERY','INVERTER','GUIDANCE'] if sign<0 else ['ASC HI REG','GLYCOL','CABIN','SUIT FAN','O2 QTY','CO2','WATER QTY','S BAND','LR','RR','SUIT TEMP','ECS'])
 for i,name in enumerate(legends):
  xx=x-.135+(i%3)*.09;zz=2.025-(i//3)*.029
  cube('Caution annunciator '+name,(xx,f-.013,zz),(.084,.012,.025),black,.003)
  label_at(name,xx-.038,f-.021,zz-.0035,.0057)
 outline('Caution display frame',x,f-.025,1.982,.279,.122)
 if sign<0:
  label_at('MISSION TIMER',x-.177,f-.015,1.895,.007)
  cube('Mission timer black bezel',(x-.092,f-.011,1.867),(.17,.018,.035),black,.004)
  label_at('00 00 00',x-.165,f-.025,1.86,.015)
  label_at('EVENT TIMER',x+.002,f-.015,1.895,.007)
  cube('Event timer bezel',(x+.094,f-.011,1.867),(.17,.018,.035),black,.004)
  label_at('00 00',x+.035,f-.025,1.86,.015)
  for i,name in enumerate(['THRUST','TEMP','PRESS']):meter(name,x+.008+i*.058,f-.006,1.735,.043,.105)
  # Cross-pointer instrument with reference graticule; live FDAI remains separate.
  cube('Cross pointer case',(x-.103,f-.005,1.744),(.123,.022,.118),black,.008)
  for delta in [-.036,-.018,0,.018,.036]:
   beam('Cross pointer horizontal',(x-.155,f-.020,1.744+delta),(x-.051,f-.020,1.744+delta),.0006,ink)
   beam('Cross pointer vertical',(x-.103+delta,f-.020,1.692),(x-.103+delta,f-.020,1.796),.0006,ink)
  label_at('X POINTER',x-.15,f-.022,1.815,.007)
  instrument_ring('Flight director attitude',x-.075,f-.009,1.535,.081)
  display_surface('LMAttitude',x-.075,f-.037,1.535,.137,.137)
  display_surface('LMAltitude',x+.068,f-.009,1.54,.050,.176)
  display_surface('LMVelocity',x+.132,f-.009,1.54,.050,.176)
  label_at('ALT',x+.046,f-.024,1.648,.007);label_at('RATE',x+.106,f-.024,1.648,.007)
  label_at('FDAI',x-.094,f-.051,1.432,.008)
  # Locking switches, grouped by actual engine/control function.
  groups=[['RATE SCALE','ACA PROP','GUID CONT'],['ENG ARM','ATT CONT','BAL CPL'],['DES ENG','MAN THROT','THR CONT']]
 else:
  for i,name in enumerate(['TEMP','PRESS','QTY','GLYCOL','PRESS']):meter(name,x-.142+i*.071,f-.006,1.797,.049,.143)
  label_at('REACTION CONTROL',x-.164,f-.024,1.897,.007)
  label_at('ECS',x+.067,f-.024,1.897,.007)
  # Redundant LMP attitude display, distinct live surface for renderer binding.
  instrument_ring('LMP flight director attitude',x+.089,f-.009,1.535,.081)
  display_surface('LMAttitudeRight',x+.089,f-.037,1.535,.137,.137)
  for row in range(3):
   for col,name in enumerate(['ASC FEED','MAIN SOV']):
    xx=x-.145+col*.086;zz=1.655-row*.09
    cube(name+' talkback',(xx,f-.012,zz+.026),(.028,.010,.015),ivory,.002)
    toggle(name,xx,f-.014,zz-.008,row==0)
  label_at('SYSTEM A',x-.176,f-.025,1.717,.007);label_at('SYSTEM B',x-.088,f-.025,1.717,.007)
  groups=[['RCS A','RCS B','CROSSFEED'],['SUIT FAN','GLYCOL','WATER'],['O2 FLOW','CABIN','CO2']]
 for row,names in enumerate(groups):
  for col,name in enumerate(names):
   xx=x-.128+col*.127;zz=1.341-row*.091
   label_at(name,xx-.043,f-.024,zz+.035,.007)
   toggle(name,xx,f-.015,zz,row==1)
   label_at('ON',xx-.011,f-.025,zz+.018,.0055);label_at('OFF',xx-.014,f-.025,zz-.039,.0055)
  outline('Grouped control boundary',x,f-.026,zz-.002,.372,.088)
 # Switch-guard rails, wiring-service edge and fastener detail.
 for xx in [x-.188,x+.188]:beam('Main panel edge guard',(xx,f-.04,1.12),(xx,f-.04,2.08),.004,rail)

# Small electrical/propellant readouts preserve named surfaces for live telemetry.
for name,x,labeltext in [('LMFuel',-.28,'PROPELLANT QTY'),('LMPower',.12,'DC BUS VOLTS')]:
 y=plate(labeltext+' subpanel',x,.845,1.035,.32,.10)
 display_surface(name,x+.062,y-.010,1.026,.14,.042)
 label_at(labeltext,x-.145,y-.024,1.055,.007)
 selector('QTY MON' if name=='LMFuel' else 'BUS',x-.107,y-.014,1.013)
# Lower commander's panel copied in arrangement from the LM reference, not a modern MFD.
for sign in [-1,1]:
 x=sign*.72;y=plate('LM lower control panel',x,.88,.78,.83,.43)
 label_at('GUIDANCE CONTROL' if sign==-1 else 'PROPULSION',x-.33,y-.002,.955,.015)
 for j,name in enumerate(['MODE','ATT HOLD','RATE CMD'] if sign==-1 else ['ASCENT','DESCENT','RCS']):
  xx=x-.26+j*.25;label_at(name,xx-.035,y-.003,.874,.010);toggle(name,xx,y-.013,.832,j==1)
 for j,name in enumerate(['ENGINE ARM','THRUST','ABORT STAGE'] if sign==-1 else ['QUANTITY','HELIUM','TEMP']):
  xx=x-.26+j*.25;selector(name,xx,y-.012,.70)
 label_at('MANUAL' if sign==-1 else 'FUEL / OXIDIZER',x-.30,y-.006,.62,.009)
 # Angled side circuit/control panel with visible depth, wiring behind its lip.
 collection=[];before=set(bpy.context.scene.objects)
 yy=plate('LM recessed circuit breaker panel '+('11' if sign<0 else '16'),0,0,1.58,.70,.83)
 label_at('CDR CIRCUIT BREAKERS' if sign==-1 else 'LMP CIRCUIT BREAKERS',-.30,yy-.002,1.954,.012)
 # Recessed push-pull banks and raised barrier rails are documented in the
 # crew-station report, figures 8 and 9, to prevent accidental glove actuation.
 breakers=(['AC BUS','DC BUS','BAT 1','BAT 2','INV 1','INV 2','INST','DISP'],
           ['PGNS','AGS','IMU','ASA','DSKY','DEDA','FDAI','RDR'],
           ['RCS A','RCS B','ASC','DES','SOV','IGN','THR','CONT'],
           ['VHF A','VHF B','S BAND','COMM','TRACK','ANT','RCVR','XMTR'],
           ['SUIT','CABIN','GLYCOL','O2','WATER','CO2','PUMP','FAN'])
 for row,names in enumerate(breakers):
  zz=1.849-row*.139
  cube('Recessed breaker channel',(0,yy-.001,zz),(.646,.013,.099),black,.005)
  for j,name in enumerate(names):
   xx=-.284+j*.081
   cyl(name+' circuit breaker base',(xx,yy-.013,zz),.014,.010,metal,16,(math.pi/2,0,0))
   cyl(name+' push pull breaker',(xx,yy-.027,zz),.010,.027,black,16,(math.pi/2,0,0))
   label_at(name,xx-.026,yy-.038,zz+.029,.0062)
  beam('Breaker row protective barrier',(-.335,yy-.052,zz-.06),(.335,yy-.052,zz-.06),.009,rail)
 for xx in [-.343,.343]:beam('Breaker bank lateral guard',(xx,yy-.055,1.21),(xx,yy-.055,1.94),.010,rail)
 # Assemble in a manufacturing frame rather than a single floating box.
 new=[o for o in bpy.context.scene.objects if o not in before]
 bpy.context.view_layer.update() # Preserve the small switch-tip scales before reading matrix_world.
 rot=Matrix.Rotation(-sign*math.radians(65),4,'Z')
 for obj in new:obj.matrix_world=Matrix.Translation((sign*1.04,.08,0))@rot@obj.matrix_world
 for zz in [.98,1.67]:beam('Side console cable trunk',(sign*1.17,-.42,zz),(sign*1.17,.65,zz),.018,black)

# Display and keyboard assembly beneath the flight instruments, as shown in
# the NASA crew-station arrangement. Key legends are AGC DSKY functions.
y=plate('LM DSKY mounting panel',0,.80,.87,.34,.23)
cube('DSKY rectangular instrument enclosure',(0,y-.018,.882),(.292,.034,.205),black,.010)
for row in range(3):
 cube('DSKY numeric register',(0,y-.039,.952-row*.024),(.255,.006,.021),dial,.002)
 label_at('+ 00000',-.109,y-.045,.946-row*.024,.014)
keys=[['VERB','+','7','8','9'],['NOUN','-','4','5','6'],['CLR','PRO','1','2','3'],['KEY REL','ENTR','0','RSET','']]
for row,keyrow in enumerate(keys):
 for col,key in enumerate(keyrow):
  if not key:continue
  xx=-.11+col*.055;zz=.865-row*.027
  cube('DSKY '+key+' key',(xx,y-.047,zz),(.049,.012,.022),ivory,.003)
  text('DSKY key legend '+key,key,(xx-.019,y-.054,zz-.0035),.0063,black)

# Actual human-hand controls, separate meshes permit animation in the renderer.
for sign in [-1,1]:
 x=sign*.77;cube('Hand controller pedestal',(x,.19,.88),(.16,.22,.24),panel,.025)
 for j in range(5):
  cyl('Controller boot bellows',(x,.19,1.01+j*.012),.048-j*.003,.018,black,40)
 beam('LM attitude hand controller' if sign==1 else 'LM thrust translation shaft',(x,.19,1.04),(x,.13,1.20),.016,rail)
 grip=sphere('LM attitude grip' if sign==1 else 'LMThrottle',(x,.12,1.20),(.033,.045,.075),black,32,20)
 sphere('Hand controller trigger',(x,.076,1.25),(.012,.008,.018),red,20,12)
 label_at('ATTITUDE' if sign==1 else 'THRUST',x-.065,.06,1.05,.012)
# Central forward hatch beneath the instrument column, grabwheel and egress step.
cube('LMHatch',(0,1.004,.43),(.81,.07,.75),panel,.055)
for x in [-.38,.38]:
 beam('Hatch latch linkage',(x,.951,.13),(x,.951,.73),.012,rail)
for i in range(6):
 a=math.tau*i/6;beam('Hatch wheel spoke',(0,.945,.43),(.10*math.cos(a),.945,.43+.10*math.sin(a)),.009,rail)
bpy.ops.mesh.primitive_torus_add(major_radius=.10,minor_radius=.013,major_segments=48,minor_segments=12,location=(0,.945,.43),rotation=(math.pi/2,0,0));assign(bpy.context.object,rail)
label_at('CABIN HATCH',-.13,.94,.75,.023)
# Soft insulated hoses, binders and life-support connections provide cabin depth.
for sign in [-1,1]:
 for j in range(10):
  t=j/9;beam('Ribbed suit oxygen hose',(sign*(.8+.08*math.sin(t*math.pi)), -.8+.5*t,.48+.18*math.sin(t*math.pi)),(sign*(.8+.08*math.sin((t+.1)*math.pi)),-.8+.5*(t+.1),.48+.18*math.sin((t+.1)*math.pi)),.025,liner)
 for k in range(4):
  cube('Secured flight procedure binder',(sign*.89,-.91,1.65+k*.038),(.40,.18,.026),paint,.005)
# Visible utility-light brackets, conduit clamps, and harness terminations.
# Locations follow the crew-station arrangement; no decorative control buttons.
for sign in [-1,1]:
 beam('Utility lamp support',(sign*.86,.82,2.14),(sign*.86,.67,2.09),.013,rail)
 lamp=cyl('Cabin floodlight housing',(sign*.86,.65,2.08),.038,.085,black,32,(math.pi/2,0,0))
 cyl('Cabin floodlight lens',(sign*.86,.604,2.08),.030,.006,ivory,32,(math.pi/2,0,0))
 for j in range(5):
  z=.30+j*.31
  cube('Harness trunk clamp',(sign*1.126,-.55,z),(.032,.055,.07),rail,.007)
  cyl('Harness clamp screw',(sign*1.105,-.576,z),.005,.008,metal,12,(math.pi/2,0,0))
 for j in range(3):
  z=1.10+j*.036
  beam('Bundled avionics wiring',(sign*.46,.96,z),(sign*.96,.96,z),.008,black)
  cube('Wiring identification sleeve',(sign*.78,.95,z),(.038,.020,.020),ivory,.004)
# Merge static pieces while retaining functional surfaces and semantic control meshes.
bpy.context.view_layer.update()
groups={}
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH' or obj.name in ['LMAltitude','LMVelocity','LMAttitude','LMAttitudeRight','LMFuel','LMPower','LMThrottle','LMHatch']:continue
 key=obj.data.materials[0].name if obj.data.materials else 'none';groups.setdefault(key,[]).append(obj)
for name,objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name='LM static '+name
export('lunar-cabin.glb')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets-source','v3','lunar-cabin.blend'))
# Reference view for checking the standing eye, aperture shape, and panel density.
bpy.ops.object.camera_add(location=(-.45,-.45,1.65));cam=bpy.context.object;cam.rotation_euler=(Vector((-.2,1.02,1.52))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=23;bpy.context.scene.camera=cam
for pos,energy,size in [((-.6,-.3,2.0),35,1.0),((0,1.6,2.5),150,3.0)]:
 bpy.ops.object.light_add(type='AREA',location=pos);lightobj=bpy.context.object;lightobj.data.energy=energy;lightobj.data.shape='DISK';lightobj.data.size=size;lightobj.rotation_euler=(Vector((0,.2,1.1))-lightobj.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1440;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.world.color=(.12,.12,.12);scene.render.filepath=os.path.join(ROOT,'assets-source','v3','lunar-cabin-preview.png');bpy.ops.render.render(write_still=True)
cam.rotation_euler=(Vector((-.98,.08,1.50))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=os.path.join(ROOT,'assets-source','v3','lunar-cabin-side-preview.png');bpy.ops.render.render(write_still=True)
