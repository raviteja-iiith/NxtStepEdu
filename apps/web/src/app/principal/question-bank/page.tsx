'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Question {
  question: string;
  type: 'mcq' | 'short' | 'long';
  options?: { A: string; B: string; C: string; D: string };
  answer: string;
  explanation: string;
}

const SUBJECTS: Record<string, string[]> = {
  '6':  ['Mathematics', 'Physical Science', 'Biological Science', 'Social Studies', 'English', 'Telugu'],
  '7':  ['Mathematics', 'Physical Science', 'Biological Science', 'Social Studies', 'English', 'Telugu'],
  '8':  ['Mathematics', 'Physical Science', 'Biological Science', 'Social Studies', 'English', 'Telugu'],
  '9':  ['Mathematics', 'Physical Science', 'Biological Science', 'Social Studies', 'English', 'Telugu', 'Hindi'],
  '10': ['Mathematics', 'Physical Science', 'Biological Science', 'Social Studies', 'English', 'Telugu', 'Hindi'],
};

const DIFF_COLORS = {
  easy:   { bg: '#DCFCE7', text: '#15803D', border: '#BBF7D0', label: '🟢 Easy' },
  medium: { bg: '#FEF9C3', text: '#A16207', border: '#FDE68A', label: '🟡 Medium' },
  hard:   { bg: '#FEE2E2', text: '#DC2626', border: '#FECACA', label: '🔴 Hard' },
  mixed:  { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', label: '🔵 Mixed' },
};

const TYPE_LABEL: Record<string, string> = {
  mcq: 'MCQ', short: 'Short Answer', long: 'Long Answer',
};

const WEEKLY_LIMIT = 5;

export default function QuestionBankPage() {
  const supabase = createClient();
  const [className, setClassName] = useState('');
  const [subject, setSubject]     = useState('');
  const [chapter, setChapter]     = useState('');
  const [difficulty, setDifficulty] = useState<'easy'|'medium'|'hard'|'mixed'>('mixed');
  const [count, setCount]         = useState(10);
  const [qType, setQType]         = useState<'mcq'|'short'|'long'|'mixed'>('mixed');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [showAnswers, setShowAnswers] = useState(true);
  const [expanded, setExpanded]   = useState<Record<number, boolean>>({});
  const [used, setUsed]           = useState(0);
  const [usageLoading, setUsageLoading] = useState(true);

  // Fetch current week's usage on mount
  useEffect(() => {
    async function fetchUsage() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/generate-questions', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        const d = await res.json();
        setUsed(d.used ?? 0);
      } catch {}
      setUsageLoading(false);
    }
    fetchUsage();
  }, []);

  const subjects = className ? (SUBJECTS[className] || []) : [];

  const remaining = WEEKLY_LIMIT - used;
  const limitReached = used >= WEEKLY_LIMIT;

  async function generate() {
    if (!className || !subject || !chapter.trim()) {
      setError('Please fill in Class, Subject, and Chapter name.'); return;
    }
    if (limitReached) { setError('Weekly limit reached. Resets every Monday.'); return; }
    setLoading(true); setError(''); setQuestions([]); setExpanded({});
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ className, subject, chapter, difficulty, count, questionType: qType }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to generate.');
      } else {
        setQuestions(data.questions || []);
        setUsed(data.used ?? used + 1);
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  function printPaper(withAnswers: boolean) {
    const schoolName = document.querySelector('meta[name="school-name"]')?.getAttribute('content') || 'School';
    const lines: string[] = [];
    lines.push(`<html><head><title>Question Paper</title><style>
      body{font-family:Arial,sans-serif;margin:32px;font-size:14px;color:#000}
      h1{text-align:center;font-size:18px;margin:0}
      h2{text-align:center;font-size:14px;font-weight:normal;margin:4px 0 20px}
      .divider{border:none;border-top:2px solid #000;margin:12px 0}
      .q{margin:16px 0}
      .q-num{font-weight:bold}
      .opts{margin:6px 0 6px 24px}
      .ans{margin-top:6px;padding:6px 10px;background:#f0f0f0;border-left:3px solid #333;font-size:13px}
      .exp{font-size:12px;color:#444;margin-top:4px}
      .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-left:8px}
      .easy{background:#dcfce7;color:#15803d}
      .medium{background:#fef9c3;color:#a16207}
      .hard{background:#fee2e2;color:#dc2626}
      .mcq-badge{background:#eff6ff;color:#1d4ed8}
      .short-badge{background:#f5f3ff;color:#7c3aed}
      .long-badge{background:#fff7ed;color:#c2410c}
      @media print{body{margin:16px}.ans{background:#eee}}
    </style></head><body>`);
    lines.push(`<h1>${subject} — Class ${className}</h1>`);
    lines.push(`<h2>Chapter: ${chapter} &nbsp;|&nbsp; Difficulty: ${difficulty.toUpperCase()} &nbsp;|&nbsp; Total Questions: ${questions.length}</h2>`);
    lines.push(`<div style="display:flex;justify-content:space-between;font-size:13px"><span>Name: ______________________</span><span>Date: ____________</span><span>Marks: _____</span></div>`);
    lines.push(`<hr class="divider">`);
    questions.forEach((q, i) => {
      const diffClass = (q as any).difficulty || difficulty === 'mixed' ? '' : difficulty;
      lines.push(`<div class="q">`);
      lines.push(`<span class="q-num">Q${i + 1}.</span> ${q.question}`);
      lines.push(`<span class="badge ${q.type === 'mcq' ? 'mcq-badge' : q.type === 'short' ? 'short-badge' : 'long-badge'}">${TYPE_LABEL[q.type]}</span>`);
      if (q.type === 'mcq' && q.options) {
        lines.push(`<div class="opts">`);
        ['A','B','C','D'].forEach(k => {
          lines.push(`<div>${k}) ${(q.options as any)[k]}</div>`);
        });
        lines.push(`</div>`);
      }
      if (withAnswers) {
        lines.push(`<div class="ans">Answer: ${q.answer}</div>`);
        if (q.explanation) lines.push(`<div class="exp">Explanation: ${q.explanation}</div>`);
      } else {
        if (q.type === 'short') lines.push(`<div style="margin-top:8px;border-bottom:1px solid #ccc;height:30px"></div>`);
        if (q.type === 'long')  lines.push(`<div style="margin-top:8px;border-bottom:1px solid #ccc;height:80px"></div>`);
      }
      lines.push(`</div>`);
    });
    lines.push(`</body></html>`);
    const win = window.open('', '_blank');
    if (win) { win.document.write(lines.join('\n')); win.document.close(); win.print(); }
  }

  const IS: React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', fontFamily:'inherit' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, maxWidth:1000, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#0F172A,#1E3A8A)', borderRadius:18, padding:'28px 32px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
        <div>
          <h2 style={{ color:'white', fontSize:22, fontWeight:900, margin:0 }}>📚 AI Question Bank</h2>
          <p style={{ color:'#93C5FD', fontSize:13, margin:'6px 0 0' }}>
            Generate AP State Board questions using Groq AI — Principal only access
          </p>
        </div>
        {/* Usage badge */}
        <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:12, padding:'12px 18px', minWidth:140, textAlign:'center' }}>
          {usageLoading ? (
            <div style={{ color:'#93C5FD', fontSize:12 }}>Loading…</div>
          ) : (
            <>
              <div style={{ display:'flex', justifyContent:'center', gap:4, marginBottom:6 }}>
                {Array.from({length: WEEKLY_LIMIT}).map((_,i) => (
                  <div key={i} style={{ width:14, height:14, borderRadius:'50%',
                    background: i < used ? '#EF4444' : '#22C55E',
                    border:'2px solid rgba(255,255,255,0.3)' }} />
                ))}
              </div>
              <div style={{ color: limitReached ? '#FCA5A5' : '#86EFAC', fontSize:13, fontWeight:700 }}>
                {limitReached ? '🚫 Limit Reached' : `${remaining} of ${WEEKLY_LIMIT} left`}
              </div>
              <div style={{ color:'rgba(255,255,255,0.4)', fontSize:10, marginTop:2 }}>Resets every Monday</div>
            </>
          )}
        </div>
      </div>

      {/* Form Card */}
      <div style={{ background:'white', border:'1px solid #E8ECF0', borderRadius:16, padding:'24px 28px' }}>
        <h4 style={{ fontSize:14, fontWeight:800, color:'#0F172A', margin:'0 0 20px' }}>Configure Question Paper</h4>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:14, marginBottom:14 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Class *</label>
            <select value={className} onChange={e=>{ setClassName(e.target.value); setSubject(''); }} style={IS}>
              <option value=''>Select…</option>
              {['6','7','8','9','10'].map(c=><option key={c} value={c}>Class {c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Subject *</label>
            <select value={subject} onChange={e=>setSubject(e.target.value)} disabled={!className} style={{...IS, opacity:className?1:0.5}}>
              <option value=''>Select…</option>
              {subjects.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Chapter Name *</label>
            <input value={chapter} onChange={e=>setChapter(e.target.value)} placeholder='e.g. Real Numbers, The French Revolution…' style={IS} />
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:20 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Difficulty</label>
            <div style={{ display:'flex', gap:6 }}>
              {(['easy','medium','hard','mixed'] as const).map(d=>{
                const dc = DIFF_COLORS[d];
                return (
                  <button key={d} onClick={()=>setDifficulty(d)}
                    style={{ flex:1, padding:'7px 4px', borderRadius:8, border:`1px solid ${difficulty===d ? dc.border : '#E2E8F0'}`,
                      background: difficulty===d ? dc.bg : 'white', color: difficulty===d ? dc.text : '#64748B',
                      fontSize:11, fontWeight:700, cursor:'pointer', transition:'all 0.15s' }}>
                    {dc.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Question Type</label>
            <select value={qType} onChange={e=>setQType(e.target.value as any)} style={IS}>
              <option value='mixed'>Mixed (MCQ + Short + Long)</option>
              <option value='mcq'>MCQ Only</option>
              <option value='short'>Short Answer Only</option>
              <option value='long'>Long Answer Only</option>
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Number of Questions</label>
            <select value={count} onChange={e=>setCount(Number(e.target.value))} style={IS}>
              {[5,10,15,20,25,30].map(n=><option key={n} value={n}>{n} Questions</option>)}
            </select>
          </div>
        </div>

        {error && <div style={{ padding:'10px 14px', borderRadius:9, background:'#FEF2F2', border:'1px solid #FEE2E2', color:'#DC2626', fontSize:13, marginBottom:14 }}>{error}</div>}

        {limitReached && (
          <div style={{ padding:'10px 14px', borderRadius:9, background:'#FEF2F2', border:'1px solid #FEE2E2', color:'#DC2626', fontSize:13, marginBottom:14 }}>
            🚫 <strong>Weekly limit reached ({WEEKLY_LIMIT}/{WEEKLY_LIMIT} used).</strong> Your quota resets every Monday.
          </div>
        )}
        <button onClick={generate} disabled={loading || limitReached}
          style={{ padding:'11px 28px', borderRadius:10, border:'none', fontSize:14, fontWeight:700,
            cursor: loading ? 'wait' : limitReached ? 'not-allowed' : 'pointer',
            background: loading || limitReached ? '#E2E8F0' : 'linear-gradient(135deg,#1E3A8A,#3B82F6)',
            color: loading || limitReached ? '#94A3B8' : 'white',
            boxShadow: loading || limitReached ? 'none' : '0 4px 12px rgba(59,130,246,0.3)' }}>
          {loading ? '⏳ Generating with Groq AI…' : limitReached ? '🚫 Limit Reached (Resets Monday)' : `✨ Generate Questions (${remaining} left this week)`}
        </button>
      </div>

      {/* Results */}
      {questions.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Actions bar */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12,
            background:'white', border:'1px solid #E8ECF0', borderRadius:14, padding:'14px 20px' }}>
            <div>
              <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>{questions.length} Questions Generated</span>
              <span style={{ fontSize:13, color:'#94A3B8', marginLeft:10 }}>Class {className} · {subject} · {chapter}</span>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={()=>setShowAnswers(a=>!a)}
                style={{ padding:'8px 16px', borderRadius:9, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>
                {showAnswers ? '🙈 Hide Answers' : '👁️ Show Answers'}
              </button>
              <button onClick={()=>printPaper(false)}
                style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#0F766E,#14B8A6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                🖨️ Print Student Copy
              </button>
              <button onClick={()=>printPaper(true)}
                style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                📋 Print Answer Key
              </button>
            </div>
          </div>

          {/* Question cards */}
          {questions.map((q, i) => (
            <div key={i} style={{ background:'white', border:'1px solid #E8ECF0', borderRadius:14, padding:'18px 22px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <span style={{ fontSize:15, fontWeight:900, color:'#1E3A8A', minWidth:28, marginTop:1 }}>Q{i+1}.</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:99,
                      background: q.type==='mcq'?'#EFF6FF':q.type==='short'?'#F5F3FF':'#FFF7ED',
                      color: q.type==='mcq'?'#1D4ED8':q.type==='short'?'#7C3AED':'#C2410C',
                      border: `1px solid ${q.type==='mcq'?'#BFDBFE':q.type==='short'?'#DDD6FE':'#FED7AA'}` }}>
                      {TYPE_LABEL[q.type]}
                    </span>
                  </div>
                  <p style={{ fontSize:14, fontWeight:600, color:'#0F172A', margin:'0 0 10px', lineHeight:1.6 }}>{q.question}</p>

                  {q.type === 'mcq' && q.options && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                      {(['A','B','C','D'] as const).map(k=>(
                        <div key={k} style={{ padding:'7px 12px', borderRadius:8, background:'#F8FAFC', border:'1px solid #F1F5F9',
                          fontSize:13, color:'#334155', display:'flex', gap:8 }}>
                          <span style={{ fontWeight:700, color:'#1E3A8A' }}>{k})</span> {(q.options as any)[k]}
                        </div>
                      ))}
                    </div>
                  )}

                  {showAnswers && (
                    <div style={{ borderTop:'1px solid #F1F5F9', paddingTop:10, marginTop:4 }}>
                      <div style={{ padding:'8px 12px', borderRadius:8, background:'#F0FDF4', border:'1px solid #BBF7D0', marginBottom:6 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:'#15803D', textTransform:'uppercase', letterSpacing:'0.05em' }}>Answer: </span>
                        <span style={{ fontSize:13, color:'#15803D', fontWeight:600 }}>{q.answer}</span>
                      </div>
                      {q.explanation && (
                        <div style={{ padding:'7px 12px', borderRadius:8, background:'#F8FAFC', border:'1px solid #E2E8F0' }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em' }}>Explanation: </span>
                          <span style={{ fontSize:13, color:'#475569' }}>{q.explanation}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
