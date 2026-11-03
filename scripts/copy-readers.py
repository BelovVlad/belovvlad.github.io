"""Copies the NSU notebook and code readers (NSU Y4 S1/site/web/notebook) into the Department and the Diploma.

NSU is the source: change the readers there, then run this from the PweB folder:  python Home/scripts/copy-readers.py
Each copy lives in <site>/viewer/notebook/ next to viewer/pdfjs, gets files as files/<path>, and differs only in
what is NSU's own: its app shell (app.js/app.css), the GitHub repository, the title and the way back.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'NSU Y4 S1' / 'site' / 'web' / 'notebook'
FILES = ['viewer.html', 'code.html', 'viewer.css', 'outline.js']
# repo: GitHub repository of the files ('' — private: a download link instead of GitHub).
SITES = {
    'Department': {'repo': 'Department', 'name': 'Кафедра'},
    'Diploma': {'repo': '', 'name': 'Диплом'},
}


def adapt(text: str, repo: str, name: str) -> str:
    replacements = [
        # NSU's app shell (install, offline downloads) is not part of these sites.
        (r'\n<link rel="stylesheet" href="\.\./app\.css[^"]*">', ''),
        (r'\n<script defer src="\.\./app\.js[^"]*"></script>', ''),
        (r'<link rel="icon" type="image/png" sizes="192x192" href="\.\./assets/app-192\.png[^"]*">',
         '<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png">'),
        (r"REPO='NSU_FP_Y4_S1'", f"REPO='{repo}'"),
        (r'NSU FP', name),
        # The materials page is two levels up; its sections are #s-<name>.
        (r"'\.\./'\+\(subject\?'#subject='\+encodeURIComponent\(subject\):''\)",
         "'../../'+(subject?'#s-'+encodeURIComponent(subject):'')"),
        # Files are served as files/<path>; on GitHub they lie at <path>.
        (r"/blob/'\+BRANCH\+'/'\+encPath\(path\)", "/blob/'+BRANCH+'/'+encPath(path.replace(/^files\\//,''))"),
        (r"  github\.href=githubFileUrl\(raw\);",
         "  if(REPO)github.href=githubFileUrl(raw);\n"
         "  else{github.textContent='Скачать ↓';github.href=localFileUrl(raw).href;github.download=raw.split('/').pop();github.removeAttribute('target')}"),
    ]
    for pattern, value in replacements:
        text = re.sub(pattern, lambda _: value, text)
    return text


def main() -> None:
    for site, config in SITES.items():
        target = ROOT / site / 'site' / 'viewer' / 'notebook'
        target.mkdir(parents=True, exist_ok=True)
        for file in FILES:
            text = (SOURCE / file).read_text('utf-8')
            if file.endswith('.html'):
                text = adapt(text, config['repo'], config['name'])
            (target / file).write_text(text, 'utf-8', newline='\n')
        print(f'{site}: {target}')


if __name__ == '__main__':
    main()
