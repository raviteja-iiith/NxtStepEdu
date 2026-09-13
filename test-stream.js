async function test() {
  const geminiKey = process.env.GEMINI_API_KEY;
  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [{role: 'user', content: 'hello!'}],
        stream: true
      })
    });
    console.log("Status:", resp.status);
    const body = await resp.text();
    console.log("Body length:", body.length);
    console.log("Body start:", body.substring(0, 300));
  } catch (e) { console.error(e); }
}
test();
