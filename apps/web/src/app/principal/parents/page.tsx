'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

interface Parent { id: string; full_name: string; phone: string | null; email: string | null; is_active: boolean; student_name?: string; }

const IS = { width:'100%',padding:'10px 14px',border:'1px solid #E2E8F0',borderRadius:10,fontSize:13,outline:'none',background:'white',boxSizing:'border-box' as const,fontFamily:'inherit' };
const overlay: React.CSSProperties = { position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)' };

// ── Credentials Download ─────────────────────────────────────────────────────
function downloadCredentials(creds: { name: string; phone: string; pin: string }[]) {
  const ws = XLSX.utils.json_to_sheet(creds.map(c => ({
    'Parent Name': c.name,
    'Phone (Login ID)': c.phone,
    'Generated PIN': c.pin,
    'Note': 'Parent must change PIN on first login',
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Parent Credentials');
  XLSX.writeFile(wb, `Parent_Credentials_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── Bulk Import Modal ────────────────────────────────────────────────────────
function BulkImportModal({ schoolId, onClose, onDone }: { schoolId: string; onClose: () => void; onDone: () => void }) {
  const supabase = createClient();

  // Parsed rows from Sheet 3 (parents) and Sheet 4 (links)
  const [parentRows, setParentRows] = useState<any[]>([]);
  const [linkRows, setLinkRows] = useState<any[]>([]);

  // Student admission_no → id map
  const [studentMap, setStudentMap] = useState<Map<string, string>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const { data } = await supabase.from('students').select('id, admission_number').eq('school_id', schoolId).eq('is_active', true);
      const m = new Map<string, string>();
      (data ?? []).forEach((s: any) => { if (s.admission_number) m.set(String(s.admission_number).trim(), s.id); });
      setStudentMap(m);
      setMapLoaded(true);
    })();
  }, [supabase, schoolId]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setSuccess('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });

        // ── Parse Sheet 3: Parents ──
        const pSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('parent')) ?? wb.SheetNames[2] ?? wb.SheetNames[0];
        const pData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[pSheetName] ?? {});
        const parsedParents = pData.map((row: any, idx: number) => {
          let err = '';
          const name = String(row['Parent Full Name *'] ?? row['Parent Full Name'] ?? '').trim();
          const phone = String(row['Phone Number *\n(10-digit — used as LOGIN ID)'] ?? row['Phone Number *'] ?? row['Phone Number'] ?? '').trim().replace(/\D/g, '');
          const rel = String(row['Relationship *\n(father/mother/guardian/other)'] ?? row['Relationship *'] ?? row['Relationship'] ?? '').trim().toLowerCase();
          const occupation = String(row['Occupation'] ?? '').trim();
          const address = String(row['Address'] ?? '').trim();
          const emergency = String(row['Emergency Contact No.'] ?? row['Emergency Contact'] ?? '').trim();
          const primary = String(row['Is Primary Contact?\n(yes/no)'] ?? row['Is Primary Contact?'] ?? 'yes').trim().toLowerCase();

          if (!name) err = 'Missing Parent Name';
          else if (phone.length !== 10) err = 'Phone must be 10 digits';
          else if (!['father','mother','guardian','other'].includes(rel)) err = `Invalid relationship: '${rel}'`;

          return { rowNum: idx + 2, name, phone, rel, occupation, address, emergency, isPrimary: primary === 'yes', err };
        });
        setParentRows(parsedParents);

        // ── Parse Sheet 4: Links ──
        const lSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('link')) ?? wb.SheetNames[3];
        if (lSheetName && wb.Sheets[lSheetName]) {
          const lData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[lSheetName]);
          const parsedLinks = lData.map((row: any, idx: number) => {
            let err = '';
            const admNo = String(row['Student Admission No *'] ?? row['Student Admission No'] ?? '').trim();
            const phone = String(row['Parent Phone No *\n(must match Sheet 3)'] ?? row['Parent Phone No *'] ?? row['Parent Phone No'] ?? row['Parent Phone'] ?? '').trim().replace(/\D/g, '');
            const rel = String(row['Relationship *\n(father/mother/guardian/other)'] ?? row['Relationship *'] ?? row['Relationship'] ?? '').trim().toLowerCase();
            const primary = String(row['Is Primary Contact?\n(yes/no)'] ?? row['Is Primary Contact?'] ?? 'yes').trim().toLowerCase();

            if (!admNo) err = 'Missing Admission No';
            else if (!studentMap.has(admNo)) err = `Admission No '${admNo}' not found`;
            else if (phone.length !== 10) err = 'Phone must be 10 digits';
            else if (!['father','mother','guardian','other'].includes(rel)) err = `Invalid relationship: '${rel}'`;

            return { rowNum: idx + 2, admNo, phone, rel, isPrimary: primary === 'yes', studentId: studentMap.get(admNo) ?? '', err };
          });
          setLinkRows(parsedLinks);
        }
        setStep('preview');
      } catch { setError('Failed to parse file. Ensure it matches the template.'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    const validParents = parentRows.filter(r => !r.err);
    if (!validParents.length) { setError('No valid parent rows.'); return; }
    setImporting(true); setError(''); setSuccess('');

    const createdCredentials: { name: string; phone: string; pin: string }[] = [];
    // Map phone → newly created parent userId (for link resolution)
    const phoneToParentId = new Map<string, string>();

    // ── Step 1: Create parent accounts ──
    for (const r of validParents) {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      try {
        const res = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `${r.phone}@parent.schoolerp.local`,
            password: pin,
            role: 'parent',
            full_name: r.name,
            phone: r.phone,
            username: r.phone,
            school_id: schoolId,
            profile_data: { occupation: r.occupation || null, address: r.address || null, emergency_contact: r.emergency || null },
          }),
        });
        const result = await res.json();
        if (!res.ok) { setError(prev => prev + `\nRow ${r.rowNum} (${r.name}): ${result.error}`); continue; }
        phoneToParentId.set(r.phone, result.userId);
        createdCredentials.push({ name: r.name, phone: r.phone, pin });
      } catch (err: any) {
        setError(prev => prev + `\nRow ${r.rowNum}: Network error`);
      }
    }

    // ── Step 2: Create student-parent links ──
    const validLinks = linkRows.filter(r => !r.err);
    for (const r of validLinks) {
      // Look up parent by phone — first in newly created, then in existing DB
      let parentId = phoneToParentId.get(r.phone);
      if (!parentId) {
        const { data: existingUser } = await supabase.from('users').select('id').eq('phone', r.phone).eq('school_id', schoolId).eq('role', 'parent').maybeSingle();
        parentId = existingUser?.id;
      }
      if (!parentId) { setError(prev => prev + `\nLink row ${r.rowNum}: Parent with phone ${r.phone} not found`); continue; }
      await supabase.from('student_parent_links').insert({
        student_id: r.studentId,
        parent_id: parentId,
        relationship: r.rel,
        is_primary_contact: r.isPrimary,
      }).select().maybeSingle();
    }

    // ── Step 3: Download credentials ──
    if (createdCredentials.length > 0) {
      downloadCredentials(createdCredentials);
      setSuccess(`✅ ${createdCredentials.length} parent account(s) created. ${validLinks.length} link(s) processed. Credentials downloaded!`);
    } else {
      setError('No accounts were created. Check errors above.');
    }

    setImporting(false);
    setStep('done');
    onDone();
  };

  const validParents = parentRows.filter(r => !r.err).length;
  const validLinks = linkRows.filter(r => !r.err).length;

  return (
    <div style={overlay}>
      <div style={{ width:'100%', maxWidth:820, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', maxHeight:'92vh' }}>
        {/* Header */}
        <div style={{ padding:'22px 28px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>📥 Bulk Import Parents</h3>
            <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Imports Sheet 3 (Parents) + Sheet 4 (Links) from the master template</p>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16 }}>✕</button>
        </div>

        <div style={{ padding:'20px 28px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
          {error && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626', whiteSpace:'pre-line' }}>{error.trim()}</div>}
          {success && <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:9, fontSize:13, color:'#065F46', fontWeight:600 }}>{success}</div>}

          {step === 'upload' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ padding:18, background:'#F8FAFC', borderRadius:12, border:'1px dashed #CBD5E1' }}>
                <p style={{ fontSize:14, fontWeight:700, color:'#0F172A', margin:'0 0 4px' }}>Upload Master Template</p>
                <p style={{ fontSize:12, color:'#64748B', margin:'0 0 12px' }}>
                  Upload the full <strong>Student_Import_Template.xlsx</strong>. The system will automatically read Sheet 3 (Parents) and Sheet 4 (Parent-Student Links).
                  {mapLoaded ? <><br/><span style={{ color:'#059669', fontWeight:600 }}>✓ {studentMap.size} students loaded for link validation</span></> : ' Loading students…'}
                </p>
                <label style={{ display:'inline-block', padding:'8px 18px', background:'linear-gradient(135deg,#7C3AED,#A855F7)', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'white', cursor:'pointer' }}>
                  Select Excel File
                  <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display:'none' }} disabled={!mapLoaded} />
                </label>
              </div>
              <div style={{ padding:'12px 16px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:9, fontSize:12, color:'#92400E' }}>
                💡 After import, a <strong>Parent_Credentials.xlsx</strong> file will be auto-downloaded containing each parent's Phone Number and auto-generated PIN. Share these with parents — they must change their PIN on first login.
              </div>
            </div>
          )}

          {step === 'preview' && (
            <>
              {/* Parents preview */}
              <div>
                <p style={{ fontSize:13, fontWeight:700, color:'#7C3AED', marginBottom:8 }}>
                  👨‍👩‍👧 Parents (Sheet 3) — {validParents} valid, {parentRows.length - validParents} invalid
                </p>
                <div style={{ border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden', overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                    <thead style={{ background:'#F8FAFC' }}>
                      <tr>{['Row','Name','Phone','Relationship','Status'].map(h => <th key={h} style={{ padding:'7px 12px', fontSize:11, fontWeight:700, color:'#64748B', textAlign:'left', borderBottom:'1px solid #E2E8F0' }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {parentRows.map((r, i) => (
                        <tr key={i} style={{ background: r.err ? '#FEF2F2' : i%2===0?'#F8FAFC':'white', borderBottom:'1px solid #F1F5F9' }}>
                          <td style={{ padding:'6px 12px', fontSize:12 }}>{r.rowNum}</td>
                          <td style={{ padding:'6px 12px', fontSize:12, fontWeight:600 }}>{r.name}</td>
                          <td style={{ padding:'6px 12px', fontSize:12, fontFamily:'monospace' }}>{r.phone}</td>
                          <td style={{ padding:'6px 12px', fontSize:12 }}>{r.rel}</td>
                          <td style={{ padding:'6px 12px', fontSize:12 }}>{r.err ? <span style={{ color:'#DC2626', fontWeight:600 }}>{r.err}</span> : <span style={{ color:'#059669', fontWeight:700 }}>✓ Valid</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Links preview */}
              {linkRows.length > 0 && (
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0F766E', marginBottom:8 }}>
                    🔗 Parent-Student Links (Sheet 4) — {validLinks} valid, {linkRows.length - validLinks} invalid
                  </p>
                  <div style={{ border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden', overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
                      <thead style={{ background:'#F8FAFC' }}>
                        <tr>{['Row','Admission No','Parent Phone','Relationship','Primary?','Status'].map(h => <th key={h} style={{ padding:'7px 12px', fontSize:11, fontWeight:700, color:'#64748B', textAlign:'left', borderBottom:'1px solid #E2E8F0' }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {linkRows.map((r, i) => (
                          <tr key={i} style={{ background: r.err ? '#FEF2F2' : i%2===0?'#F8FAFC':'white', borderBottom:'1px solid #F1F5F9' }}>
                            <td style={{ padding:'6px 12px', fontSize:12 }}>{r.rowNum}</td>
                            <td style={{ padding:'6px 12px', fontSize:12, fontFamily:'monospace' }}>{r.admNo}</td>
                            <td style={{ padding:'6px 12px', fontSize:12, fontFamily:'monospace' }}>{r.phone}</td>
                            <td style={{ padding:'6px 12px', fontSize:12 }}>{r.rel}</td>
                            <td style={{ padding:'6px 12px', fontSize:12 }}>{r.isPrimary ? 'Yes' : 'No'}</td>
                            <td style={{ padding:'6px 12px', fontSize:12 }}>{r.err ? <span style={{ color:'#DC2626', fontWeight:600 }}>{r.err}</span> : <span style={{ color:'#059669', fontWeight:700 }}>✓ Valid</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p style={{ fontSize:12, color:'#64748B', margin:0 }}>
                {validParents} parent account(s) will be created · {validLinks} link(s) will be created · Credentials Excel auto-downloads on success
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 28px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Close</button>
          {step === 'preview' && (
            <button
              onClick={handleImport}
              disabled={importing || validParents === 0}
              style={{ flex:2, padding:11, borderRadius:10, border:'none', fontSize:13, fontWeight:700,
                background: importing || validParents === 0 ? '#C4B5FD' : 'linear-gradient(135deg,#7C3AED,#A855F7)',
                color:'white', cursor: importing || validParents === 0 ? 'not-allowed' : 'pointer' }}
            >
              {importing ? 'Creating Accounts…' : `Import ${validParents} Parent(s) + ${validLinks} Link(s) → Download Credentials`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PrincipalParentsPage() {
  const supabase = createClient();
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [schoolId, setSchoolId] = useState('');

  const fetchParents = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: cu } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!cu?.school_id) { setLoading(false); return; }
    setSchoolId(cu.school_id);
    const { data } = await supabase.from('users').select('id, full_name, phone, email, is_active').eq('school_id', cu.school_id).eq('role', 'parent').order('full_name');
    if (data) {
      const ids = data.map((p: any) => p.id);
      const { data: links } = await supabase.from('student_parent_links').select('parent_id, students(full_name)').in('parent_id', ids);
      const map: Record<string,string> = {};
      if (links) links.forEach((l: any) => { map[l.parent_id] = l.students?.full_name || ''; });
      setParents(data.map((p: any) => ({ ...p, student_name: map[p.id] || '' })));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchParents(); }, [fetchParents]);

  const filtered = parents.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone||'').includes(search) ||
    (p.student_name||'').toLowerCase().includes(search.toLowerCase())
  );
  const activeCount = parents.filter(p => p.is_active).length;

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Parent Management</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Parents linked to students in your school</p>
        </div>
        <button
          onClick={() => setShowBulkImport(true)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#7C3AED,#A855F7)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(124,58,237,0.3)', whiteSpace:'nowrap' }}
        >
          <span style={{ fontSize:16 }}>⬇</span> Bulk Import
        </button>
      </div>

      {/* Stat Cards */}
      <div className="three-col-stats">
        {[{ label:'Total Parents', value:parents.length, color:'#7C3AED', bg:'#F5F3FF', border:'#EDE9FE' },
          { label:'Active', value:activeCount, color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7' },
          { label:'Linked to Students', value:parents.filter(p=>p.student_name).length, color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' }
        ].map((s,i) => (
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
            <p style={{ fontSize:28, fontWeight:800, color:'#0F172A', margin:'6px 0 0' }}>
              {loading ? <span style={{ display:'inline-block', width:32, height:28, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position:'relative', maxWidth:400 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" placeholder="Search by name, phone or student..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...IS, paddingLeft:36 }}/>
      </div>

      {/* List */}
      <div className="list-table-container">
        <div className="parent-list-grid header-row" style={{ padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
          {['Parent','Phone (Login)','Child','Status'].map(h => (
            <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{h}</p>
          ))}
        </div>
        {loading ? (
          <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3].map(i => <div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:8 }}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'60px 24px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:24 }}>👨‍👩‍👧</div>
            <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No parents yet</p>
            <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Use <strong>⬇ Bulk Import</strong> to add parents from your Excel template</p>
          </div>
        ) : filtered.map((p, idx) => (
          <div key={p.id} className="parent-list-grid" style={{ padding:'14px 20px', borderBottom:idx<filtered.length-1?'1px solid #F8FAFC':'none', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg, #7C3AED, #A78BFA)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>
                {p.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={{ fontWeight:700, fontSize:13, color:'#0F172A', margin:0 }}>{p.full_name}</p>
              </div>
            </div>
            <p style={{ fontSize:13, color:'#475569', margin:0, fontFamily:'monospace' }}>{p.phone||'—'}</p>
            <p style={{ fontSize:13, color:p.student_name?'#334155':'#CBD5E1', margin:0, fontStyle:p.student_name?'normal':'italic' }}>{p.student_name||'Not linked'}</p>
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, background:p.is_active?'#F0FDF4':'#FEF2F2', color:p.is_active?'#16A34A':'#DC2626', width:'fit-content' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:p.is_active?'#16A34A':'#DC2626' }}/>
              {p.is_active?'Active':'Inactive'}
            </span>
          </div>
        ))}
      </div>

      {showBulkImport && (
        <BulkImportModal
          schoolId={schoolId}
          onClose={() => setShowBulkImport(false)}
          onDone={() => { setShowBulkImport(false); fetchParents(); }}
        />
      )}
    </div>
  );
}
