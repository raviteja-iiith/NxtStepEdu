'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PrincipalSettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [schoolId, setSchoolId] = useState('');

  const [school, setSchool] = useState({
    name: '', city: '', state: '', address: '', phone: '', email: '', website: '', logo_url: '',
  });

  const [timing, setTiming] = useState({ start_time: '08:00', end_time: '14:00', working_days: ['Mon','Tue','Wed','Thu','Fri','Sat'] });

  const fetchSchool = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }
    setSchoolId(u.school_id);
    const { data: s } = await supabase.from('schools').select('name, city, state, address, phone, email, website, logo_url, settings').eq('id', u.school_id).single();
    if (s) {
      setSchool({ name: s.name || '', city: s.city || '', state: s.state || '', address: s.address || '', phone: s.phone || '', email: s.email || '', website: s.website || '', logo_url: s.logo_url || '' });
      const settings = (s as any).settings;
      if (settings?.start_time) setTiming(prev => ({ ...prev, start_time: settings.start_time }));
      if (settings?.end_time) setTiming(prev => ({ ...prev, end_time: settings.end_time }));
      if (settings?.working_days) setTiming(prev => ({ ...prev, working_days: settings.working_days }));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSchool(); }, [fetchSchool]);

  const saveSchool = async () => {
    setSaving(true); setSuccess('');
    const { error } = await supabase.from('schools').update({
      name: school.name, city: school.city, state: school.state,
      address: school.address, phone: school.phone, email: school.email,
      website: school.website, logo_url: school.logo_url,
    }).eq('id', schoolId);
    if (!error) setSuccess('School information saved!');
    setSaving(false);
  };

  const saveTiming = async () => {
    setSaving(true); setSuccess('');
    // Store timing in school settings JSON column
    const { error } = await supabase.from('schools').update({
      settings: { start_time: timing.start_time, end_time: timing.end_time, working_days: timing.working_days },
    }).eq('id', schoolId);
    if (!error) setSuccess('School timing saved!');
    setSaving(false);
  };

  const toggleDay = (day: string) => {
    setTiming(prev => ({
      ...prev,
      working_days: prev.working_days.includes(day) ? prev.working_days.filter(d => d !== day) : [...prev.working_days, day],
    }));
  };

  const inputCls = 'w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">School Settings</h2><p className="text-gray-500 text-sm mt-1">Configure your school's information and preferences</p></div>

      {success && <div className="p-4 rounded-xl text-sm" style={{ background: '#F0FDF4', color: '#16A34A' }}>{success} <button className="ml-2 underline" onClick={() => setSuccess('')}>Dismiss</button></div>}

      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* School Info */}
          <div className="lg:col-span-2 bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-bold text-gray-900 mb-4">School Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">School Name *</label>
                <input value={school.name} onChange={e => setSchool(s => ({ ...s, name: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input value={school.city} onChange={e => setSchool(s => ({ ...s, city: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input value={school.state} onChange={e => setSchool(s => ({ ...s, state: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input value={school.phone} onChange={e => setSchool(s => ({ ...s, phone: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input value={school.email} onChange={e => setSchool(s => ({ ...s, email: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input value={school.website} onChange={e => setSchool(s => ({ ...s, website: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} placeholder="https://" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                <input value={school.logo_url} onChange={e => setSchool(s => ({ ...s, logo_url: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} placeholder="https://..." /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea value={school.address} onChange={e => setSchool(s => ({ ...s, address: e.target.value }))} className={inputCls + ' resize-none'} rows={2} style={{ borderColor: '#E2E8F0' }} /></div>
            </div>
            <button onClick={saveSchool} disabled={saving} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1E40AF' }}>
              {saving ? 'Saving...' : 'Save School Info'}
            </button>
          </div>

          {/* Timing */}
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-bold text-gray-900 mb-4">School Timing</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input type="time" value={timing.start_time} onChange={e => setTiming(t => ({ ...t, start_time: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input type="time" value={timing.end_time} onChange={e => setTiming(t => ({ ...t, end_time: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Working Days</label>
                <div className="flex gap-2 flex-wrap">
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                    <button key={d} onClick={() => toggleDay(d)} className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                      style={{ background: timing.working_days.includes(d) ? '#1E40AF' : '#F1F5F9', color: timing.working_days.includes(d) ? 'white' : '#64748B' }}>{d}</button>
                  ))}
                </div>
              </div>
              <button onClick={saveTiming} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1E40AF' }}>
                {saving ? 'Saving...' : 'Save Timing'}
              </button>
            </div>
          </div>

          {/* Principal Profile */}
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-bold text-gray-900 mb-4">About This Page</h3>
            <div className="space-y-2 text-sm text-gray-500">
              <p>• School name and info are visible on the login page</p>
              <p>• Timing settings guide the timetable configuration</p>
              <p>• Logo URL should be a publicly accessible image link</p>
              <p>• Contact admin for board affiliation or code changes</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
