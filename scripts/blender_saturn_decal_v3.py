import bpy,os,numpy as np,json
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
image=bpy.data.images.load(os.path.join(ROOT,'assets-source','v3','saturn-texture-1.png'))
w,h=image.size;pixels=np.array(image.pixels[:],dtype=np.float32).reshape(h,w,4);background=pixels[0,0,:3].copy();foreground=np.max(np.abs(pixels[:,:,:3]-background),axis=2)>.0001
columns=np.where(foreground.any(axis=0))[0];runs=[]
for x in columns:
 if not runs or x>runs[-1][-1]+1:runs.append([int(x)])
 else:runs[-1].append(int(x))
keep=np.zeros((h,w),bool);bounds=[]
for run in runs:
 lo,hi=run[0],run[-1];ys=np.where(foreground[:,lo:hi+1].any(axis=1))[0]
 if len(ys):keep[ys.min():ys.max()+1,lo:hi+1]=True;bounds.append([lo,int(ys.min()),hi,int(ys.max())])
pixels[~keep,:3]=1;image.pixels.foreach_set(pixels.ravel());image.filepath_raw=os.path.join(ROOT,'public','assets','earth','saturn-flag-decal.png');image.file_format='PNG';image.save()
json.dump({'source':'NASA/Michael D. Carbajal Saturn V model, SATURNVT texture','processing':'Source navy decal-key background changed to white outside exact flag rectangles; all six flags unchanged.','sourceBackgroundLinearRGB':background.tolist(),'preservedRectanglesBottomOrigin':bounds},open(os.path.join(ROOT,'public','assets','earth','saturn-flag-decal.json'),'w'),indent=2)
print('PRESERVED FLAGS',bounds)
