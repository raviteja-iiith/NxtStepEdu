'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

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

    // Get student's section via parent link
    const { data: link } = await supabase.from('student_parent_links')
      .select('student_id, students(section_id)').eq('parent_id', userId).limit(1).maybeSingle();

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

    const all: CalEvent[] = [];

    // Fetch exams for this section this month
    const sectionId = (link?.students as any)?.section_id;
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
  }, [supabase, month, year]);

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
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">School Calendar</h2><p className="text-gray-500 text-sm mt-1">Exams, holidays, and school events</p></div>
      <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-lg">←</button>
          <h3 className="font-bold text-gray-900">{MONTHS[month]} {year}</h3>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-lg">→</button>
        </div>
        {loading ? <div className="h-64 bg-gray-50 rounded-xl animate-pulse" /> : (
          <div className="grid grid-cols-7 gap-1">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
              <div key={d} className="text-xs font-semibold text-gray-400 text-center py-2">{d}</div>)}
            {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const evs = dayEvents[d] || [];
              const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const firstEv = evs[0];
              return (
                <div key={d} className="aspect-square rounded-lg p-1 flex flex-col items-center justify-center text-sm transition-all hover:shadow-md cursor-default"
                  style={{ background: firstEv ? typeColors[firstEv.type]?.bg || '#F8FAFC' : isToday ? '#EFF6FF' : 'white', border: isToday ? '2px solid #1E40AF' : '1px solid #F1F5F9' }}
                  title={evs.map(e => e.name).join(', ')}>
                  <span className="font-medium" style={{ color: firstEv ? typeColors[firstEv.type]?.color || '#334155' : isToday ? '#1E40AF' : '#334155' }}>{d}</span>
                  {firstEv && <span className="text-[7px] leading-tight text-center mt-0.5 line-clamp-1" style={{ color: typeColors[firstEv.type]?.color }}>{firstEv.name}</span>}
                  {evs.length > 1 && <span className="text-[7px] text-gray-400">+{evs.length - 1}</span>}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-center gap-4 mt-4 pt-4 border-t" style={{ borderColor: '#F1F5F9' }}>
          {[{ type: 'exam', label: 'Exam' }, { type: 'holiday', label: 'Holiday' }, { type: 'event', label: 'Event' }].map(t => (
            <div key={t.type} className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded" style={{ background: typeColors[t.type]?.color }} />{t.label}
            </div>
          ))}
        </div>
      </div>

      {/* Event list for the month */}
      {events.length > 0 && (
        <div className="bg-white rounded-2xl border p-6 space-y-3" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-bold text-gray-800 mb-4">Events in {SHORT_MONTHS[month]} {year}</h3>
          {events.sort((a, b) => a.date.localeCompare(b.date)).map((ev, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl" style={{ background: typeColors[ev.type]?.bg || '#F8FAFC' }}>
              <div className="text-center w-10">
                <p className="text-xs font-bold" style={{ color: typeColors[ev.type]?.color }}>{SHORT_MONTHS[month]}</p>
                <p className="text-lg font-black" style={{ color: typeColors[ev.type]?.color }}>{parseInt(ev.date.split('-')[2])}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{ev.name}</p>
                <p className="text-xs capitalize" style={{ color: typeColors[ev.type]?.color }}>{ev.type}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && events.length === 0 && (
        <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: '#E2E8F0' }}>
          <p className="text-3xl mb-2">📅</p>
          <p className="text-gray-400 text-sm">No events scheduled for {MONTHS[month]}</p>
        </div>
      )}
    </div>
  );
}
