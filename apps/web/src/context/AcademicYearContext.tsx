'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

interface AcademicYearCtx {
  years: AcademicYear[];
  activeYear: AcademicYear | null;   // currently VIEWING
  currentYear: AcademicYear | null;  // school's real current year (is_current = true)
  isViewingPast: boolean;            // true when viewing a non-current year
  setActiveYearId: (id: string) => void;
  reload: () => void;
}

const Ctx = createContext<AcademicYearCtx>({
  years: [], activeYear: null, currentYear: null, isViewingPast: false,
  setActiveYearId: () => {}, reload: () => {},
});

export function AcademicYearProvider({ children, schoolId }: { children: ReactNode; schoolId: string }) {
  const supabase = createClient();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  const load = async () => {
    if (!schoolId) return;
    const { data } = await supabase
      .from('academic_years')
      .select('id, name, start_date, end_date, is_current')
      .eq('school_id', schoolId)
      .order('start_date', { ascending: false });
    if (data) {
      setYears(data);
      // Default to the current year
      const cur = data.find((y: AcademicYear) => y.is_current);
      setActiveId(prev => prev || cur?.id || data[0]?.id || '');
    }
  };

  useEffect(() => { load(); }, [schoolId]);

  const currentYear = years.find(y => y.is_current) ?? null;
  const activeYear  = years.find(y => y.id === activeId) ?? currentYear;
  const isViewingPast = !!activeYear && !!currentYear && activeYear.id !== currentYear.id;

  return (
    <Ctx.Provider value={{ years, activeYear, currentYear, isViewingPast,
      setActiveYearId: setActiveId, reload: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAcademicYear() { return useContext(Ctx); }
