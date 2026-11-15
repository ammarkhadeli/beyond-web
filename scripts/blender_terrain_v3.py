"""Prepare NASA's uncompressed GeoTIFFs as browser-ready scientific data.
All coordinates/elevations remain in metres; this does not invent terrain.
"""
import os,struct,math,json,zlib,binascii
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=os.path.join(ROOT,'assets-source','v3');OUT=os.path.join(ROOT,'public','assets','lunar');os.makedirs(OUT,exist_ok=True)
class Tiff:
 def __init__(self,path):
  self.f=open(path,'rb');h=self.f.read(8);self.endian='<' if h[:2]==b'II' else '>';self.f.seek(struct.unpack(self.endian+'I',h[4:8])[0]);n=struct.unpack(self.endian+'H',self.f.read(2))[0];self.tags={}
  for _ in range(n):
   tag,kind,count,value=struct.unpack(self.endian+'HHII',self.f.read(12));self.tags[tag]=(kind,count,value)
  self.width=self.values(256)[0];self.height=self.values(257)[0];self.bits=self.values(258)[0];self.rows=self.values(278)[0];self.strips=self.values(273)
  assert self.values(259)[0]==1,'Only uncompressed TIFF data are supported.'
 def values(self,tag):
  kind,count,offset=self.tags[tag];form={3:'H',4:'I',12:'d'}[kind];size=struct.calcsize(form)
  if count*size<=4:return list(struct.unpack(self.endian+form*count,struct.pack(self.endian+'I',offset)[:count*size]))
  self.f.seek(offset);return list(struct.unpack(self.endian+form*count,self.f.read(count*size)))
 def row(self,y):
  y=max(0,min(self.height-1,int(y)));self.f.seek(self.strips[y//self.rows]+(y%self.rows)*self.width*self.bits//8);return self.f.read(self.width*self.bits//8)
 def float_at(self,x,y):return struct.unpack_from('<f',self.row(y),int(x)*4)[0]
def png(path,w,h,pixels):
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',binascii.crc32(kind+data)&0xffffffff)
 raw=b''.join(b'\x00'+pixels[y*w:(y+1)*w] for y in range(h))
 data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(raw,8))+chunk(b'IEND',b'')
 open(path,'wb').write(data)
dem=Tiff(os.path.join(SRC,'NAC_DTM_APOLLO11.TIF'));photo=Tiff(os.path.join(SRC,'NAC_DTM_APOLLO11_M150361817_2M.TIF'))
lat=.674;lon=23.47;radius=1737400.;pixel_x=(radius*math.radians(lon-180)*math.cos(math.radians(1))+4748754)/2-.5;pixel_y=(37496-radius*math.radians(lat))/2-.5
cx=round(pixel_x);cy=round(pixel_y);datum=dem.float_at(cx,cy);size=1025;half=size//2;heights=[];pixels=bytearray();missing=0
for y in range(cy-half,cy+half+1):
 row=dem.row(y);pr=photo.row(y)
 for x in range(cx-half,cx+half+1):
  h=struct.unpack_from('<f',row,x*4)[0]
  if h<-1e10 or not math.isfinite(h):h=datum;missing+=1
  heights.append(h-datum)
 pixels.extend(pr[cx-half:cx+half+1])
open(os.path.join(OUT,'apollo11-heights.f32'),'wb').write(struct.pack('<'+'f'*len(heights),*heights));png(os.path.join(OUT,'apollo11-surface.png'),size,size,pixels)
metadata={'width':size,'height':size,'spacingMeters':2,'latitudeDegrees':lat,'longitudeDegrees':lon,'datumElevationMeters':datum,'moonReferenceRadiusMeters':radius,'imagePixelAtAnchor':[pixel_x-cx+half,pixel_y-cy+half],'axes':'Image rows run north to south; columns run west to east. Float32 little endian heights are relative to datumElevationMeters.','missingSamples':missing,'source':'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO11','credit':'NASA/GSFC/Arizona State University, LROC team','sourceAcquisition':'2011-01-22; derived product version1.9 (2020-10-10)'}
json.dump(metadata,open(os.path.join(OUT,'apollo11-terrain.json'),'w'),indent=2);print('APOLLO SITE',metadata)
global_dem=Tiff(os.path.join(SRC,'ldem_16_uint.tif'));out=bytearray()
for y in range(0,global_dem.height,4):
 row=global_dem.row(y)
 for x in range(0,global_dem.width,4):out.extend(row[x*2:x*2+2])
open(os.path.join(OUT,'moon-global-heights.u16'),'wb').write(out)
json.dump({'width':1440,'height':720,'encoding':'uint16 little endian','elevationMeters':'(value - 20000) * 0.5','referenceRadiusMeters':radius,'source':'https://svs.gsfc.nasa.gov/4720/'},open(os.path.join(OUT,'moon-global-heights.json'),'w'),indent=2)
