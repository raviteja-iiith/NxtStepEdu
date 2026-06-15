'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PrincipalClassesPage() {
  const supabase = createClient();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
      if (u?.school_id) {
        const { data } = await supabase
          .from('classes')
          .select('*, sections(id, name, class_teacher_id, users!sections_class_teacher_id_fkey(full_name))')
          .eq('school_id', u.school_id)
          .order('numeric_order');
        if (data) setClasses(data);
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Classes & Sections</h2>
          <p className="text-slate-500 text-sm mt-1">Manage classes and their sections</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-4xl mb-3">🏫</p>
          <p className="text-slate-600 font-semibold">No classes configured yet</p>
          <p className="text-sm text-slate-400 mt-1">Classes will appear here once the admin has set them up.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {classes.map((cls: any) => (
            <div key={cls.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">{cls.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{cls.sections?.length || 0} section(s)</p>
                </div>
              </div>
              {cls.sections && cls.sections.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {cls.sections.map((sec: any) => (
                    <div key={sec.id} className="px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">{sec.name}</div>
                        <span className="text-sm text-slate-600">Section {sec.name}</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {sec.users?.full_name ? `Class Teacher: ${sec.users.full_name}` : 'No class teacher assigned'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-3 text-sm text-slate-400 italic">No sections in this class</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
