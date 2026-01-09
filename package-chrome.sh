#!/usr/bin/env bash

# Package Chrome extension for Chrome Web Store submission
# Creates a clean zip file without unnecessary files

set -e

CHROME_DIR="add-on-chrome"
OUTPUT_FILE="articlesong-chrome.zip"
PROJECT_ROOT="$(pwd)"

echo "📦 Packaging ArticleSong for Chrome Web Store..."

# Remove old zip if it exists
if [ -f "$OUTPUT_FILE" ]; then
  rm "$OUTPUT_FILE"
  echo "✅ Removed old $OUTPUT_FILE"
fi

# Create temporary clean directory
TEMP_DIR=$(mktemp -d)
echo "📁 Creating clean build in $TEMP_DIR"

# Copy extension files
cp -r "$CHROME_DIR"/* "$TEMP_DIR/"

# Remove development/debug files
echo "🧹 Cleaning up unnecessary files..."
cd "$TEMP_DIR"
rm -f debug.html debug.js
rm -f *.log
rm -f *~
rm -rf .git .gitignore
rm -rf node_modules
rm -f package.json package-lock.json

# Remove old songify icons (if any exist)
rm -f icons/songify*.png

# Create zip in project root
echo "📦 Creating zip file..."
zip -r "$PROJECT_ROOT/$OUTPUT_FILE" .

# Clean up temp directory
rm -rf "$TEMP_DIR"

# Back to project root
cd "$PROJECT_ROOT"

echo "✅ Package created: $OUTPUT_FILE"
echo ""
echo "📊 Contents:"
unzip -l "$OUTPUT_FILE" | head -20
echo ""
echo "🚀 Ready to upload to Chrome Web Store!"
echo ""
echo "Next steps:"
echo "1. Go to https://chrome.google.com/webstore/devconsole"
echo "2. Create new item or update existing"
echo "3. Upload $OUTPUT_FILE"
echo "4. Fill in store listing details"
echo "5. Submit for review"
