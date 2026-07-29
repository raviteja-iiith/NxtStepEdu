'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParent } from '@/context/ParentContext';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface CalEvent { date: string; name: string; type: 'exam' | 'holiday' | 'event' }

const typeColors: Record<string, { bg: string; color: string }> = {
  exam:    { bg: '#FEF2F2', color: '#DC2626' },
  holiday: { bg: '#F0FDF4', color: '#16A34A' },
  event:   { bg: '#EFF6FF', color: '#1E40AF' },
  ptm:     { bg: '#F5F3FF', color: '#7C3AED' },
};

export default function CalendarPage() {
  const supabase = createClient();
  const { selectedChild, loading: childLoading } = useParent();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }

    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

    const all: CalEvent[] = [];

    // Use the selected child's section_id from context instead of hardcoded limit(1)
    const sectionId = selectedChild?.section_id;
    if (sectionId) {
      const { data: exams } = await supabase.from('exams')
        .select('name, exam_date, subjects(name)')
        .eq('school_id', u.school_id)
        .eq('section_id', sectionId)
        .eq('is_published', true)
        .gte('exam_date', startDate)
        .lte('exam_date', endDate);
      if (exams) exams.forEach((e: any) => all.push({ date: e.exam_date, name: `${(e.subjects as any)?.name || ''} Exam: ${e.name}`, type: 'exam' }));
    }

    // Fetch holidays for this school this month
    const { data: holidays } = await supabase.from('holidays')
      .select('name, date').eq('school_id', u.school_id).gte('date', startDate).lte('date', endDate);
    if (holidays) holidays.forEach((h: any) => all.push({ date: h.date, name: h.name, type: 'holiday' }));

    setEvents(all);
    setLoading(false);
  }, [supabase, month, year, selectedChild]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  // Build day → events map
  const dayEvents: Record<number, CalEvent[]> = {};
  events.forEach(ev => {
    const d = parseInt(ev.date.split('-')[2]);
    if (!dayEvents[d]) dayEvents[d] = [];
    dayEvents[d].push(ev);
  });

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Page Header */}
      <div style={{ paddingBottom: 24, borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>School Calendar</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>Upcoming exams, holidays, and school events</p>
      </div>

      {/* Calendar Card */}
      <div style={{ background: 'white', borderRadius: 20, padding: '28px 32px', border: '1px solid #E8ECF0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button onClick={prevMonth} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 18, color: '#475569' }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>{MONTHS[month]}</h3>
            <p style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500, margin: '2px 0 0' }}>{year}</p>
          </div>
          <button onClick={nextMonth} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 18, color: '#475569' }}>›</button>
        </div>

        {loading
          ? <div style={{ height: 280, background: '#F8FAFC', borderRadius: 12 }} />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d}</div>
              ))}
              {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const evs = dayEvents[d] || [];
                const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                const firstEv = evs[0];
                return (
                  <div key={d} title={evs.map(e => e.name).join(', ')}
                    style={{ aspectRatio: '1', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'default',
                      background: firstEv ? typeColors[firstEv.type]?.bg || '#F8FAFC' : isToday ? '#EFF6FF' : 'white',
                      border: isToday ? '2px solid #1E40AF' : `1px solid ${firstEv ? typeColors[firstEv.type]?.color + '33' : '#F1F5F9'}`,
                      boxShadow: firstEv ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.15s' }}>
                    <span style={{ fontSize: 13, fontWeight: firstEv || isToday ? 800 : 500, color: firstEv ? typeColors[firstEv.type]?.color || '#334155' : isToday ? '#1E40AF' : '#64748B' }}>{d}</span>
                    {firstEv && <span style={{ fontSize: 7, lineHeight: 1.2, textAlign: 'center', marginTop: 2, color: typeColors[firstEv.type]?.color, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstEv.name}</span>}
                    {evs.length > 1 && <span style={{ fontSize: 7, color: '#94A3B8' }}>+{evs.length - 1}</span>}
                  </div>
                );
              })}
            </div>
          )
        }

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 24, paddingTop: 18, borderTop: '1px solid #F1F5F9' }}>
          {[{ type: 'exam', label: 'Exam' }, { type: 'holiday', label: 'Holiday' }, { type: 'event', label: 'Event' }].map(t => (
            <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 10, height: 10, borderRadius: 4, background: typeColors[t.type]?.color }} />
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Event List */}
      {events.length > 0 && (
        <div style={{ background: 'white', borderRadius: 20, padding: '24px 28px', border: '1px solid #E8ECF0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>Events in {SHORT_MONTHS[month]} {year}</h3>
          {events.sort((a, b) => a.date.localeCompare(b.date)).map((ev, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderRadius: 12, background: typeColors[ev.type]?.bg || '#F8FAFC', border: `1px solid ${typeColors[ev.type]?.color}22` }}>
              <div style={{ textAlign: 'center', minWidth: 48, padding: '6px', background: 'white', borderRadius: 10, border: `1px solid ${typeColors[ev.type]?.color}33` }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: typeColors[ev.type]?.color, margin: 0 }}>{SHORT_MONTHS[month]}</p>
                <p style={{ fontSize: 20, fontWeight: 900, color: typeColors[ev.type]?.color, margin: 0, lineHeight: 1 }}>{parseInt(ev.date.split('-')[2])}</p>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>{ev.name}</p>
                <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: typeColors[ev.type]?.color, background: 'white', border: `1px solid ${typeColors[ev.type]?.color}44`, textTransform: 'capitalize' }}>{ev.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && events.length === 0 && (
        <div style={{ background: 'white', borderRadius: 20, padding: '56px 24px', textAlign: 'center', border: '1px solid #E8ECF0' }}>
          <p style={{ fontSize: 36, margin: '0 0 12px' }}>📅</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#475569', margin: '0 0 4px' }}>No events scheduled</p>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No events for {MONTHS[month]} {year}</p>
        </div>
      )}
    </div>
  );
}
