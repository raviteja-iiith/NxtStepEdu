'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ProfilePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  const [form, setForm] = useState({ full_name: '', phone: '', email: '' });
  const [userId, setUserId] = useState('');
  const [pinForm, setPinForm] = useState({ current: '', newPin: '', confirm: '' });

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const { data } = await supabase.from('users').select('full_name, phone, email').eq('id', user.id).single();
    if (data) setForm({ full_name: data.full_name || '', phone: data.phone || '', email: data.email || '' });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSave = async () => {
    setSaving(true); setSuccess(''); setError('');
    const { error: err } = await supabase.from('users')
      .update({ full_name: form.full_name, email: form.email })
      .eq('id', userId);
    if (err) setError(err.message);
    else setSuccess('Profile updated successfully!');
    setSaving(false);
  };

  const handlePinChange = async () => {
    setPinError(''); setPinSuccess('');
    if (pinForm.newPin.length !== 6) { setPinError('PIN must be exactly 6 digits.'); return; }
    if (!/^\d+$/.test(pinForm.newPin)) { setPinError('PIN must contain only digits.'); return; }
    if (pinForm.newPin !== pinForm.confirm) { setPinError('PINs do not match.'); return; }
    setSavingPin(true);
    // PINs are stored as passwords in Supabase Auth
    const { error: authErr } = await supabase.auth.updateUser({ password: pinForm.newPin });
    if (authErr) { setPinError(authErr.message); setSavingPin(false); return; }
    // Mark is_first_login = false
    await supabase.from('users').update({ is_first_login: false }).eq('id', userId);
    setPinSuccess('PIN updated successfully!');
    setPinForm({ current: '', newPin: '', confirm: '' });
    setSavingPin(false);
  };

  const inputCls = 'w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">Profile & Settings</h2><p className="text-gray-500 text-sm mt-1">Manage your profile and notification preferences</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-bold text-gray-900 mb-4">Personal Information</h3>
          {loading ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div> : (
            <div className="space-y-3">
              <div className="text-center mb-4">
                <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-2xl font-bold mb-2"
                  style={{ background: '#F5F3FF', color: '#7C3AED' }}>
                  {form.full_name.charAt(0) || '👤'}
                </div>
              </div>
              {success && <div className="p-3 rounded-lg text-sm" style={{ background: '#F0FDF4', color: '#16A34A' }}>{success}</div>}
              {error && <div className="p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</div>}
              <div><label className="block text-xs text-gray-500 mb-1">Full Name</label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Phone (Login ID)</label>
                <input value={form.phone} className={inputCls + ' bg-gray-50'} style={{ borderColor: '#E2E8F0' }} disabled /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} placeholder="Optional" /></div>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#7C3AED' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-bold text-gray-900 mb-4">Change PIN</h3>
            {pinSuccess && <div className="mb-3 p-3 rounded-lg text-sm" style={{ background: '#F0FDF4', color: '#16A34A' }}>{pinSuccess}</div>}
            {pinError && <div className="mb-3 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{pinError}</div>}
            <div className="space-y-3">
              <input type="password" placeholder="New 6-digit PIN" maxLength={6}
                value={pinForm.newPin} onChange={e => setPinForm(f => ({ ...f, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className={inputCls} style={{ borderColor: '#E2E8F0' }} />
              <input type="password" placeholder="Confirm New PIN" maxLength={6}
                value={pinForm.confirm} onChange={e => setPinForm(f => ({ ...f, confirm: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className={inputCls} style={{ borderColor: '#E2E8F0' }} />
              <button onClick={handlePinChange} disabled={savingPin}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#7C3AED' }}>
                {savingPin ? 'Updating...' : 'Update PIN'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-bold text-gray-900 mb-2">Account Info</h3>
            <div className="space-y-2 text-sm text-gray-500">
              <p>• Your phone number is your login ID and cannot be changed</p>
              <p>• Contact the school administration to update your phone number</p>
              <p>• Use a 6-digit numeric PIN to log in</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
