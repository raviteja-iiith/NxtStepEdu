import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const WEEKLY_LIMIT = 5;

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
    if (!token) return NextResponse.json({ remaining: 0, used: WEEKLY_LIMIT });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ remaining: 0, used: WEEKLY_LIMIT });

    const weekStart = getWeekStart();
    const { count } = await supabase
      .from('question_bank_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('used_at', weekStart);

    const used = count ?? 0;
    return NextResponse.json({ used, remaining: Math.max(0, WEEKLY_LIMIT - used), limit: WEEKLY_LIMIT });
  } catch (e: any) {
    return NextResponse.json({ used: 0, remaining: WEEKLY_LIMIT, limit: WEEKLY_LIMIT });
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

    // Check weekly usage
    const weekStart = getWeekStart();
    const { count } = await supabase
      .from('question_bank_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('used_at', weekStart);

    const used = count ?? 0;
    if (used >= WEEKLY_LIMIT) {
      return NextResponse.json({
        error: `Weekly limit reached. You have used all ${WEEKLY_LIMIT} generations for this week. Resets every Monday.`,
        limitReached: true,
        used,
        limit: WEEKLY_LIMIT,
      }, { status: 429 });
    }

    const { className, subject, chapter, difficulty, count: qCount, questionType } = await req.json();

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not set in .env.local' }, { status: 500 });

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
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "answer": "B",
      "explanation": "..."
    },
    {
      "question": "...",
      "type": "short",
      "answer": "model answer",
      "explanation": "..."
    }
  ]
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
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
      return NextResponse.json({ error: `Groq API error: ${err}` }, { status: 500 });
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

    return NextResponse.json({
      questions,
      used: used + 1,
      remaining: WEEKLY_LIMIT - used - 1,
      limit: WEEKLY_LIMIT,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected server error' }, { status: 500 });
  }
}
