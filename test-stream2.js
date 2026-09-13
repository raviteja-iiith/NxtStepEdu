async function test() {
  const geminiKey = process.env.GEMINI_API_KEY;
  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
      body: JSON.stringify({
        model: 'gemini-1.5-flash',
        messages: [{role: 'user', content: 'Say strictly the word Apple'}],
        stream: true
      })
    });
    
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        console.log("Chunk:", dec.decode(value));
    }
  } catch (e) { console.error(e); }
}
test();
