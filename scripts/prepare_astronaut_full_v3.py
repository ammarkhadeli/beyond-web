import os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exec(open(os.path.join(root,'scripts','prepare_astronaut_v3.py'),encoding='utf8').read().split('def pose(seated):')[0])
obj.data=original.copy()
for v in obj.data.vertices:
 x,y,z=v.co
 if abs(x)>.32 and z>.10:
  side=1 if x>0 else -1;pivot=Vector((side*.31,0,.38));factor=min(1,max(0,(abs(x)-.32)/.12))
  v.co=pivot+Matrix.Rotation(-side*math.radians(72)*factor,4,'Z').to_3x3()@(v.co-pivot);v.co.z-=.15*factor
factor=1.75/1.8862722;lowest=min(v.co.z for v in obj.data.vertices)*factor
for v in obj.data.vertices:v.co*=factor;v.co.z-=lowest
for poly in obj.data.polygons:poly.use_smooth=True
mod=obj.modifiers.new('Suit silhouette smoothing','SUBSURF');mod.levels=1;mod.render_levels=1
obj.name='NASA_suited_external_full';export('astronaut-full')
