import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { className, subject, chapter, difficulty, count, questionType } = await req.json();

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not set in .env.local' }, { status: 500 });
    }

    const typeInstruction =
      questionType === 'mcq'   ? 'Multiple Choice Questions with 4 options (A, B, C, D).'
      : questionType === 'short' ? 'Short Answer Questions (2-3 sentence answers).'
      : questionType === 'long'  ? 'Long Answer / Essay Questions (detailed paragraph answers).'
      : 'A mix of MCQ, Short Answer, and Long Answer questions.';

    const difficultyGuide =
      difficulty === 'easy'   ? 'Easy: Basic recall, definitions, simple facts.'
      : difficulty === 'medium' ? 'Medium: Application, understanding, 2-mark level.'
      : difficulty === 'hard'   ? 'Hard: Analysis, inference, 5-mark essay level.'
      : 'Mixed: A balance of easy, medium, and hard.';

    const systemPrompt = `You are an expert AP State Board (Andhra Pradesh, India) teacher. 
You always respond with valid JSON only — no markdown, no explanation, just the JSON array.`;

    const userPrompt = `Generate exactly ${count} questions for:
- Class: ${className} (AP State Board)
- Subject: ${subject}
- Chapter: ${chapter}
- Type: ${typeInstruction}
- Difficulty: ${difficultyGuide}

Rules:
1. Strictly follow AP State Board syllabus for Class ${className}.
2. MCQ must have exactly 4 options A, B, C, D.
3. For MCQ answer field, write only the letter (e.g., "B").
4. For short/long, write the full model answer.
5. Include an explanation for every question.

Return a JSON array ONLY (no markdown, no extra text):
[
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
    "answer": "model answer here",
    "explanation": "..."
  }
]`;

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
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Could not parse response. Try again.', raw }, { status: 500 });
    }

    // Groq with json_object may wrap in { questions: [...] } or return array directly
    const questions = Array.isArray(parsed)
      ? parsed
      : parsed.questions ?? parsed.data ?? Object.values(parsed)[0] ?? [];

    return NextResponse.json({ questions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected server error' }, { status: 500 });
  }
}
