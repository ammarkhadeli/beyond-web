import os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
source=open(os.path.join(root,'scripts','blender_assets.py'),encoding='utf-8').read().split('# Enclosing pressure cabin.')[0]
exec(source)
foil=material('Gold multilayer thermal blanket',(.45,.30,.12),.78,.58)
cloth=material('Black multilayer thermal blanket',(.025,.028,.031),.2,.85)
whitebody=material('Lander ceramic shell',(.71,.72,.69),.2,.42)
# Eight-sided descent module with subtly irregular crinkled foil surfaces.
core=lathe('Descent stage',[(1.0,2.0),(1.18,2.35),(2.5,2.35),(2.7,2.0)],foil,64)
for vert in core.data.vertices:
 angle=math.atan2(vert.co.y,vert.co.x);factor=1+.014*math.sin(angle*23+vert.co.z*12)+.009*math.cos(angle*39-vert.co.z*17);vert.co.x*=factor;vert.co.y*=factor
# Pressurized cabin and rounded roof.
lathe('Crew pressure cabin',[(2.55,1.65),(2.75,1.82),(4.8,1.82),(5.45,1.25),(5.9,.65),(6.0,0.02)],whitebody,80)
for z in [2.8,4.65]:lathe('Cabin seal',[(z-.025,1.825),(z+.025,1.825)],trim,80)
# Lower-facing windows around the forward cabin, with machined gasket outlines.
for x in [-.65,.65]:
 o=cube('Pilot window surround',(x,1.6,4.6),(.86,.12,.86),trim,.18);o.rotation_euler.x=.22
 o=cube('Pilot glazing',(x,1.68,4.6),(.72,.05,.7),black,.14);o.rotation_euler.x=.22
# Four articulated landing legs. Pads are exactly at ground level z=0.
for i in range(4):
 a=math.pi/4+i*math.pi/2;foot=Vector((math.sin(a)*4.4,math.cos(a)*4.4,.14));hip=Vector((math.sin(a)*1.8,math.cos(a)*1.8,2.4));knee=Vector((math.sin(a)*3.4,math.cos(a)*3.4,1.2))
 beam('Main landing strut',hip,knee,.105,metal);beam('Landing shock absorber',knee,foot,.085,metal)
 beam('Leg stabilizer',(math.sin(a)*1.8,math.cos(a)*1.8,1.15),foot,.055,trim)
 beam('Insulated landing leg',hip,knee,.14,foil)
 cyl('Landing footpad',foot,.58,.14,metal,48)
 sphere('Footpad joint',foot+Vector((0,0,.13)),(.15,.15,.15),black,20,12)
# Engine bell recessed beneath descent platform.
lathe('Descent engine nozzle',[(.32,.55),(.55,.46),(.85,.28),(1.2,.21)],metal,64)
lathe('Engine thermal cover',[(1.05,.37),(1.5,.45)],cloth,48)
# RCS clusters, valves and harnesses.
for i in range(4):
 a=i*math.pi/2+.35;x,y=1.78*math.sin(a),1.78*math.cos(a)
 cube('Reaction control cluster',(x,y,3.7),(.32,.3,.24),black,.055)
 for z in [3.58,3.83]:
  thr=cyl('Reaction control nozzle',(x*1.07,y*1.07,z),.065,.18,metal,24);thr.rotation_euler=(math.pi/2,0,-a)
# Side hatch, ladder and handrails.
o=cube('Lander hatch',(1.82,0,3.7),(.08,.92,1.38),trim,.18)
for y in [-.48,.48]:beam('Ladder handrail',(2,y,.25),(1.95,y,3.1),.025,metal)
for i in range(9):beam('Ladder rung',(2,-.46,.3+i*.29),(2,.46,.3+i*.29),.025,metal)
# High gain dish and deployable small panels.
beam('Antenna mast',(-1.0,-.65,4.8),(-1,-.65,6.4),.035,metal)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=.7,location=(-1,-.65,6.3));dish=bpy.context.object;dish.name='High gain dish';dish.scale=(1,1,.12);assign(dish,whitebody);smooth(dish);dish.rotation_euler.x=.45
for sign in [-1,1]:
 wing=cube('Folded photovoltaic wing',(sign*2.4,-1.1,3.0),(.06,1.25,1.6),blue,.02);wing.rotation_euler.y=sign*.25
 beam('Solar array hinge',(sign*1.8,-1.1,2.9),(sign*2.4,-1.1,3),.04,metal)
merge_by_material('Lander_');export('lunar-lander.glb')
os.makedirs(os.path.join(ROOT,'assets-source'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets-source','lunar-lander.blend'))
