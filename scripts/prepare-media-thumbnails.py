"""Generate committed, metadata-free gallery thumbnails from reviewed public media.

Run from the repository root after adding project photos/video posters.
Requires Pillow only for this asset-preparation step, not for building the site.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageOps


root = Path(__file__).resolve().parent.parent
public = root / 'public'
data = json.loads((root / 'src/data/content.json').read_text())
urls = set()
for project in data['projects']:
    urls.update(item['src'] for item in project.get('galleries', []))
    urls.update(item['poster'] for item in project.get('videos', []) if item.get('poster'))

mapping = {}
for url in sorted(urls):
    if not url.startswith('/assets/') or '..' in Path(url).parts:
        raise ValueError(f'Only local reviewed assets are supported: {url}')
    source = public / url.lstrip('/')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()[:16]
    destination = public / 'assets/gallery-thumbs' / (digest + '.webp')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        thumbnail = ImageOps.contain(ImageOps.exif_transpose(original).convert('RGB'), (640, 480))
        thumbnail.save(destination, 'WEBP', quality=78, method=6)
        mapping[url] = {'src': '/' + destination.relative_to(public).as_posix(),
                        'width': thumbnail.width, 'height': thumbnail.height}

(root / 'src/data/media-thumbnails.json').write_text(json.dumps(mapping, indent=2) + '\n')
print(f'Prepared {len(mapping)} gallery thumbnails from reviewed photo/poster assets.')
