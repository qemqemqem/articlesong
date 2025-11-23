#!/bin/bash
# Quick script to read the latest logs
# The extension writes to ~/Downloads/article-song-debug.log

LOG_FILE="$HOME/Downloads/article-song-debug.log"

if [ -f "$LOG_FILE" ]; then
    echo "📝 Article Song Debug Logs"
    echo "=========================="
    echo ""
    cat "$LOG_FILE"
else
    echo "❌ Log file not found at: $LOG_FILE"
    echo ""
    echo "Make sure:"
    echo "1. Extension is loaded in Firefox"
    echo "2. You've clicked the extension button at least once"
    echo "3. Wait a few seconds for the log file to be written"
fi

