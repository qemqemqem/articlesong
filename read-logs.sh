#!/bin/bash
# Quick script to read the latest logs
# NOTE: Development mode must be enabled for automatic log file downloads

LOG_FILE="$HOME/Downloads/article-song-debug.log"

if [ -f "$LOG_FILE" ]; then
    echo "📝 Article Song Debug Logs"
    echo "=========================="
    echo ""
    cat "$LOG_FILE"
else
    echo "❌ Log file not found at: $LOG_FILE"
    echo ""
    echo "NOTE: Automatic log file downloads are DISABLED by default (production mode)"
    echo ""
    echo "To enable log file downloads during development:"
    echo "1. Edit add-on/logger.js"
    echo "2. Uncomment the marked sections in init() and _addLog()"
    echo "3. Reload the extension"
    echo ""
    echo "Alternative: View logs in the extension's Debug page (Options → Debug Logs)"
fi

