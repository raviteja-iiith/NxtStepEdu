const fs = require('fs');
const env = fs.readFileSync('apps/web/.env.local', 'utf8');
const match = env.match(/GROQ_API_KEY=(.+)/);
if (match) {
  const key = match[1].trim();
  fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'qwen/qwen3.6-27b', 
      messages: [{role: 'user', content: 'What is the weather in Paris?'}],
      tools: [{type: 'function', function: {name: 'get_weather', description: 'Get weather', parameters: {type: 'object', properties: {location: {type: 'string'}}}}}]
    })
  }).then(r => r.json()).then(console.log).catch(console.error);
}
