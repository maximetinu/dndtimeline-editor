#!/usr/bin/env python3
"""One-time migration: source export -> Supabase events + image uploads.

Reads data/source-export.json (the original LegendKeeper export), converts each
event to an `events` row (start_minutes = original `start`), and uploads embedded
base64 images to the `event-images` bucket. Stdlib only.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
"""
import base64, json, os, urllib.request, urllib.error

URL = os.environ["SUPABASE_URL"]; KEY = os.environ["SUPABASE_SERVICE_ROLE"]
SRC = os.path.join(os.path.dirname(__file__), "..", "data", "source-export.json")
# Browser-like UA: Supabase fronts are behind Cloudflare, which 1010-blocks the
# default Python-urllib User-Agent.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

def req(method, path, data=None, headers=None, raw=False):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "User-Agent": UA}
    if headers: h.update(headers)
    body = data if raw else (json.dumps(data).encode() if data is not None else None)
    if not raw and data is not None: h["Content-Type"] = "application/json"
    r = urllib.request.Request(URL + path, data=body, headers=h, method=method)
    with urllib.request.urlopen(r) as resp:
        return resp.status, resp.read()

def main():
    events = json.load(open(SRC, encoding="utf-8"))["resources"][0]["documents"][0]["content"]["events"]
    events = sorted(events, key=lambda e: e["start"])
    for i, e in enumerate(events):
        image_path = None
        uri = e.get("imageUrl", "")
        if uri.startswith("data:"):
            header, b64 = uri.split(",", 1)
            ext = "png" if "png" in header else ("jpg" if ("jpeg" in header or "jpg" in header) else "bin")
            raw = base64.b64decode(b64)
            image_path = f'{e["id"]}.{ext}'
            ctype = "image/png" if ext == "png" else "image/jpeg"
            req("POST", f"/storage/v1/object/event-images/{image_path}", data=raw, raw=True,
                headers={"Content-Type": ctype, "x-upsert": "true"})
        row = {"name": e["name"], "start_minutes": e["start"],
               "color": e.get("color", "#0079CC"), "image_path": image_path, "sort_order": i}
        req("POST", "/rest/v1/events", data=row, headers={"Prefer": "return=minimal"})
        print(f'[{i+1}/{len(events)}] {e["name"][:40]}' + (" (img)" if image_path else ""))
    print("done")

if __name__ == "__main__":
    main()
