/**
 * MINIMAL SUNO TEST EXTENSION
 * 
 * Purpose: Prove that browser extensions can bypass CORS and call Suno API directly
 * 
 * What it does:
 * 1. You click the extension button
 * 2. It sends a hardcoded request to Suno: "a folk punk song about baking"
 * 3. Logs everything to Browser Console
 * 4. Shows notification with result
 * 
 * How to test:
 * 1. Load this extension in Firefox
 * 2. Make sure you're logged into app.suno.ai
 * 3. Open Browser Console (Ctrl+Shift+J)
 * 4. Click the extension button
 * 5. Watch the console!
 */

console.log('🎵 Suno Test Extension loaded!');

// Listen for clicks on the browser action (extension button)
browser.browserAction.onClicked.addListener(async () => {
  console.log('🎯 Extension button clicked! Sending request to Suno...');
  console.log('═══════════════════════════════════════════════════════');
  
  try {
    // The hardcoded test request
    const testData = {
      "prompt": "[Verse]\nIn the kitchen I am baking\nDough is rising, no mistaking\nFlour flying everywhere\nPunk rock music in the air\n\n[Chorus]\nBake it loud, bake it proud\nSourdough rebellion, sing it loud\nFolk punk ovens, burning bright\nBaking through the night",
      "tags": "folk punk, acoustic guitar, energetic, rebellious",
      "title": "Baking Rebellion",
      "make_instrumental": false,
      "model": "chirp-v3-5",
      "wait_audio": false
    };
    
    console.log('📋 Request payload:', testData);
    console.log('📡 Endpoint: https://studio-api.suno.ai/api/generate/v2/');
    console.log('⏳ Sending...\n');
    
    // Make the request
    // KEY: Background scripts bypass CORS!
    const response = await fetch('https://studio-api.suno.ai/api/generate/v2/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
      credentials: 'include'  // Include cookies
    });
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Status Text:', response.statusText);
    console.log('📊 Response Headers:', [...response.headers.entries()]);
    
    // Try to read the response body
    const responseText = await response.text();
    console.log('📦 Response Body (raw):', responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
      console.log('📦 Response Data (parsed):', data);
    } catch (e) {
      console.log('⚠️  Could not parse response as JSON');
      data = { raw: responseText };
    }
    
    // Interpret the results
    console.log('\n═══════════════════════════════════════════════════════');
    if (response.ok && (response.status === 200 || response.status === 201)) {
      console.log('✅✅✅ SUCCESS! ✅✅✅');
      console.log('🎉 Direct Suno API works from browser extension!');
      console.log('💡 CORS was bypassed successfully!');
      console.log('🚀 Browser-only extension is VIABLE!');
      console.log('');
      console.log('📝 Song data:', data);
      
      // Show success notification
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon.png'),
        title: '✅ Suno API Test - SUCCESS!',
        message: 'Direct API call worked! Browser-only extension is viable! Check console for details.'
      });
      
    } else if (response.status === 401) {
      console.log('⚠️  401 Unauthorized');
      console.log('💡 You might not be logged into Suno');
      console.log('   → Open app.suno.ai and log in');
      console.log('   → Then try again');
      
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon.png'),
        title: '⚠️ Not Logged In',
        message: 'Please log into app.suno.ai first, then try again'
      });
      
    } else if (response.status === 402) {
      console.log('⚠️  402 Payment Required');
      console.log('💡 Your Suno account needs credits');
      console.log('   → But the API itself WORKS!');
      console.log('   → Extension approach is viable!');
      
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon.png'),
        title: '⚠️ Need Suno Credits',
        message: 'API works! Just need to add credits to your Suno account.'
      });
      
    } else if (response.status === 403) {
      console.log('❌ 403 Forbidden');
      console.log('💡 Suno might be blocking this approach');
      console.log('   → This is the scenario we were worried about');
      
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon.png'),
        title: '❌ Blocked',
        message: 'Suno returned 403 Forbidden. Check console for details.'
      });
      
    } else if (response.status === 503) {
      console.log('⚠️  503 Service Unavailable');
      console.log('💡 Suno servers might be busy');
      console.log('   → Try again in a moment');
      
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon.png'),
        title: '⚠️ Server Busy',
        message: 'Suno servers are busy. Try again in a moment.'
      });
      
    } else {
      console.log('⚠️  Unexpected status:', response.status);
      console.log('📝 Check response data above');
      
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon.png'),
        title: '⚠️ Unexpected Response',
        message: `Status ${response.status}. Check browser console for details.`
      });
    }
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ ERROR:', error);
    console.error('📋 Error details:', error.message);
    console.error('📋 Stack trace:', error.stack);
    
    // Check if it's a CORS error
    if (error.message && error.message.toLowerCase().includes('cors')) {
      console.log('\n💡 Got CORS error even from extension!');
      console.log('   → This is unexpected...');
      console.log('   → Background scripts should bypass CORS');
      console.log('   → Maybe we need different manifest permissions?');
    }
    
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icon.png'),
      title: '❌ Error',
      message: `Error: ${error.message}. Check browser console.`
    });
  }
});

console.log('✅ Background script ready!');
console.log('💡 Click the extension button to test Suno API');

