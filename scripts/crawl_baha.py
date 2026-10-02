#!/usr/bin/env python3
"""Full-site crawler for old.berkeleyheritage.com (BAHA).

Idempotent: skips already-saved slugs. Saves markdown to data/scraped/baha/,
index pages recorded in _index_pages.json, raw HTML optionally under _raw/.
"""
import hashlib
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime

BASE = "https://old.berkeleyheritage.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "scraped", "baha")
RAW = os.path.join(OUT, "_raw")
DELAY = 0.6
MAX_RAW_BYTES = 900_000
SKIP_EXT = (".pdf", ".jpg", ".jpeg", ".gif", ".png", ".zip", ".doc", ".mp3", ".tif", ".bmp")

os.makedirs(OUT, exist_ok=True)
os.makedirs(RAW, exist_ok=True)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) research-crawler/1.0"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
        ctype = r.headers.get("Content-Type", "")
    return data, ctype


def norm(url, base_url=BASE):
    """Normalize a URL to an absolute same-domain http(s) URL or None."""
    url = url.strip()
    if not url or url.startswith(("mailto:", "javascript:", "tel:", "#")):
        return None
    url = urllib.parse.urljoin(base_url, url)
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https"):
        return None
    if p.netloc != "old.berkeleyheritage.com":
        return None
    path = p.path
    if any(path.lower().endswith(e) for e in SKIP_EXT):
        return None
    # normalize: strip fragment, resolve directory links, drop default
    fragless = urllib.parse.urlunparse((p.scheme, p.netloc, path, p.params, p.query, ""))
    return fragless


def extract_links(html_text, page_url):
    urls = set()
    for m in re.finditer(r'href\s*=\s*["\']([^"\']+)["\']', html_text, re.I):
        u = norm(m.group(1), page_url)
        if u:
            urls.add(u)
    # also catch unquoted hrefs (old sites have them)
    for m in re.finditer(r'href\s*=\s*([^\s>]+)', html_text, re.I):
        u = norm(m.group(1), page_url)
        if u:
            urls.add(u)
    return urls


TAG_RE = re.compile(r"<(script|style|noscript)\b.*?</\1>", re.S | re.I)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)


def html_to_text(html_text):
    t = COMMENT_RE.sub("", html_text)
    t = TAG_RE.sub(" ", t)
    # preserve block breaks
    t = re.sub(r"</(p|div|br|tr|li|h[1-6]|table|ul|ol)\s*>", "\n", t, flags=re.I)
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = htmllib.unescape(t)
    # collapse whitespace
    lines = [re.sub(r"[ \t\xa0]+", " ", ln).strip() for ln in t.split("\n")]
    out, blank = [], 0
    for ln in lines:
        if ln:
            out.append(ln)
            blank = 0
        else:
            blank += 1
            if blank == 1 and out:
                out.append("")
    return "\n".join(out).strip()


def get_title(html_text):
    m = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.S | re.I)
    if m:
        return htmllib.unescape(m.group(1)).strip()
    return None


def find_date(text):
    m = re.search(r"\b(\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b", text)
    if m:
        return m.group(1)
    m = re.search(r"\b((January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b", text)
    return m.group(1) if m else None


def find_byline(text):
    for m in re.finditer(r"^\s*(?:by\s+)?([A-Z][A-Za-z\.\-']+(?:\s+[A-Z][A-Za-z\.\-']+){1,2})\s*$", text, re.M):
        name = m.group(1).strip()
        if name.lower() in ("berkeley observed", "berkeley architectural heritage association", "all rights reserved"):
            continue
        return name
    return None


def find_photo_credits(text):
    credits = []
    for m in re.finditer(r"(?:[Pp]hoto(?:graph)?s?\s*(?:credit)?\s*[:—-]\s*|photo by\s+)([^\n]{3,80})", text):
        c = m.group(1).strip().rstrip(")")
        if c and c not in credits:
            credits.append(c)
    return credits


def is_index_page(url, html_text, text):
    path = urllib.parse.urlparse(url).path.lower()
    name = os.path.basename(path)
    if name in ("", "index.html", "index.htm", "home.html", "default.html"):
        return True
    # link-farm heuristic: many links, little text
    nlinks = len(re.findall(r"<a\s", html_text, re.I))
    if nlinks >= 40 and len(text) < 4000 and nlinks * 25 > len(text):
        return True
    return False


def slug_for(url, title):
    p = urllib.parse.urlparse(url)
    name = os.path.basename(p.path)
    name = re.sub(r"\.(html?|htm|php|asp)$", "", name, flags=re.I)
    name = re.sub(r"[^a-z0-9_\-]+", "_", name.lower()).strip("_")
    if not name:
        name = "root"
    return "baha_" + name


def main():
    manifest_path = os.path.join(ROOT, "data", "scraped", "manifest.json")
    manifest = []
    if os.path.exists(manifest_path):
        manifest = json.load(open(manifest_path))
    by_slug = {e.get("slug"): e for e in manifest}

    queue = [BASE + "/"]
    visited = set()
    saved = skipped_existing = 0
    failed = []
    index_pages = {}
    pdfs = set()

    while queue:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)
        try:
            data, ctype = fetch(url)
        except Exception as e:
            failed.append({"url": url, "error": str(e)})
            time.sleep(DELAY)
            continue
        if "html" not in ctype.lower() and not url.lower().endswith((".html", ".htm", "/")):
            if "pdf" in ctype.lower():
                pdfs.add(url)
            time.sleep(DELAY)
            continue
        try:
            html_text = data.decode("utf-8", errors="replace")
        except Exception:
            failed.append({"url": url, "error": "decode error"})
            continue

        links = extract_links(html_text, url)
        for l in links:
            if l not in visited and l not in queue:
                queue.append(l)
        for l in links:
            if l.lower().endswith(".pdf"):
                pdfs.add(l)

        text = html_to_text(html_text)
        title = get_title(html_text) or url
        slug = slug_for(url, title)
        mdpath = os.path.join(OUT, slug + ".md")

        if is_index_page(url, html_text, text):
            index_pages[url] = {"title": title, "links": sorted(links)}
        else:
            if len(text) < 350:  # too thin to be substantive; treat as index-ish
                index_pages[url] = {"title": title, "links": sorted(links)}
                time.sleep(DELAY)
                continue
            if os.path.exists(mdpath):
                skipped_existing += 1
                time.sleep(DELAY / 2)
                continue
            body = text
            byline = find_byline(body)
            date = find_date(body)
            credits = find_photo_credits(body)
            fm = [
                "---",
                f'title: "{title.replace(chr(34), chr(39))}"',
                f'authors: ["{byline if byline else "BAHA"}"]',
                'source: "BAHA (Berkeley Architectural Heritage Association)"',
                f'source_url: "{url}"',
                f'published_date: "{date}"' if date else 'published_date: ""',
                f'photo_credits: {json.dumps(credits)}',
                'scraped_at: "2026-09-30"',
                'license_note: "Copyrighted source material - used for research/app content with attribution; verify rights before publication."',
                "---",
                "",
            ]
            with open(mdpath, "w") as f:
                f.write("\n".join(fm) + body + "\n")
            if len(data) <= MAX_RAW_BYTES:
                with open(os.path.join(RAW, slug + ".html"), "wb") as f:
                    f.write(data)
            saved += 1
            entry = {
                "slug": slug,
                "title": title,
                "authors": [byline if byline else "BAHA"],
                "source": "baha",
                "url": url,
                "date": date or "",
                "photo_credits": credits,
                "body_chars": len(body),
            }
            if slug not in by_slug:
                manifest.append(entry)
                by_slug[slug] = entry

        time.sleep(DELAY)

    json.dump(index_pages, open(os.path.join(OUT, "_index_pages.json"), "w"), indent=1)
    json.dump(sorted(pdfs), open(os.path.join(OUT, "_pdfs.json"), "w"), indent=1)
    json.dump(manifest, open(manifest_path, "w"), indent=1)
    json.dump({"failed": failed}, open(os.path.join(OUT, "_failures.json"), "w"), indent=1)

    print(f"crawled={len(visited)} saved_new={saved} skipped_existing={skipped_existing} "
          f"index_pages={len(index_pages)} failed={len(failed)} pdfs={len(pdfs)}")
    for f_ in failed[:20]:
        print("FAIL:", f_)


if __name__ == "__main__":
    main()
