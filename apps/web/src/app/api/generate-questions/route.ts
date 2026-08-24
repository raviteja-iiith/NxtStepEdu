import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';



// Service role client — bypasses RLS for usage tracking
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Monday 00:00:00 of the current week (IST-safe — uses UTC internally)
function getWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

export async function GET(req: NextRequest) {
  // Returns remaining uses for this week
  try {
    const supabase = getServiceClient();
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return NextResponse.json({ used: 0 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ used: 0 });

    const weekStart = getWeekStart();
    const { count } = await supabase
      .from('question_bank_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('used_at', weekStart);

    const used = count ?? 0;
    return NextResponse.json({ used });
  } catch (e: any) {
    return NextResponse.json({ used: 0 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient();

    // Authenticate the caller
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

    // Track usage (informational only — no limit enforced)
    const weekStart = getWeekStart();
    const { count } = await supabase
      .from('question_bank_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('used_at', weekStart);

    const used = count ?? 0;

    const { className, subject, chapter, difficulty, count: qCount, questionType } = await req.json();

    const typeInstruction =
      questionType === 'mcq'    ? 'Multiple Choice Questions with 4 options (A, B, C, D).'
      : questionType === 'short'? 'Short Answer Questions (2-3 sentence answers).'
      : questionType === 'long' ? 'Long Answer / Essay Questions (detailed paragraph answers).'
      : 'A mix of MCQ, Short Answer, and Long Answer questions.';

    const difficultyGuide =
      difficulty === 'easy'   ? 'Easy: Basic recall, definitions, simple facts.'
      : difficulty === 'medium'? 'Medium: Application, understanding, 2-mark level.'
      : difficulty === 'hard'  ? 'Hard: Analysis, inference, 5-mark essay level.'
      : 'Mixed: A balance of easy, medium, and hard.';

    const systemPrompt = `You are an expert AP State Board (Andhra Pradesh, India) teacher. Respond with valid JSON only — no markdown, no explanation outside the JSON.`;

    const userPrompt = `Generate exactly ${qCount} questions for:
- Class: ${className} (AP State Board)
- Subject: ${subject}
- Chapter: ${chapter}
- Type: ${typeInstruction}
- Difficulty: ${difficultyGuide}

Rules:
1. Follow AP State Board syllabus strictly for Class ${className}.
2. MCQ must have exactly 4 options A, B, C, D.
3. MCQ answer field: write only the letter (e.g., "B").
4. Short/Long answer field: write the full model answer.
5. Include a brief explanation for every question.

Return ONLY this JSON structure (no text outside):
{
  "questions": [
    {
      "question": "...",
      "type": "mcq",
      "difficulty": "easy",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "answer": "B",
      "explanation": "..."
    },
    {
      "question": "...",
      "type": "short",
      "difficulty": "medium",
      "answer": "model answer",
      "explanation": "..."
    }
  ]
}`;

    // Prefer Gemini API (1M TPM free tier) with fallback to Groq
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return NextResponse.json({ error: 'No AI API key configured. Set GEMINI_API_KEY or GROQ_API_KEY in environment.' }, { status: 500 });
    }

    const useGemini = !!geminiKey;
    const apiUrl = useGemini
      ? `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
      : 'https://api.groq.com/openai/v1/chat/completions';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${useGemini ? geminiKey : groqKey}`,
      },
      body: JSON.stringify({
        model: useGemini ? 'gemini-2.5-flash' : 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `AI API error: ${err}` }, { status: 500 });
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '';

    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch { return NextResponse.json({ error: 'Could not parse response. Try again.', raw }, { status: 500 }); }

    const questions = Array.isArray(parsed)
      ? parsed
      : parsed.questions ?? parsed.data ?? Object.values(parsed)[0] ?? [];

    // ✅ Log successful generation
    await supabase.from('question_bank_usage').insert({ user_id: user.id });

    return NextResponse.json({ questions, used: used + 1 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected server error' }, { status: 500 });
  }
}
