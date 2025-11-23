/**
 * Test different Suno API endpoints to find the correct one
 * Run this in the Suno app.suno.ai browser console
 */

(async function findWorkingEndpoint() {
  console.log('🔍 Testing Different Suno Endpoints...');
  console.log('=========================================\n');
  
  // List of possible endpoints to try
  const endpoints = [
    'https://studio-api.suno.ai/api/generate/v2/',
    'https://studio-api.suno.ai/api/generate/',
    'https://studio-api.suno.ai/api/v2/generate/',
    'https://studio-api.suno.ai/v2/generate/',
    'https://api.suno.ai/api/generate/v2/',
    'https://api.suno.ai/generate/',
  ];
  
  const testData = {
    "prompt": "test",
    "tags": "test",
    "title": "Test",
    "make_instrumental": false,
    "model": "chirp-v3-5",
    "wait_audio": false
  };
  
  for (const endpoint of endpoints) {
    console.log(`\n📡 Testing: ${endpoint}`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData),
        credentials: 'include'
      });
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.status !== 503) {
        const text = await response.text();
        console.log(`   ✅ Got non-503 response!`);
        console.log(`   Body: ${text.substring(0, 200)}`);
        
        if (response.ok) {
          console.log(`\n✅✅✅ FOUND IT! ✅✅✅`);
          console.log(`Working endpoint: ${endpoint}`);
          return endpoint;
        }
      } else {
        console.log(`   ❌ 503 Service Suspended`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n😞 No working endpoints found');
  console.log('💡 Suno might have changed their API or it might be down');
})();

