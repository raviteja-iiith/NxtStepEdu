async function test() {
  const geminiKey = process.env.GEMINI_API_KEY;
  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
      body: JSON.stringify({
        model: 'gemini-1.5-flash',
        messages: [{role: 'user', content: 'Say strictly the word Apple'}]
      })
    });
    console.log("Status:", resp.status);
    console.log("Body:", await resp.text());
  } catch (e) { console.error(e); }
}
test();
