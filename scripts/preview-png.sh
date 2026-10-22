#!/usr/bin/env bash
# Renders docs/preview.svg to docs/preview.png at 2x for the Paseo plugin
# directory, which does not accept SVG listing images. Run after `npm run preview`.
# Needs Google Chrome and the Swift toolchain (macOS).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
svg="$root/docs/preview.svg"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
width=$(grep -o 'width="[0-9]*"' "$svg" | head -1 | tr -dc 0-9)
height=$(grep -o 'height="[0-9]*"' "$svg" | head -1 | tr -dc 0-9)
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
printf '<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden"><img src="file://%s" width="%s" height="%s" style="display:block"></body></html>' \
  "$svg" "$width" "$height" > "$work/page.html"
# Headless Chrome's viewport is shorter than --window-size, so render into a taller
# window and keep the top-left SVG area.
"$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --user-data-dir="$work/profile" --default-background-color=00000000 --force-device-scale-factor=2 \
  --window-size="$width,$((height + 300))" --screenshot="$work/full.png" "file://$work/page.html" >/dev/null 2>&1
swiftc -O "$root/scripts/crop-png.swift" -o "$work/crop"
"$work/crop" "$work/full.png" "$root/docs/preview.png" $((width * 2)) $((height * 2))
echo "docs/preview.png: $((width * 2))x$((height * 2))"
