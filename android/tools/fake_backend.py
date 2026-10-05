#!/usr/bin/env python3
"""Fake SunoAPI + Anthropic API + article page, for trying the app without spending credits.

    just fake-backend          # starts this, adb-reverses the port, points the debug app at it

The debug app then talks to http://127.0.0.1:8089 on the phone, which `adb reverse` forwards
here. Songs "stream" after --stream-after seconds and finish after --done-after seconds, like
a real (fast) Suno generation. Mirrors app/src/sharedTest/.../FakeApis.kt. Stdlib only.
"""
import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ASSETS = Path(__file__).resolve().parent.parent / "app" / "src" / "androidTest" / "assets"

LYRICS = """[Verse]
The scouts come home and they dance across the comb,
Telling every sister where the clover fields have grown.

[Chorus]
So waggle to the left and waggle to the right,
The sun is our compass and the hive will eat tonight.

[Verse]
Every turn is a direction and every shake is a mile,
A map made out of motion, a language with a style.

[Outro]
And when the evening settles, the dancers fall asleep,
With sunlight in their memory and secrets they will keep."""

ARTICLE = """<!doctype html><html><head><title>How bees dance - Science Daily</title>
<meta property="og:site_name" content="Science Daily"></head><body>
<nav><a href="/">Home</a> <a href="/news">News</a></nav>
<article><h1>How bees dance</h1>
<p>Honeybees communicate the location of food through a remarkable behaviour called the waggle dance.
A forager returning to the hive performs a figure-eight pattern on the vertical honeycomb.</p>
<p>The angle of the straight waggle run relative to vertical tells her sisters the direction of the
flowers relative to the sun. The duration of the run encodes the distance.</p>
<p>Karl von Frisch decoded the dance in the 1940s and later shared a Nobel Prize for the discovery.</p>
</article><footer>Copyright Science Daily.</footer></body></html>"""

started = {}  # taskId -> start time


class Handler(BaseHTTPRequestHandler):
    args = None

    def log_message(self, fmt, *a):
        print("  %s %s" % (self.command, self.path))

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def json(self, obj):
        self.send(200, json.dumps(obj))

    def base(self):
        return "http://%s" % self.headers.get("Host", "127.0.0.1:%d" % self.args.port)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/article":
            return self.send(200, ARTICLE, "text/html; charset=utf-8")
        if path in ("/audio.mp3", "/stream.mp3"):
            return self.send(200, (ASSETS / "fixture.mp3").read_bytes(), "audio/mpeg")
        if path == "/cover.jpg":
            return self.send(200, (ASSETS / "cover.jpg").read_bytes(), "image/jpeg")
        if path == "/v1/models":
            ids = ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]
            return self.json({"data": [{"type": "model", "id": i, "display_name": i, "created_at": "2026-09-01T00:00:00Z"} for i in ids],
                              "has_more": False, "first_id": ids[0], "last_id": ids[-1]})
        if path == "/api/v1/generate/credit":
            return self.json({"code": 200, "msg": "success", "data": 999})
        if path == "/api/v1/generate/record-info":
            return self.json(self.record_info())
        if path == "/api/v1/lyrics/record-info":
            return self.json({"code": 200, "msg": "success", "data": {"status": "SUCCESS",
                              "response": {"data": [{"text": LYRICS, "title": "Bees"}]}}})
        self.send(404, "not found", "text/plain")

    def do_POST(self):
        path = urlparse(self.path).path
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        if path == "/v1/messages":
            time.sleep(self.args.claude_delay)
            text = "Sunlit Indie Folk, Warm, 96 BPM, Fingerpicked Guitar" if "music style consultant" in body else LYRICS
            model = json.loads(body).get("model", "claude-opus-5-5")
            return self.json({"id": "msg_fake", "type": "message", "role": "assistant", "model": model,
                              "content": [{"type": "text", "text": text}], "stop_reason": "end_turn",
                              "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}})
        if path == "/api/v1/generate":
            task = "task-%d" % (len(started) + 1)
            started[task] = time.time()
            return self.json({"code": 200, "msg": "success", "data": {"taskId": task}})
        if path == "/api/v1/lyrics":
            return self.json({"code": 200, "msg": "success", "data": {"taskId": "lyrics-1"}})
        self.send(404, "not found", "text/plain")

    def record_info(self):
        task = urlparse(self.path).query.split("taskId=")[-1]
        elapsed = time.time() - started.get(task, time.time())
        status = "PENDING"
        if elapsed >= self.args.done_after:
            status = "SUCCESS"
        elif elapsed >= self.args.stream_after:
            status = "FIRST_SUCCESS"
        tracks = []
        if status != "PENDING":
            tracks = [{"id": "audio-1", "stream_audio_url": self.base() + "/stream.mp3",
                       "audio_url": self.base() + "/audio.mp3" if status == "SUCCESS" else "",
                       "image_url": self.base() + "/cover.jpg", "title": "The Waggle Dance",
                       "prompt": LYRICS, "tags": "folk", "duration": 8.0 if status == "SUCCESS" else None}]
        return {"code": 200, "msg": "success", "data": {"taskId": task, "status": status,
                "response": {"taskId": task, "sunoData": tracks}, "errorMessage": None}}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8089)
    p.add_argument("--stream-after", type=float, default=8, help="seconds until the song can stream")
    p.add_argument("--done-after", type=float, default=15, help="seconds until the final MP3 exists")
    p.add_argument("--claude-delay", type=float, default=1.5, help="seconds each fake Claude call takes")
    Handler.args = p.parse_args()
    print("Fake backend on http://127.0.0.1:%d (stream after %ss, done after %ss)" % (
        Handler.args.port, Handler.args.stream_after, Handler.args.done_after))
    ThreadingHTTPServer(("127.0.0.1", Handler.args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
