const fs = require('fs');
const env = fs.readFileSync('apps/web/.env.local', 'utf8');
const key = env.match(/GROQ_API_KEY=(.+)/)[1].trim();

const models = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.1-8b-instant',
  'llama3-8b-8192',
  'compound-beta-mini',
];

async function test() {
  for (const model of models) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{role:'user', content:'hi'}], max_tokens: 10 })
      });
      const j = await r.json();
      if (j.choices) console.log('✅', model);
      else console.log('❌', model, j.error?.message?.slice(0,80));
    } catch(e) { console.log('❌', model, e.message); }
  }
}
test();
