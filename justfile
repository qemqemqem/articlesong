# ArticleSong: browser add-on (add-on/) + Android app (android/).
# Run `just` to list recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load := true

# The JDK bundled with Android Studio, and the standard SDK location (override via env).
export JAVA_HOME := env("JAVA_HOME", "/snap/android-studio/current/jbr")
export ANDROID_HOME := env("ANDROID_HOME", home_directory() / "Android/Sdk")

adb := ANDROID_HOME / "platform-tools/adb"
gradlew := "cd android && ./gradlew --console=plain"
debug_pkg := "com.articlesong.app.debug"
release_pkg := "com.articlesong.app"
release_apk := "android/app/build/outputs/apk/release/app-release.apk"

default:
    @just --list --unsorted

# ─── Everything ──────────────────────────────────────────────────────────────

# Fast tests: add-on (node) + Android JVM unit tests
[group('all')]
test: test-addon test-android

# Fast tests + on-device tests (needs an emulator or phone; see `just emulator`)
[group('all')]
test-all: test test-device

# ─── Browser add-on ──────────────────────────────────────────────────────────

# Add-on tests, plus the shared prompt-recipe tests
[group('add-on')]
test-addon:
    npm test
    node tests/recipe.test.js

# The add-on in real headless Firefox (iframes, the PDF viewer, local PDFs); needs firefox + geckodriver
[group('add-on')]
test-firefox:
    npm run test:firefox

[group('add-on')]
lint-addon:
    npm run lint

# Zip the add-on for addons.mozilla.org
[group('add-on')]
package-addon:
    ./package-firefox.sh

# ─── Android: build & install ────────────────────────────────────────────────

# Debug APK (android/app/build/outputs/apk/debug/)
[group('android')]
build:
    {{gradlew}} :app:assembleDebug

# Minified, signed release APK - the one to keep on your phone
[group('android')]
release:
    {{gradlew}} :app:assembleRelease
    @echo "APK: {{release_apk}}"

# Build + install the debug app (com.articlesong.app.debug) and open it
[group('android')]
install:
    {{gradlew}} :app:installDebug
    {{adb}} shell am start -n {{debug_pkg}}/com.articlesong.app.MainActivity

# Build + install the release app (com.articlesong.app) and open it
[group('android')]
install-release: release
    {{adb}} install -r {{release_apk}}
    {{adb}} shell am start -n {{release_pkg}}/com.articlesong.app.MainActivity

# Remove both app variants from the device (deletes their songs!)
[group('android')]
uninstall:
    -{{adb}} uninstall {{debug_pkg}}
    -{{adb}} uninstall {{release_pkg}}

# One-time: create your own release signing key (android/keystore/, git-ignored)
[group('android')]
keystore:
    #!/usr/bin/env bash
    set -euo pipefail
    cd android
    if [ -f keystore.properties ]; then echo "android/keystore.properties already exists"; exit 0; fi
    mkdir -p keystore
    read -rsp "Choose a keystore password (min 6 chars): " pw; echo
    "$JAVA_HOME/bin/keytool" -genkeypair -v -keystore keystore/release.jks -alias articlesong \
        -keyalg RSA -keysize 4096 -validity 36500 -storepass "$pw" -keypass "$pw" \
        -dname "CN=ArticleSong"
    printf 'storeFile=keystore/release.jks\nstorePassword=%s\nkeyAlias=articlesong\nkeyPassword=%s\n' "$pw" "$pw" > keystore.properties
    echo "Done. Back up android/keystore/ - you need it to update the app without reinstalling."

[group('android')]
clean:
    {{gradlew}} clean

# ─── Android: tests ──────────────────────────────────────────────────────────

# JVM unit tests (recipe parity with the add-on, API clients, pipeline, share parsing)
[group('android tests')]
test-android:
    {{gradlew}} :app:testDebugUnitTest

# On-device tests: WebView extraction, storage, share→play end-to-end, UI, background auto-play
[group('android tests')]
test-device:
    {{gradlew}} :app:connectedDebugAndroidTest

# Real Anthropic API with the shared prompts (needs ANTHROPIC_API_KEY; costs a few cents)
[group('android tests')]
test-live:
    #!/usr/bin/env bash
    set -euo pipefail
    [ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "Set ANTHROPIC_API_KEY (env or .env)"; exit 1; }
    cd android && ./gradlew --console=plain -q :app:testDebugUnitTest --tests '*ClaudeLiveTest*' -Plive=true
    python3 -c "import re; s=open('app/build/test-results/testDebugUnitTest/TEST-com.articlesong.app.api.ClaudeLiveTest.xml').read(); m=re.search(r'<system-out><!\[CDATA\[(.*?)\]\]>', s, re.S); print(m.group(1) if m else s)"

# Walk every screen with demo data and save screenshots to android/build/screenshots/
[group('android tests')]
screenshots:
    {{gradlew}} :app:installDebug :app:installDebugAndroidTest
    {{adb}} shell rm -rf /sdcard/Download/articlesong-tour
    {{adb}} shell am instrument -w -e tour true -e class com.articlesong.app.ScreenshotTour \
        {{debug_pkg}}.test/androidx.test.runner.AndroidJUnitRunner
    mkdir -p android/build/screenshots
    {{adb}} pull /sdcard/Download/articlesong-tour/. android/build/screenshots/
    @echo "Screenshots: android/build/screenshots/"

# ─── Devices & day-to-day ────────────────────────────────────────────────────

[group('device')]
devices:
    {{adb}} devices -l

# Start an emulator (default: first AVD) in the background
[group('device')]
emulator avd="":
    #!/usr/bin/env bash
    set -euo pipefail
    name="{{avd}}"
    [ -n "$name" ] || name=$("$ANDROID_HOME/emulator/emulator" -list-avds | head -1)
    echo "Starting $name…"
    nohup "$ANDROID_HOME/emulator/emulator" -avd "$name" -no-snapshot-save >/dev/null 2>&1 &
    "{{adb}}" wait-for-device
    until [ "$("{{adb}}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
    echo "Booted."

# Connect to a phone over Wi-Fi: `just wifi 192.168.1.23:37155` (after pairing, see android/README.md)
[group('device')]
wifi address:
    {{adb}} connect {{address}}

# Share a link to the debug app as if from Chrome: `just share https://…`
[group('device')]
share url pkg=debug_pkg:
    {{adb}} shell "am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT '{{url}}' -n {{pkg}}/com.articlesong.app.share.ShareActivity"

# Push SUNO_API_KEY / ANTHROPIC_API_KEY (env or .env) into the debug app, so you don't type them on the phone
[group('device')]
push-keys:
    #!/usr/bin/env bash
    set -euo pipefail
    args=()
    [ -n "${SUNO_API_KEY:-}" ] && args+=(--es suno_key "$SUNO_API_KEY")
    [ -n "${ANTHROPIC_API_KEY:-}" ] && args+=(--es anthropic_key "$ANTHROPIC_API_KEY")
    [ ${#args[@]} -gt 0 ] || { echo "Set SUNO_API_KEY and/or ANTHROPIC_API_KEY (env or .env)"; exit 1; }
    just _configure "${args[@]}"
    echo "Keys pushed to the debug app."

# Debug app logs (pipeline, worker, player, WorkManager)
[group('device')]
logcat:
    {{adb}} logcat -v color --pid=$({{adb}} shell pidof -s {{debug_pkg}}) | grep -v -E "ViewRootImpl|InsetsController|ImeTracker"

# Try the app without spending credits: fake Suno + Claude on this machine (Ctrl-C to stop)
[group('device')]
fake-backend stream_after="8" done_after="15":
    {{adb}} reverse tcp:8089 tcp:8089
    just _configure --es suno_key fake --es anthropic_key sk-ant-fake \
        --es suno_base http://127.0.0.1:8089/ --es anthropic_base http://127.0.0.1:8089
    @echo "Debug app now uses the fake backend. Undo with: just real-backend (then just push-keys)"
    python3 android/tools/fake_backend.py --stream-after {{stream_after}} --done-after {{done_after}}

# Point the debug app back at the real SunoAPI / Anthropic APIs
[group('device')]
real-backend:
    just _configure --ez reset_endpoints true
    @echo "Debug app uses the real APIs again."

# Send settings to the debug app's DebugConfigReceiver; fails loudly if it isn't installed
[private]
_configure *args:
    #!/usr/bin/env bash
    set -euo pipefail
    out=$("{{adb}}" shell am broadcast --include-stopped-packages -a com.articlesong.app.debug.CONFIGURE -p {{debug_pkg}} {{args}})
    grep -q 'data="ok"' <<<"$out" || { echo "The debug app didn't respond. Install it first: just install"; exit 1; }
