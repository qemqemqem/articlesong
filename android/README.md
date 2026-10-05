# ArticleSong for Android

Share any article (or highlighted text) to ArticleSong and it becomes a song. It starts playing
as soon as Suno can stream it, then the MP3 is downloaded into your library, so it's there to
play offline.

```
Chrome ─Share─▶ "Make a song" sheet ─Compose─▶ background job ─────────────▶ library + player
                 (pick a style)               read → lyrics → Suno → stream ▶ auto-plays
                                                                   → MP3 ▶ saved (+ Music/ArticleSong)
```

## Put it on your phone

**One-time phone setup:** Settings → About phone → tap **Build number** 7 times. Then
Settings → System → Developer options → turn on **USB debugging** (for Wi-Fi, also
**Wireless debugging**).

**Over USB:** plug the phone in, accept the "Allow USB debugging?" prompt, then:

```bash
just devices           # your phone should be listed as "device"
just install-release   # builds the minified release APK, installs it, opens it
```

**Over Wi-Fi (no cable):** on the phone, open Developer options → Wireless debugging →
**Pair device with pairing code**. On your computer:

```bash
~/Android/Sdk/platform-tools/adb pair 192.168.1.23:41235   # the IP:port and code shown in the pairing dialog
just wifi 192.168.1.23:37155                                # the IP:port shown on the Wireless debugging screen
just install-release
```

**First launch:** open Settings in the app and paste your **SunoAPI key** (required, from
sunoapi.org) and, optionally, your **Anthropic key** (Claude writes better lyrics; without it,
Suno writes them). Tap **Test** next to each key. Then share an article from Chrome and pick
**ArticleSong · Make a song**. In any app's text-selection menu you'll also see **Sing it**.

The release build is signed with your local debug key, which is fine for a personal app. Before
you rely on it long-term, run `just keystore` once: updates must be signed with the same key,
and a lost key means reinstalling (and losing your library). Back up `android/keystore/`.

## The app

- **Share sheet** slides up over the app you were reading in. It shows the link (or the
  highlighted text and its word count), the six song styles with your last choice preselected,
  and a Compose button. After you tap Compose, it shows live progress (Read → Lyrics → Music)
  and previews the lyrics as soon as they're written. You can keep reading: a notification shows
  progress, and the song **auto-plays** once Suno starts streaming, even with the app in the
  background.
- **Library**: an "In the studio" section for songs being made (tap to see their lyrics; play
  as soon as they're streamable), then your songs with cover art, source site, style, duration
  and play count. It has search, a favorites filter, retry for failures, share, delete, read the
  article, and "new version in another style" (reuses the article and skips straight to lyrics).
- **Player**: Media3 with lock-screen and notification controls, headset buttons, audio focus,
  and a queue (shuffle and repeat). The Now Playing screen tints itself from the cover art,
  shows formatted lyrics, and closes when you swipe it down.
- **Downloads**: each song is saved in the app and, unless you turn it off, copied to
  **Music/ArticleSong** so other players and the Files app can see it.
- **Settings**: keys (with paste and test), Suno model (V6 by default), a Claude model override
  (blank = newest Opus, as in the add-on), auto-play, save to Music, and the style editor.

## How it shares code with the browser add-on

The add-on (`../add-on/`) is the source of truth for everything that decides what a song
*is*. The app reuses it at build time instead of keeping copies:

| Shared piece | Source | How the app uses it |
|---|---|---|
| Prompts, default styles, fallback tags | `add-on/prompts.js` (the `SONG_RECIPE`) | `tools/export-recipe.js` runs it under Node during the Gradle build, which produces `assets/recipe/song_recipe.json` |
| Article extraction | `add-on/Readability.js` + `add-on/article_extract.js` | Copied into `assets/addon/` and run inside a headless WebView against the live page (JS-rendered and shadow-DOM pages work) |
| PDF text | `add-on/pdf.js` + `add-on/vendor/pdfjs/` | Run in a local asset page (`assets/extract/pdf_host.html`) |

The prompt text lives only in `prompts.js`. Kotlin re-implements just the small
fill-in-the-blanks functions (`SongRecipe.kt`). `RecipeGoldenTest` compares those against
renders produced by `prompts.js` itself on every build, so editing a prompt in the add-on can't
silently diverge on Android. The plumbing (HTTP, background work, storage, playback) is native
Kotlin on each platform, because that's where the platforms differ.

Building needs Node on `PATH` (or `NODE=/path/to/node`). The Gradle task also finds nvm installs.

## Architecture

```
share/      ShareActivity (sheet), ShareParser (links, highlights, PROCESS_TEXT)
generate/   SongScheduler → WorkManager SongWorker (foreground, dataSync) → SongPipeline
            Notifier, SongActionReceiver (Cancel / Retry from notifications)
extract/    WebViewArticleExtractor (add-on JS in a WebView; PDFs via pdf.js)
api/        ClaudeClient (official Anthropic Java SDK), SunoClient (OkHttp)
recipe/     SongRecipe (the add-on's prompts, rendered identically)
data/       Room (songs), DataStore (settings), SongFiles (downloads, Music export, sharing)
playback/   PlaybackService (Media3 MediaSessionService), PlayerController
ui/         Compose: library, player, share/new-song sheets, settings
```

- **Resumable pipeline.** Each stage (read → lyrics → style tags → submit to Suno → stream →
  download) stores its output before the next stage starts, and skips itself if that output
  already exists. If Android kills the job, WorkManager reruns it from where it stopped, and it
  never pays Suno twice for the same song.
- **Background auto-play.** The generation job runs as a foreground service, which is what lets
  the player start its own media foreground service from the background when the stream is
  ready. Verified on Android 16 with the app in the background for 90+ s, outside the test
  harness. If Android ever refuses, you get a "Tap to play" notification instead.
- **Claude.** Calls go through the official Java SDK, mirroring the add-on's `claude.js`. It
  picks the newest Opus from `/v1/models` and caches the choice for a day, re-resolves if the
  model has been retired, and uses adaptive thinking with explicit effort (lyrics: high,
  tags: low). For models that support it, it turns on server-side refusal fallbacks. It falls
  back to a plain request for models that reject thinking.

## Testing

```bash
just test           # add-on node tests + 59 JVM tests (recipe parity, Claude SDK + Suno vs. a fake API, pipeline)
just test-device    # 21 on-device tests: WebView extraction (JS, shadow DOM, PDF), storage + MediaStore,
                    # share→stream→auto-play→download end-to-end, failure + retry, library UI, background auto-play
just test-live      # real Claude call with the shared prompts (ANTHROPIC_API_KEY, a few cents)
just screenshots    # walks every screen with demo data → android/build/screenshots/
```

Device tests use `FakeApis` (`app/src/sharedTest/`), a local stand-in for SunoAPI, the Anthropic
API, article pages and MP3 downloads. Only the network is faked; the WebView, WorkManager,
Room, Media3 and the Anthropic SDK are all real.

**No-cost manual testing:** `just install && just fake-backend` points the debug app at a fake
backend on your computer (`tools/fake_backend.py`, over `adb reverse`). Share links with
`just share https://…` and watch `just logcat`. When you're done, run `just real-backend` and
`just push-keys`. That pushes `SUNO_API_KEY` / `ANTHROPIC_API_KEY` from your environment or
`.env` into the debug app.

## Toolchain

AGP 9.4 · Gradle 9.8 · Kotlin 2.4 · Compose BOM 2026.09 · Media3 1.11 · Room 2.8 · WorkManager 2.12 ·
anthropic-java 2.68. minSdk 29 (Android 10), target 36. The `just` recipes use Android
Studio's bundled JDK (`/snap/android-studio/current/jbr`) and `~/Android/Sdk`. Override them
with `JAVA_HOME` / `ANDROID_HOME`.
