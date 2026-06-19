#!/usr/bin/env python3
"""Dump events + images from Supabase into backup/ (also acts as a read ping)."""
import json, os, urllib.request

URL = os.environ["SUPABASE_URL"]; KEY = os.environ["SUPABASE_ANON_KEY"]
OUT = os.path.join(os.path.dirname(__file__), "..", "backup")

def get(path):
    r = urllib.request.Request(URL + path, headers={
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    })
    with urllib.request.urlopen(r) as resp:
        return resp.read()

def main():
    os.makedirs(os.path.join(OUT, "images"), exist_ok=True)
    rows = json.loads(get("/rest/v1/events?select=*&order=start_minutes.asc"))
    with open(os.path.join(OUT, "events.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    for r in rows:
        p = r.get("image_path")
        if not p: continue
        data = get(f"/storage/v1/object/public/event-images/{p}")
        with open(os.path.join(OUT, "images", p), "wb") as f:
            f.write(data)
    print(f"backed up {len(rows)} events")

if __name__ == "__main__":
    main()
