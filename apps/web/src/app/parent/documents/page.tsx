'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface DocRequest {
  id: string;
  document_type: string;
  reason: string | null;
  status: string;
  created_at: string;
  download_url: string | null;
  rejection_reason: string | null;
}

const DOC_TYPES = [
  { value: 'bonafide', label: 'Bonafide Certificate', icon: '📋', desc: 'Confirms student enrollment at the school' },
  { value: 'transfer_certificate', label: 'Transfer Certificate', icon: '📄', desc: 'Required for admission to another school' },
  { value: 'character_certificate', label: 'Character Certificate', icon: '📜', desc: 'Certificate of good conduct and character' },
  { value: 'migration_certificate', label: 'Migration Certificate', icon: '🗂️', desc: 'For students migrating to another board' },
  { value: 'provisional_certificate', label: 'Provisional Certificate', icon: '🏅', desc: 'Temporary proof of course completion' },
];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:    { bg: '#FFFBEB', color: '#D97706' },
  processing: { bg: '#EFF6FF', color: '#1D4ED8' },
  ready:      { bg: '#F0FDF4', color: '#16A34A' },
  delivered:  { bg: '#F0FDF4', color: '#16A34A' },
  rejected:   { bg: '#FEF2F2', color: '#DC2626' },
};

export default function DocumentsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [form, setForm] = useState({ document_type: 'bonafide', reason: '' });
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: u } = await supabase.from('users').select('school_id').eq('id', user.id).single();
    if (u?.school_id) setSchoolId(u.school_id);

    const { data: link } = await supabase.from('student_parent_links')
      .select('student_id').eq('parent_id', user.id).limit(1).maybeSingle();
    if (link?.student_id) setStudentId(link.student_id);

    const { data: docs } = await supabase.from('document_requests')
      .select('id, document_type, reason, status, created_at, download_url, rejection_reason')
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false });
    if (docs) setRequests(docs as DocRequest[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    setFormError('');
    if (!studentId) { setFormError('No student linked to your account.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase.from('document_requests').insert({
      school_id: schoolId,
      student_id: studentId,
      requested_by: user.id,
      document_type: form.document_type,
      reason: form.reason || null,
      status: 'pending',
    });

    if (error) { setFormError(error.message); setSaving(false); return; }
    setShowRequest(false);
    setForm({ document_type: 'bonafide', reason: '' });
    setSuccessMsg('Document request submitted! The school will process it within 3-5 working days.');
    fetchData();
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Documents</h2><p className="text-gray-500 text-sm mt-1">Request and track school certificates</p></div>
        <button onClick={() => { setShowRequest(true); setFormError(''); }}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg" style={{ background: '#7C3AED' }}>
          + Request Document
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#F0FDF4', color: '#16A34A' }}>{successMsg}
          <button className="ml-2 underline" onClick={() => setSuccessMsg('')}>Dismiss</button>
        </div>
      )}

      {/* Available document types */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DOC_TYPES.map(d => (
          <div key={d.value} onClick={() => { setForm(f => ({ ...f, document_type: d.value })); setShowRequest(true); setFormError(''); }}
            className="bg-white rounded-2xl border p-6 hover:shadow-lg transition-all cursor-pointer group" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-3xl mb-3">{d.icon}</p>
            <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">{d.label}</h3>
            <p className="text-sm text-gray-500 mt-1">{d.desc}</p>
            <span className="mt-4 inline-block px-4 py-1.5 rounded-xl text-xs font-semibold text-white" style={{ background: '#7C3AED' }}>Request</span>
          </div>
        ))}
      </div>

      {/* Request History */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
          <h3 className="font-bold text-gray-800">My Requests</h3>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">{[1,2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-3xl mb-2">📂</p>
            <p className="text-sm">No document requests yet. Submit your first request above.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Document</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
            </tr></thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 capitalize">{r.document_type.replace(/_/g, ' ')}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize"
                      style={STATUS_STYLE[r.status] || STATUS_STYLE.pending}>{r.status}</span>
                    {r.rejection_reason && <p className="text-xs text-red-500 mt-1">{r.rejection_reason}</p>}
                  </td>
                  <td className="px-6 py-4">
                    {r.download_url ? (
                      <a href={r.download_url} target="_blank" rel="noreferrer"
                        className="text-xs font-semibold text-purple-600 hover:underline">Download</a>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Request Modal */}
      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Request Document</h3>
              <button onClick={() => setShowRequest(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Document Type *</label>
                <select value={form.document_type} onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm" style={{ borderColor: '#E2E8F0' }}>
                  {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Reason / Purpose</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-4 py-2.5 border rounded-xl text-sm resize-none" rows={3}
                  style={{ borderColor: '#E2E8F0' }} placeholder="Why do you need this document?" /></div>
              <div className="p-3 rounded-lg text-xs text-blue-700" style={{ background: '#EFF6FF' }}>
                📋 Processing time: 3–5 working days. You'll see the status update here.
              </div>
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowRequest(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#7C3AED' }}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
