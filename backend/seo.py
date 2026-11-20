"""
Prepara la web publicada para los buscadores (lo usa la tarea de GitHub Actions).

    python backend/seo.py _site https://usuario.github.io/repo/ [codigo-google]

- Añade la dirección canónica y la imagen para compartir (necesitan la URL completa).
- Crea sitemap.xml y robots.txt.
- Si se da el código de Google Search Console, añade la etiqueta de verificación.
"""
from __future__ import annotations

import html
import json
import sys
from datetime import date
from pathlib import Path


def main(site: str, url: str, google: str = "") -> None:
    root = Path(site)
    url = url.rstrip("/") + "/"
    index = root / "index.html"
    page = index.read_text(encoding="utf-8")
    u = html.escape(url, quote=True)
    tags = [
        f'<link rel="canonical" href="{u}">',
        f'<meta property="og:url" content="{u}">',
        f'<meta property="og:image" content="{u}img/escudo.jpg">',
    ]
    if google.strip():
        tags.append(f'<meta name="google-site-verification" content="{html.escape(google.strip(), quote=True)}">')
    page = page.replace("</head>", "  " + "\n  ".join(tags) + "\n</head>", 1)
    page = page.replace('"@type": "SportsTeam",', f'"@type": "SportsTeam",\n    "url": {json.dumps(url)},\n    "logo": {json.dumps(url + "img/escudo.jpg")},', 1)
    index.write_text(page, encoding="utf-8")

    (root / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{html.escape(url)}</loc><lastmod>{date.today().isoformat()}</lastmod><changefreq>weekly</changefreq></url>\n"
        "</urlset>\n", encoding="utf-8")
    (root / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {url}sitemap.xml\n", encoding="utf-8")
    print("SEO listo para", url)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(*sys.argv[1:4])
