#!/usr/bin/env bash

# Quick read Chrome extension logs
# Logs auto-save to ~/Downloads/article-song-debug.log

LOG_FILE="$HOME/Downloads/article-song-debug.log"

if [ ! -f "$LOG_FILE" ]; then
  echo "❌ Log file not found: $LOG_FILE"
  echo ""
  echo "Make sure:"
  echo "1. Chrome extension is loaded"
  echo "2. Development logging is enabled in logger.js"
  echo "3. Extension has run at least once"
  exit 1
fi

echo "📝 Reading logs from: $LOG_FILE"
echo "═══════════════════════════════════════════════════════"
echo ""

cat "$LOG_FILE"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ End of logs"
echo ""
echo "💡 Tip: Use 'watch -n 2 cat $LOG_FILE' for live updates"

