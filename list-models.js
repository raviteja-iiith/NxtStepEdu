const fs = require('fs');
const env = fs.readFileSync('apps/web/.env.local', 'utf8');
const match = env.match(/GROQ_API_KEY=(.+)/);
if (match) {
  const key = match[1].trim();
  fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${key}` }
  }).then(r => r.json()).then(console.log).catch(console.error);
}
