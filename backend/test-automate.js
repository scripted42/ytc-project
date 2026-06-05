async function run() {
  console.log('Connecting to ClipFlow backend at http://localhost:5000...');
  
  try {
    // 1. Get campaigns list
    const campaignsRes = await fetch('http://localhost:5000/api/campaigns');
    const campaigns = await campaignsRes.json();
    let codCampaign = campaigns.find(c => c.name.includes('Call of Duty'));
    
    if (!codCampaign) {
      console.log('Adding Call of Duty MW4 Campaign...');
      const addRes = await fetch('http://localhost:5000/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Call of Duty - Modern Warfare 4 Reveal Trailer',
          brand: 'Clipping Culture / Activision',
          rate: 1.50,
          sourceUrl: 'https://www.youtube.com/watch?v=jLbst85USN8',
          guidelines: '1. Tag @callofduty on every post (TikTok/Insta caption, or YouTube Shorts title).\n2. FTC Disclosure (#Ad, #Advertisement, or #Sponsored) is REQUIRED.\n3. Placement: Must be on its own separate line, as the first hashtag.\n4. Original audio only. Do NOT add background music or gameplay B-roll.\n5. Video length: Must be at least 10 seconds.',
          platform: ['tiktok', 'youtube', 'instagram']
        })
      });
      codCampaign = await addRes.json();
      console.log('Campaign added:', codCampaign.id);
    } else {
      console.log('Call of Duty campaign already exists:', codCampaign.id);
    }

    // 2. Trigger Clip Generation (startTime = 20, duration = 15)
    console.log('Triggering automated clip generation...');
    const generateRes = await fetch('http://localhost:5000/api/clips/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: codCampaign.id,
        startTime: 20,
        duration: 15,
        useSplitScreen: false,
        title: 'This new MW4 trailer is absolutely cinematic! 🔥 @callofduty',
        tags: '#Ad\n#MW4 #ModernWarfare4 #clipping'
      })
    });

    const clipData = await generateRes.json();
    console.log('Clip generation queued successfully!');
    console.log('Clip ID:', clipData.id);
    console.log('Status:', clipData.status);
    console.log('\nLook at your browser dashboard (http://localhost:5173) to see the live rendering progress!');
    
  } catch (err) {
    console.error('Automation trigger failed:', err.message);
  }
}

run();
