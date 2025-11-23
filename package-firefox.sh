#!/bin/bash

# Package ArticleSong for Firefox Add-on Store Submission
# Creates a clean .zip file with only the necessary extension files

echo "📦 Packaging ArticleSong for Firefox..."

# Set output filename
OUTPUT="articlesong-firefox-v1.0.zip"

# Remove old package if it exists
if [ -f "$OUTPUT" ]; then
    echo "🗑️  Removing old package..."
    rm "$OUTPUT"
fi

# Create the package
echo "📦 Creating package..."
cd add-on && zip -r "../$OUTPUT" \
    background.js \
    content_script.js \
    logger.js \
    manifest.json \
    popup.html \
    popup.js \
    prompts.js \
    Readability.js \
    options.html \
    options.js \
    icons/ \
    -x "*.DS_Store" \
    -x "*debug*"

cd ..

# Check if successful
if [ -f "$OUTPUT" ]; then
    echo "✅ Package created successfully!"
    echo "📍 Location: $(pwd)/$OUTPUT"
    echo "📊 Size: $(du -h "$OUTPUT" | cut -f1)"
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Go to https://addons.mozilla.org/developers/"
    echo "   2. Sign in with Firefox Account"
    echo "   3. Click 'Submit a New Add-on'"
    echo "   4. Upload $OUTPUT"
    echo ""
else
    echo "❌ Failed to create package"
    exit 1
fi

