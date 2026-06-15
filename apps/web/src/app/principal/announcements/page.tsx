'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AnnouncementsPage() {
  const supabase = createClient();
  const [announcements, setAnnouncements] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', target_audience: 'all', is_urgent: false });

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (data) setAnnouncements(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleCreate = async () => {
    if (!form.title || !form.content) return;
    setSaving(true);
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single();
    await supabase.from('announcements').insert({ ...form, school_id: userData?.school_id, created_by: (await supabase.auth.getUser()).data.user?.id });
    setShowAdd(false); setForm({ title: '', content: '', target_audience: 'all', is_urgent: false });
    fetch(); setSaving(false);
  };

  const inputCls = "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Announcements</h2><p className="text-gray-500 text-sm mt-1">Broadcast messages to teachers and parents</p></div>
        <button onClick={() => setShowAdd(true)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg" style={{ background: '#1E40AF' }}>+ New Announcement</button>
      </div>
      <div className="space-y-4">
        {loading ? [1,2,3].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />) :
          announcements.length === 0 ? <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: '#E2E8F0' }}><p className="text-3xl mb-2">📢</p><p className="text-gray-400">No announcements yet</p></div> :
          announcements.map((a, i) => (
            <div key={i} className="bg-white rounded-2xl border p-6 hover:shadow-md transition-all" style={{ borderColor: a.is_urgent ? '#FECACA' : '#E2E8F0' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">{Boolean(a.is_urgent) && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>URGENT</span>}
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ background: '#F1F5F9' }}>{(a.target_audience as string) || 'all'}</span></div>
                  <h3 className="text-lg font-bold text-gray-900">{a.title as string}</h3>
                  <p className="text-sm text-gray-600 mt-1">{a.content as string}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(a.created_at as string).toLocaleDateString('en-IN')}</span>
              </div>
            </div>
          ))}
      </div>
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">New Announcement</h3><button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Content *</label><textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} className={inputCls + ' resize-none'} rows={4} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label><select value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}><option value="all">All</option><option value="teachers">Teachers Only</option><option value="parents">Parents Only</option></select></div>
              <div className="flex items-center gap-2"><input type="checkbox" id="urgent" checked={form.is_urgent} onChange={e => setForm(f => ({ ...f, is_urgent: e.target.checked }))} /><label htmlFor="urgent" className="text-sm font-medium text-gray-700">Mark as Urgent</label></div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1E40AF' }}>{saving ? 'Posting...' : 'Post Announcement'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
