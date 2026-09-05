"""Build the photo list, or serve it live during local development."""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'}


def catalog(root=ROOT):
    data_path = root / 'photos/data.json'
    previous = json.loads(data_path.read_text()) if data_path.exists() else []
    metadata = {item['src']: item for item in previous if isinstance(item, dict) and 'src' in item}
    photos = []
    for path in sorted((root / 'image/photos').rglob('*')):
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue
        if any(part.startswith('.') for part in path.relative_to(root).parts):
            continue
        if not path.resolve().is_relative_to((root / 'image/photos').resolve()):
            continue
        raw = '/' + path.relative_to(root).as_posix()
        src = quote(raw, safe='/')
        entry = dict(metadata.get(src, metadata.get(raw, {})))
        entry.update(src=src)
        entry.setdefault('alt', '写真 ' + str(len(photos) + 1))
        photos.append(entry)
    return photos


class PhotoHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == '/photos/data.json':
            payload = (json.dumps(catalog(), ensure_ascii=False, indent=2) + '\n').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Photo-Catalog', 'live')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            super().do_GET()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve', type=int, metavar='PORT')
    args = parser.parse_args()
    if args.serve is not None:
        server = ThreadingHTTPServer(('127.0.0.1', args.serve), partial(PhotoHandler, directory=str(ROOT)))
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    else:
        photos = catalog()
        (ROOT / 'photos/data.json').write_text(json.dumps(photos, ensure_ascii=False, indent=2) + '\n')
        print(f'Photo catalog: {len(photos)} images')
