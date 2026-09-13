const tools = [
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description: "Get basic summary",
      parameters: { type: "object", properties: {} }
    }
  }
];

async function test() {
  const geminiKey = process.env.GEMINI_API_KEY;
  console.log("Testing Gemini API key...");
  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [{role: 'user', content: 'hello!'}],
        tools: tools,
        tool_choice: 'auto'
      })
    });
    console.log("Status:", resp.status);
    const body = await resp.text();
    console.log("Body:", body.substring(0, 500));
  } catch (e) { console.error(e); }
}
test();
