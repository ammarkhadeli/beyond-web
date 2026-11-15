"""Package an already-built static game and its source; no hosting or credentials."""
from pathlib import Path
import hashlib
import tarfile
import zipfile

root = Path(__file__).resolve().parent.parent
out = root.parent / 'artifacts'
out.mkdir(exist_ok=True)
if not (root / 'dist/index.html').is_file():
    raise SystemExit('Run npm run build first.')
with zipfile.ZipFile(out / 'beyond-web-build.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
    for path in sorted((root / 'dist').rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(root / 'dist'))
skip = {'node_modules', 'dist', '.local', '.git', '.openai', 'test-results', 'playwright-report', 'review-results'}
with tarfile.open(out / 'beyond-source.tar.gz', 'w:gz', compresslevel=5) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if any(part in skip for part in relative.parts) or path.name.endswith('.tsbuildinfo') or path.name.startswith('.env'):
            continue
        if path.is_file():
            archive.add(path, arcname=Path('beyond') / relative, recursive=False)
lines = []
for name in ['beyond-web-build.zip', 'beyond-source.tar.gz']:
    path = out / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    lines.append(f'{digest}  {name}')
    print(f'{name}: {path.stat().st_size / 1024 / 1024:.1f} MiB')
(out / 'SHA256SUMS').write_text('\n'.join(lines) + '\n')
with zipfile.ZipFile(out / 'beyond-web-build.zip') as archive:
    assert archive.testzip() is None
    assert 'index.html' in archive.namelist()
    assert archive.read('presentation.html') == (root / 'docs/presentation.html').read_bytes()
with tarfile.open(out / 'beyond-source.tar.gz') as archive:
    names = archive.getnames()
    assert 'beyond/package.json' in names
    assert not any('/node_modules/' in name or '/.git/' in name or '/.openai/' in name or '/.env' in name for name in names)
print('Archive integrity and contents verified.')
