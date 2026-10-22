#!/bin/bash
# MyChess launcher script, run by MyChess.app (Contents/Resources/launch.sh).
# Starts the local server if it is not running yet, then opens the app window.
# When it started the server it waits for it, so the app stays open while it runs.
# Keep MyChess.app inside the MyChess folder (it serves the folder it sits in).
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
LOG="$HOME/Library/Logs/MyChess.log"
PY=/usr/bin/python3
[ -x "$PY" ] || PY="$(command -v python3)"
URL=""
PID=""
for PORT in $(seq 8971 8990); do
  if curl -s -m 1 -D - -o /dev/null "http://127.0.0.1:$PORT/__alive" 2>/dev/null | grep -qi '^X-MyChess: 1'; then
    URL="http://127.0.0.1:$PORT/"; break          # already running
  fi
  if ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
    "$PY" "$ROOT/serve.py" --port "$PORT" --no-browser --idle-exit 900 >>"$LOG" 2>&1 &
    PID=$!
    # Wait up to a minute: the first start can sit behind macOS's Desktop-access prompt.
    for _ in $(seq 1 240); do
      if curl -s -m 1 -o /dev/null "http://127.0.0.1:$PORT/__alive"; then
        URL="http://127.0.0.1:$PORT/"; break
      fi
      kill -0 "$PID" 2>/dev/null || break       # the server gave up
      sleep 0.25
    done
    break
  fi
done
if [ -z "$URL" ]; then
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null
    osascript -e 'display alert "MyChess could not start" message "The local server did not start. If macOS asked about access to a folder, choose Allow (or turn on MyChess in System Settings → Privacy & Security → Files and Folders), then open MyChess again.\n\nDetails are in ~/Library/Logs/MyChess.log."'
  else
    osascript -e 'display alert "MyChess" message "Could not find a free port for the local server."'
  fi
  exit 1
fi
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
else
  open "$URL"
fi
[ -n "$PID" ] && wait "$PID"
exit 0
