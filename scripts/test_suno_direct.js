/**
 * Quick test to see if we can call Suno's internal API directly with cookies
 * 
 * HOW TO USE:
 * 1. Log into https://app.suno.ai in your browser
 * 2. Open DevTools (F12)
 * 3. Go to Console tab
 * 4. Paste this entire script and press Enter
 * 5. Watch the output!
 */

(async function testSunoDirectAPI() {
  console.log('🎵 Testing Direct Suno API Access...');
  console.log('=====================================\n');
  
  // Test 1: Check if we can reach the API
  console.log('📡 Step 1: Testing API endpoint accessibility...');
  
  const testLyrics = `[Verse]
This is a test song
To see if the API works
Direct cookie auth
No PIAPI needed`;

  const testData = {
    "prompt": testLyrics,
    "tags": "test, experimental, spoken word",
    "title": "API Test Song",
    "make_instrumental": false,
    "model": "chirp-v3-5",
    "wait_audio": false
  };
  
  console.log('📋 Request data:', testData);
  console.log('\n⏳ Sending request to Suno...\n');
  
  try {
    const response = await fetch('https://studio-api.suno.ai/api/generate/v2/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Cookies are automatically included when calling from browser context
      },
      body: JSON.stringify(testData),
      credentials: 'include' // Important: ensures cookies are sent
    });
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Status Text:', response.statusText);
    
    const data = await response.json();
    console.log('📦 Response Data:', data);
    
    if (response.ok) {
      console.log('\n✅ SUCCESS! Direct Suno API works!');
      console.log('🎵 Song generation initiated');
      
      if (data.clips || data.id) {
        console.log('📝 Task ID or clips returned:', data.id || data.clips);
        console.log('\n💡 Next steps:');
        console.log('   1. Browser-only extension is VIABLE!');
        console.log('   2. No Python backend needed');
        console.log('   3. Cookies handle auth automatically');
      }
      
      return { success: true, data };
    } else {
      console.log('\n⚠️  API call failed');
      console.log('❌ Status:', response.status);
      console.log('📝 Error details:', data);
      
      if (response.status === 401) {
        console.log('\n💡 401 means: Not authenticated');
        console.log('   → Make sure you\'re logged into Suno!');
      } else if (response.status === 403) {
        console.log('\n💡 403 means: Forbidden');
        console.log('   → Suno might be blocking this approach');
      } else if (response.status === 402) {
        console.log('\n💡 402 means: Payment required');
        console.log('   → Your Suno account needs credits');
      }
      
      return { success: false, status: response.status, data };
    }
    
  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    console.log('📋 Full error:', error);
    
    if (error.message.includes('CORS')) {
      console.log('\n💡 CORS error means:');
      console.log('   → The API might not allow browser requests');
      console.log('   → But browser EXTENSIONS bypass CORS!');
      console.log('   → So this could still work in an extension');
    }
    
    return { success: false, error: error.message };
  }
})();

/**
 * WHAT TO LOOK FOR:
 * 
 * ✅ Status 200 = IT WORKS! Build the browser extension!
 * ✅ Status 201 = IT WORKS! Build the browser extension!
 * ⚠️  Status 401 = Not logged in (log into Suno first)
 * ⚠️  Status 402 = Need Suno credits (but the API itself works!)
 * ❌ Status 403 = Suno is blocking this (back to drawing board)
 * ❌ CORS error from console = Extension might still work (background scripts bypass CORS)
 */

