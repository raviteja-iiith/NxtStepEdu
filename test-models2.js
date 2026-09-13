const fs = require('fs');
const env = fs.readFileSync('apps/web/.env.local', 'utf8');
const key = env.match(/GROQ_API_KEY=(.+)/)[1].trim();

const models = [
  'compound-beta-mini',
  'groq/compound-mini',
  'groq/compound',
  'qwen/qwen3.6-27b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
];

async function test() {
  for (const model of models) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{role:'user', content:'list 2 colors'}],
          max_tokens: 30,
          tools: [{type:'function', function:{name:'test', description:'test', parameters:{type:'object', properties:{}}}}]
        })
      });
      const j = await r.json();
      if (j.choices) console.log('✅', model, 'finish:', j.choices[0].finish_reason);
      else console.log('❌', model, j.error?.message?.slice(0,100));
    } catch(e) { console.log('❌', model, e.message); }
  }
}
test();
