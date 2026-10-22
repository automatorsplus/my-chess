#!/bin/bash
# Builds MyChess.app, the launcher, from main.m, launch.sh, Info.plist and AppIcon.icns:  bash tools/launcher/build.sh
# The bundle is built and signed in a temporary folder, then copied into place,
# because signing inside an iCloud-synced folder fails (iCloud adds file attributes).
# Rebuilding changes the signature, so macOS may ask again for folder access once.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/../.." && pwd)/MyChess.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

B="$TMP/MyChess.app/Contents"
mkdir -p "$B/MacOS" "$B/Resources"
cp "$HERE/Info.plist" "$B/Info.plist"
cp "$HERE/AppIcon.icns" "$B/Resources/AppIcon.icns"
clang -fobjc-arc -O2 -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
  -framework Cocoa -o "$B/MacOS/MyChess" "$HERE/main.m"
cp "$HERE/launch.sh" "$B/Resources/launch.sh"
chmod +x "$B/Resources/launch.sh"
xattr -cr "$TMP/MyChess.app"
codesign --force --deep --sign - --identifier local.mychess.launcher "$TMP/MyChess.app"
codesign --verify --strict "$TMP/MyChess.app"

rm -rf "$APP"
ditto "$TMP/MyChess.app" "$APP"
codesign --verify --strict "$APP" && echo "Built and signed $APP"
