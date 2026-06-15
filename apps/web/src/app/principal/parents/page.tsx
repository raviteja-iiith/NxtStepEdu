'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Parent {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  student_name?: string;
}

export default function PrincipalParentsPage() {
  const supabase = createClient();
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchParents = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: currentUser } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!currentUser?.school_id) { setLoading(false); return; }

    // Get parents linked to students of this school
    const { data } = await supabase
      .from('users')
      .select('id, full_name, phone, email, is_active')
      .eq('school_id', currentUser.school_id)
      .eq('role', 'parent')
      .order('full_name');

    if (data) {
      // Get student links
      const parentIds = data.map((p: any) => p.id);
      const { data: links } = await supabase
        .from('student_parent_links')
        .select('parent_id, students(full_name)')
        .in('parent_id', parentIds);

      const linkMap: Record<string, string> = {};
      if (links) {
        links.forEach((l: any) => { linkMap[l.parent_id] = l.students?.full_name || ''; });
      }
      setParents(data.map((p: any) => ({ ...p, student_name: linkMap[p.id] || '' })));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchParents(); }, [fetchParents]);

  const filtered = parents.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || '').includes(search) ||
    (p.student_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Parent Management</h2>
          <p className="text-slate-500 text-sm mt-1">Parents linked to students in your school</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="Search by name, phone or student..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ borderColor: '#E2E8F0' }}
          />
        </div>
        <span className="text-sm text-gray-500">{filtered.length} parent{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        {loading ? (
          <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Parent</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Phone</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Child</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                    <p className="text-3xl mb-2">👨‍👩‍👧</p>
                    <p className="text-sm">No parents found. Parents are added when teachers create parent accounts.</p>
                  </td>
                </tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
                        {p.full_name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{p.full_name}</p>
                        {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.phone || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.student_name || <span className="text-gray-300 italic">Not linked</span>}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: p.is_active ? '#F0FDF4' : '#FEF2F2', color: p.is_active ? '#16A34A' : '#DC2626' }}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
