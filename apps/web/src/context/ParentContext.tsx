'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ChildInfo {
  student_id: string;
  student_name: string;
  section_id: string;
  class_name: string;
  section_name: string;
}

interface ParentContextType {
  children: ChildInfo[];
  selectedChild: ChildInfo | null;
  setSelectedChild: (child: ChildInfo) => void;
  loading: boolean;
  parentName: string;
}

const ParentContext = createContext<ParentContextType>({
  children: [],
  selectedChild: null,
  setSelectedChild: () => {},
  loading: true,
  parentName: '',
});

export function ParentProvider({ children: reactChildren }: { children: ReactNode }) {
  const supabase = createClient();
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [parentName, setParentName] = useState('');

  const fetchChildren = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Fetch parent name
    const { data: userData } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single();
    if (userData) setParentName(userData.full_name || 'Parent');

    // Fetch ALL linked children (not limit(1))
    const { data: links } = await supabase
      .from('student_parent_links')
      .select('student_id, students(full_name, section_id, sections(name), classes(name))')
      .eq('parent_id', user.id);

    if (!links || links.length === 0) { setLoading(false); return; }

    const childList: ChildInfo[] = links.map((l: any) => ({
      student_id: l.student_id,
      student_name: l.students?.full_name || 'Unknown',
      section_id: l.students?.section_id || '',
      class_name: l.students?.classes?.name || '',
      section_name: l.students?.sections?.name || '',
    }));

    setChildren(childList);
    setSelectedChild(childList[0]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchChildren(); }, [fetchChildren]);

  // Re-fetch when parent returns to the tab (e.g. after promotion updates student's class)
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') fetchChildren(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchChildren]);

  return (
    <ParentContext.Provider value={{ children, selectedChild, setSelectedChild, loading, parentName }}>
      {reactChildren}
    </ParentContext.Provider>
  );
}

export function useParent() {
  return useContext(ParentContext);
}
