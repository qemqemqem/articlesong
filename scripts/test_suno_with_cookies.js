#!/usr/bin/env node

/**
 * Test Suno API with cookies from your browser session
 * 
 * SETUP:
 * 1. Log into https://app.suno.ai in Firefox or Chrome
 * 2. Open DevTools (F12) → Application/Storage → Cookies → https://app.suno.ai
 * 3. Copy ALL the cookie values (especially session cookies)
 * 4. Paste them into SUNO_COOKIES below
 * 5. Run: node scripts/test_suno_with_cookies.js
 */

const https = require('https');

// ============================================================
// PASTE YOUR COOKIES HERE (from browser DevTools)
// ============================================================
// Format: "name1=value1; name2=value2; name3=value3"
const SUNO_COOKIES = process.env.SUNO_COOKIES || '';

// If no cookies in env, print instructions
if (!SUNO_COOKIES) {
  console.log('❌ No cookies provided!');
  console.log('\n📋 How to get your cookies:');
  console.log('1. Go to https://app.suno.ai and log in');
  console.log('2. Open DevTools (F12)');
  console.log('3. Go to Application tab → Cookies → https://app.suno.ai');
  console.log('4. Copy all cookie values');
  console.log('5. Set them as environment variable:');
  console.log('\n   export SUNO_COOKIES="cookie1=value1; cookie2=value2"\n');
  console.log('6. Run this script again\n');
  process.exit(1);
}

// Test data
const testData = JSON.stringify({
  "prompt": "[Verse]\nThis is a test\nTesting direct API\nWith cookies from browser\nNo PIAPI",
  "tags": "test, experimental, spoken word",
  "title": "Cookie Auth Test",
  "make_instrumental": false,
  "model": "chirp-v3-5",
  "wait_audio": false
});

const options = {
  hostname: 'studio-api.suno.ai',
  port: 443,
  path: '/api/generate/v2/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': testData.length,
    'Cookie': SUNO_COOKIES,
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
    'Accept': 'application/json',
    'Origin': 'https://app.suno.ai',
    'Referer': 'https://app.suno.ai/'
  }
};

console.log('🎵 Testing Suno Direct API with Cookie Auth...');
console.log('===============================================\n');
console.log('📡 Endpoint:', `https://${options.hostname}${options.path}`);
console.log('🍪 Cookies length:', SUNO_COOKIES.length, 'characters');
console.log('📋 Request data:', JSON.parse(testData));
console.log('\n⏳ Sending request...\n');

const req = https.request(options, (res) => {
  let data = '';

  console.log('📊 Response Status:', res.statusCode);
  console.log('📊 Response Headers:', res.headers);
  console.log('');

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📦 Response Body:', data);
    console.log('');

    try {
      const parsed = JSON.parse(data);
      console.log('📋 Parsed Response:', JSON.stringify(parsed, null, 2));
      console.log('');
    } catch (e) {
      console.log('⚠️  Could not parse as JSON');
    }

    // Interpret results
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('✅✅✅ SUCCESS! ✅✅✅');
      console.log('');
      console.log('🎉 Direct Suno API works with cookies!');
      console.log('💡 This means:');
      console.log('   → Browser-only extension is VIABLE');
      console.log('   → No Python backend needed');
      console.log('   → Users just need Suno account');
      console.log('   → Fully shareable plugin!');
      console.log('');
      console.log('🚀 Next step: Build the browser extension!');
    } else if (res.statusCode === 401) {
      console.log('⚠️  401 Unauthorized');
      console.log('💡 Your cookies might be expired or invalid');
      console.log('   → Log into Suno again and get fresh cookies');
    } else if (res.statusCode === 402) {
      console.log('⚠️  402 Payment Required');
      console.log('💡 Your Suno account needs credits');
      console.log('   → But the API itself WORKS!');
      console.log('   → Browser extension approach is viable');
    } else if (res.statusCode === 403) {
      console.log('❌ 403 Forbidden');
      console.log('💡 Suno is blocking this approach');
      console.log('   → Might need to revisit strategy');
    } else {
      console.log('⚠️  Unexpected status code');
      console.log('💡 Check the response body above for details');
    }
    console.log('');
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  console.error('📋 Full error:', error);
});

req.write(testData);
req.end();

