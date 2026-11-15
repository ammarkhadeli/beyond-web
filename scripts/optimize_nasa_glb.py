"""Repack NASA VTAD ISS: unchanged geometry, deduplicated embedded textures.

Opaque color images use JPEG quality 92 at their original resolution. Normal maps
and alpha images remain lossless. Requires Pillow; optional first argument is a
temporary dependency directory. Original source GLBs are never overwritten.
"""
import sys, os, io, json, struct, hashlib
if len(sys.argv) > 1:
    sys.path.insert(0, sys.argv[1])
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'assets-source', 'nasa', 'iss-vtad.glb')
raw = open(SOURCE, 'rb').read()
json_length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + json_length])
binary = raw[28 + json_length:]
views = doc['bufferViews']
original = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
replacement = {}
normal_images = {doc['textures'][m['normalTexture']['index']]['source'] for m in doc['materials'] if 'normalTexture' in m}
image_report = []
for index, image in enumerate(doc['images']):
    view = image['bufferView']
    data = original[view]
    picture = Image.open(io.BytesIO(data))
    opaque = 'A' not in picture.getbands() or picture.getchannel('A').getextrema() == (255, 255)
    output = io.BytesIO()
    if opaque and index not in normal_images:
        picture.convert('RGB').save(output, format='JPEG', quality=92, subsampling=0, optimize=True)
        image['mimeType'] = 'image/jpeg'
    else:
        picture.save(output, format='PNG', optimize=True)
        image['mimeType'] = 'image/png'
    replacement[view] = output.getvalue()
    image_report.append({'name': image.get('name'), 'size': list(picture.size), 'original_bytes': len(data), 'output_bytes': len(output.getvalue()), 'format': image['mimeType'], 'normal_map': index in normal_images})

packed = bytearray()
seen = {}
for index, view in enumerate(views):
    data = replacement.get(index, original[index])
    signature = hashlib.sha256(data).digest()
    if signature not in seen:
        packed.extend(b'\0' * (-len(packed) % 4))
        seen[signature] = len(packed)
        packed.extend(data)
    view['buffer'] = 0
    view['byteOffset'] = seen[signature]
    view['byteLength'] = len(data)
packed.extend(b'\0' * (-len(packed) % 4))
doc['buffers'] = [{'byteLength': len(packed)}]
doc.setdefault('asset', {}).setdefault('extras', {})['source'] = 'NASA Visualization Technology Applications and Development (VTAD)'
doc['asset']['extras']['modifications'] = 'Identical vertex/index data and texture dimensions; deduplicated buffer payloads; opaque color textures JPEG quality 92; normal and alpha maps lossless.'
encoded = json.dumps(doc, separators=(',', ':')).encode('utf-8')
encoded += b' ' * (-len(encoded) % 4)
result = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(packed)) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + struct.pack('<I4s', len(packed), b'BIN\0') + packed
for target in [os.path.join(ROOT, 'assets-source', 'nasa', 'iss-vtad-optimized.glb'), os.path.join(ROOT, 'public', 'assets', 'nasa-iss.glb')]:
    with open(target + '.tmp', 'wb') as f: f.write(result)
    os.replace(target + '.tmp', target)
report = {'source_bytes': len(raw), 'output_bytes': len(result), 'geometry_unchanged': True, 'orientation': 'Original glTF Y up; +X truss, +Z forward PMA2; original meter scale', 'textures': image_report}
with open(os.path.join(ROOT, 'assets-source', 'nasa', 'optimization.json'), 'w') as f: json.dump(report, f, indent=2)
print('ISS optimized', len(raw), '->', len(result), 'bytes; geometry unchanged')
