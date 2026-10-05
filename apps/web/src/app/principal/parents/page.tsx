'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

interface Parent { id: string; full_name: string; phone: string | null; email: string | null; is_active: boolean; student_name?: string; login_pin?: string | null; }
interface ClassItem { id: string; name: string; }
interface SectionItem { id: string; name: string; class_id: string; }

const IS = { width:'100%',padding:'10px 14px',border:'1px solid #E2E8F0',borderRadius:10,fontSize:13,outline:'none',background:'white',boxSizing:'border-box' as const,fontFamily:'inherit' };
const overlay: React.CSSProperties = { position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)' };

// ── Searchable Student Picker ────────────────────────────────────────────────
interface StudentOption { id: string; full_name: string; section_name: string; class_name: string; }

function StudentSearchPicker({ students, value, onChange, placeholder }: {
  students: StudentOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync display text when value changes externally (e.g. reset)
  const selected = students.find(s => s.id === value);
  const displayText = selected ? `${selected.full_name} (${selected.class_name} – ${selected.section_name})` : '';

  useEffect(() => {
    if (!value) setQuery('');
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.toLowerCase();
  const filtered = q.length === 0 ? students.slice(0, 8) : students.filter(s =>
    s.full_name.toLowerCase().includes(q) ||
    s.class_name.toLowerCase().includes(q) ||
    s.section_name.toLowerCase().includes(q)
  ).slice(0, 8);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={open ? query : (value ? displayText : query)}
          onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || 'Type to search student...'}
          style={{ ...IS, background: '#F8FAFC', paddingLeft: 36 }}
        />
        {value && (
          <button onClick={() => { onChange(''); setQuery(''); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 14, padding: 2 }} title="Clear">
            ✕
          </button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'white', border: '1px solid #E2E8F0', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)', maxHeight: 260, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '16px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              {q ? `No students matching "${q}"` : 'No students available'}
            </div>
          ) : filtered.map(s => (
            <button
              key={s.id}
              onClick={() => { onChange(s.id); setQuery(''); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', border: 'none', borderBottom: '1px solid #F8FAFC',
                background: s.id === value ? '#EFF6FF' : 'white',
                cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (s.id !== value) e.currentTarget.style.background = '#F8FAFC'; }}
              onMouseLeave={e => { if (s.id !== value) e.currentTarget.style.background = 'white'; }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: s.id === value ? 'linear-gradient(135deg,#3B82F6,#1D4ED8)' : '#F1F5F9',
                color: s.id === value ? 'white' : '#64748B',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800,
              }}>
                {s.full_name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B' }}>{s.class_name} – {s.section_name}</p>
              </div>
              {s.id === value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </button>
          ))}
          {q.length === 0 && students.length > 8 && (
            <p style={{ padding: '8px 14px', margin: 0, fontSize: 11, color: '#94A3B8', textAlign: 'center', borderTop: '1px solid #F1F5F9' }}>Type to search {students.length} students…</p>
          )}
        </div>
      )}
    </div>
  );
}

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

  // Parsed rows from parents sheet and links sheet
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

  const handleDownloadParentTemplate = () => {
    // Sheet 1: Parents
    const pHeader = [['Parent Full Name', 'Phone Number (10-digit)', 'Relationship (father/mother/guardian/other)']];
    const pSample = [['Ramakrishna Rao', '9876543210', 'father'], ['Lakshmi Devi', '9123456789', 'mother']];
    const pWs = XLSX.utils.aoa_to_sheet([...pHeader, ...pSample]);
    pWs['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 40 }];
    // Sheet 2: Links
    const lHeader = [['Student Admission No', 'Parent Phone No']];
    const lSample = [['STU-2025-0001', '9876543210'], ['STU-2025-0002', '9123456789']];
    const lWs = XLSX.utils.aoa_to_sheet([...lHeader, ...lSample]);
    lWs['!cols'] = [{ wch: 22 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, pWs, 'Parents');
    XLSX.utils.book_append_sheet(wb, lWs, 'Parent-Student Links');
    XLSX.writeFile(wb, 'Parent_Import_Template.xlsx');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setSuccess('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });

        // ── Parse Sheet 1: Parents ──
        const pSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('parent')) ?? wb.SheetNames[0];
        const pData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[pSheetName] ?? {});
        const parsedParents = pData.map((row: any, idx: number) => {
          let err = '';
          const getVal = (keywords: string[]) => {
            const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
            return key ? row[key] : undefined;
          };
          const name = String(getVal(['parent full name', 'parent name', 'full name', 'name']) ?? '').trim();
          const phone = String(getVal(['phone number', 'phone', 'mobile']) ?? '').trim().replace(/\D/g, '');
          const rel = String(getVal(['relationship', 'relation']) ?? '').trim().toLowerCase();

          if (!name) err = 'Missing Parent Name';
          else if (phone.length !== 10) err = 'Phone must be 10 digits';
          else if (!['father','mother','guardian','other'].includes(rel)) err = `Invalid relationship: '${rel}'`;

          return { rowNum: idx + 2, name, phone, rel, err };
        });
        setParentRows(parsedParents);

        // ── Parse Sheet 2: Links ──
        const lSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('link')) ?? wb.SheetNames[1];
        if (lSheetName && wb.Sheets[lSheetName]) {
          const lData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[lSheetName]);
          const parsedLinks = lData.map((row: any, idx: number) => {
            let err = '';
            const getVal = (keywords: string[]) => {
              const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
              return key ? row[key] : undefined;
            };
            const admNo = String(getVal(['admission no', 'student admission', 'admission']) ?? '').trim();
            const phone = String(getVal(['parent phone', 'phone']) ?? '').trim().replace(/\D/g, '');

            if (!admNo) err = 'Missing Admission No';
            else if (!studentMap.has(admNo)) err = `Admission No '${admNo}' not found`;
            else if (phone.length !== 10) err = 'Phone must be 10 digits';

            return { rowNum: idx + 2, admNo, phone, studentId: studentMap.get(admNo) ?? '', err };
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
            profile_data: {},
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
      // Find the relationship from the parent row with matching phone
      const matchedParent = parentRows.find(p => p.phone === r.phone);
      const rel = matchedParent?.rel || 'guardian';
      await supabase.from('student_parent_links').insert({
        student_id: r.studentId,
        parent_id: parentId,
        relationship: rel,
        is_primary_contact: true,
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
            <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Import parents (Sheet 1) and link them to students (Sheet 2)</p>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16 }}>✕</button>
        </div>

        <div style={{ padding:'20px 28px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
          {error && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626', whiteSpace:'pre-line' }}>{error.trim()}</div>}
          {success && <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:9, fontSize:13, color:'#065F46', fontWeight:600 }}>{success}</div>}

          {step === 'upload' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'flex', gap:14 }}>
                <div style={{ flex:1, padding:18, background:'#F8FAFC', borderRadius:12, border:'1px dashed #CBD5E1' }}>
                  <p style={{ fontSize:14, fontWeight:700, color:'#0F172A', margin:'0 0 4px' }}>1. Download Template</p>
                  <p style={{ fontSize:12, color:'#64748B', margin:'0 0 12px' }}>3 columns for parents + 2 columns for student links.</p>
                  <button onClick={handleDownloadParentTemplate} style={{ padding:'8px 18px', background:'white', border:'1px solid #CBD5E1', borderRadius:8, fontSize:13, fontWeight:600, color:'#334155', cursor:'pointer' }}>Download .xlsx</button>
                </div>
                <div style={{ flex:1, padding:18, background:'#F5F3FF', borderRadius:12, border:'1px dashed #C4B5FD' }}>
                  <p style={{ fontSize:14, fontWeight:700, color:'#7C3AED', margin:'0 0 4px' }}>2. Upload Filled Template</p>
                  <p style={{ fontSize:12, color:'#8B5CF6', margin:'0 0 12px' }}>
                    {mapLoaded ? <><span style={{ color:'#059669', fontWeight:600 }}>✓ {studentMap.size} students loaded</span> for link validation</> : 'Loading students…'}
                  </p>
                  <label style={{ display:'inline-block', padding:'8px 18px', background:'linear-gradient(135deg,#7C3AED,#A855F7)', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'white', cursor:'pointer' }}>
                    Select Excel File
                    <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display:'none' }} disabled={!mapLoaded} />
                  </label>
                </div>
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
                    🔗 Parent-Student Links (Sheet 2) — {validLinks} valid, {linkRows.length - validLinks} invalid
                  </p>
                  <div style={{ border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden', overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:400 }}>
                      <thead style={{ background:'#F8FAFC' }}>
                        <tr>{['Row','Admission No','Parent Phone','Status'].map(h => <th key={h} style={{ padding:'7px 12px', fontSize:11, fontWeight:700, color:'#64748B', textAlign:'left', borderBottom:'1px solid #E2E8F0' }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {linkRows.map((r, i) => (
                          <tr key={i} style={{ background: r.err ? '#FEF2F2' : i%2===0?'#F8FAFC':'white', borderBottom:'1px solid #F1F5F9' }}>
                            <td style={{ padding:'6px 12px', fontSize:12 }}>{r.rowNum}</td>
                            <td style={{ padding:'6px 12px', fontSize:12, fontFamily:'monospace' }}>{r.admNo}</td>
                            <td style={{ padding:'6px 12px', fontSize:12, fontFamily:'monospace' }}>{r.phone}</td>
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

// ── Export all parent credentials to Excel ───────────────────────────────────
async function exportAllCredentials() {
  const res = await fetch('/api/auth/parent-credentials');
  if (!res.ok) { alert('Failed to load credentials'); return; }
  const { parents } = await res.json();
  if (!parents?.length) { alert('No parent accounts found'); return; }
  const ws = XLSX.utils.json_to_sheet(parents.map((p: any) => ({
    'Parent Name': p.full_name,
    'Phone (Login ID)': p.phone ?? '—',
    'Current PIN': p.login_pin ?? '—',
    'Child(ren)': p.student_names,
    'Status': p.is_active ? 'Active' : 'Inactive',
    'Created On': new Date(p.created_at).toLocaleDateString('en-IN'),
  })));
  ws['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Parent Credentials');
  XLSX.writeFile(wb, `Parent_Credentials_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PrincipalParentsPage() {
  const supabase = createClient();
  const [parents, setParents] = useState<Parent[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [exportingCreds, setExportingCreds] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  // parentId → Set<classId> and parentId → Set<sectionId> (from student links)
  const [parentClassMap, setParentClassMap] = useState<Map<string, Set<string>>>(new Map());
  const [parentSectionMap, setParentSectionMap] = useState<Map<string, Set<string>>>(new Map());

  // ── Add Single Parent state ────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [allStudents, setAllStudents] = useState<{ id: string; full_name: string; section_name: string; class_name: string }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [addForm, setAddForm] = useState({ full_name: '', phone: '', relationship: 'guardian' });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [showCreds, setShowCreds] = useState<{ phone: string; pin: string; name: string } | null>(null);
  const [existingParent, setExistingParent] = useState<{ id: string; full_name: string } | null>(null);
  const [phoneLooking, setPhoneLooking] = useState(false);
  // ── Link existing parent to another student ────────────────────────────────
  const [showLinkModal, setShowLinkModal] = useState<{ parentId: string; parentName: string } | null>(null);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkRelationship, setLinkRelationship] = useState('guardian');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  // ── Reset PIN ─────────────────────────────────────────────────────────────
  const [resettingPinFor, setResettingPinFor] = useState<string | null>(null);
  const [showNewPin, setShowNewPin] = useState<{ name: string; phone: string; pin: string } | null>(null);

  const fetchParents = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: cu } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!cu?.school_id) { setLoading(false); return; }
    setSchoolId(cu.school_id);

    // Load classes and sections
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', cu.school_id).maybeSingle();
    const [{ data: cls }, { data: sec }] = await Promise.all([
      yr?.id ? supabase.from('classes').select('id,name').eq('academic_year_id', yr.id).order('numeric_order') : supabase.from('classes').select('id,name').eq('school_id', cu.school_id).order('numeric_order'),
      yr?.id ? supabase.from('sections').select('id,name,class_id').eq('academic_year_id', yr.id) : supabase.from('sections').select('id,name,class_id').eq('school_id', cu.school_id),
    ]);
    if (cls) setClasses(cls);
    if (sec) setSections(sec);

    // Load parents
    const { data } = await supabase.from('users').select('id, full_name, phone, email, is_active, login_pin').eq('school_id', cu.school_id).eq('role', 'parent').order('full_name');
    if (data) {
      const ids = data.map((p: any) => p.id);
      // Fetch student-parent links with student class/section data
      const { data: links } = await supabase
        .from('student_parent_links')
        .select('parent_id, students(full_name, class_id, section_id)')
        .in('parent_id', ids);
      const nameMap: Record<string, string> = {};
      const classMap = new Map<string, Set<string>>();
      const sectionMap = new Map<string, Set<string>>();
      if (links) {
        links.forEach((l: any) => {
          const pid = l.parent_id;
          const st = l.students;
          if (!nameMap[pid] && st?.full_name) nameMap[pid] = st.full_name;
          if (st?.class_id) {
            if (!classMap.has(pid)) classMap.set(pid, new Set());
            classMap.get(pid)!.add(st.class_id);
          }
          if (st?.section_id) {
            if (!sectionMap.has(pid)) sectionMap.set(pid, new Set());
            sectionMap.get(pid)!.add(st.section_id);
          }
        });
      }
      setParentClassMap(classMap);
      setParentSectionMap(sectionMap);
      setParents(data.map((p: any) => ({ ...p, student_name: nameMap[p.id] || '' })));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchParents(); }, [fetchParents]);

  // Load all students for add/link dropdowns when schoolId is ready
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const { data } = await supabase.from('students')
        .select('id, full_name, sections(name, classes(name))')
        .eq('school_id', schoolId).eq('is_active', true).order('full_name');
      if (data) setAllStudents(data.map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        section_name: (s.sections as any)?.name || '',
        class_name: (s.sections as any)?.classes?.name || '',
      })));
    })();
  }, [supabase, schoolId]);

  // ── Auto-detect existing parent when phone reaches 10 digits ────────────────
  useEffect(() => {
    if (addForm.phone.length !== 10 || !schoolId) { setExistingParent(null); return; }
    let cancelled = false;
    (async () => {
      setPhoneLooking(true);
      const { data } = await supabase.from('users')
        .select('id, full_name')
        .eq('phone', addForm.phone).eq('school_id', schoolId).eq('role', 'parent')
        .maybeSingle();
      if (!cancelled) {
        if (data) {
          setExistingParent({ id: data.id, full_name: data.full_name });
          setAddForm(f => ({ ...f, full_name: data.full_name }));
        } else {
          setExistingParent(null);
        }
        setPhoneLooking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [addForm.phone, schoolId, supabase]);

  // ── Add parent handler (smart: creates new OR links existing) ───────────
  const handleAddParent = async () => {
    if (!addForm.phone || !selectedStudentId) { setAddError('Phone and student are required'); return; }
    if (addForm.phone.length !== 10) { setAddError('Phone must be 10 digits'); return; }
    if (!existingParent && !addForm.full_name) { setAddError('Parent name is required'); return; }
    setAddSaving(true); setAddError('');

    const userId = (await supabase.auth.getUser()).data.user?.id || '';

    try {
      let parentId = existingParent?.id || '';
      let pin = '';

      // Only create a new account if no existing parent was detected
      if (!existingParent) {
        pin = String(Math.floor(100000 + Math.random() * 900000));
        const res = await fetch('/api/auth/create-user', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${addForm.phone}@parent.schoolerp.local`, password: pin, role: 'parent', full_name: addForm.full_name, phone: addForm.phone, username: addForm.phone, school_id: schoolId }),
        });
        const result = await res.json();
        if (!res.ok) { setAddError(result.error || 'Failed to create parent account'); setAddSaving(false); return; }
        parentId = result.userId;
        if (!parentId) { setAddError('Parent created but no userId returned.'); setAddSaving(false); return; }
      }

      // Create the student-parent link
      const { error: linkErr } = await supabase.from('student_parent_links').insert({
        parent_id: parentId, student_id: selectedStudentId, relationship: addForm.relationship || 'guardian', is_primary_contact: true, created_by: userId,
      });

      if (linkErr) {
        setAddError(`${existingParent ? 'Linking' : 'Parent created but linking'} failed: ${linkErr.message}`);
        setAddSaving(false); fetchParents(); return;
      }

      setShowAddModal(false);
      // Only show credentials for NEW accounts
      if (!existingParent) {
        setShowCreds({ phone: addForm.phone, pin, name: addForm.full_name });
      }
      setAddForm({ full_name: '', phone: '', relationship: 'guardian' }); setSelectedStudentId(''); setExistingParent(null);
      fetchParents();
    } catch (err: any) { setAddError(`Network error: ${err?.message || 'Please try again.'}`); }
    setAddSaving(false);
  };

  // ── Link existing parent to another student handler ────────────────────
  const handleLinkExisting = async () => {
    if (!showLinkModal || !linkStudentId) { setLinkError('Please select a student'); return; }
    setLinking(true); setLinkError('');
    const userId = (await supabase.auth.getUser()).data.user?.id || '';
    const { error } = await supabase.from('student_parent_links').insert({
      parent_id: showLinkModal.parentId, student_id: linkStudentId, relationship: linkRelationship || 'guardian', is_primary_contact: true, created_by: userId,
    });
    if (error) { setLinkError(error.message); setLinking(false); return; }
    setShowLinkModal(null); setLinkStudentId(''); setLinkRelationship('guardian');
    fetchParents(); setLinking(false);
  };

  // ── Reset parent PIN handler ───────────────────────────────────────────────
  const handleResetPin = async (parentId: string, parentName: string) => {
    if (!confirm(`Reset login PIN for ${parentName}? A new 6-digit PIN will be generated and shown to you.`)) return;
    setResettingPinFor(parentId);
    try {
      const res = await fetch('/api/auth/reset-parent-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parentId }),
      });
      const result = await res.json();
      if (!res.ok) { alert(`Failed: ${result.error}`); return; }
      // Update the PIN in the local parents list immediately so the table re-renders
      setParents(prev => prev.map(p => p.id === parentId ? { ...p, login_pin: result.new_pin } : p));
      setShowNewPin({ name: result.parent_name, phone: result.phone, pin: result.new_pin });
    } catch (err: any) {
      alert(`Network error: ${err?.message || 'Please try again'}`);
    } finally {
      setResettingPinFor(null);
    }
  };

  const filtSections = sections.filter(s => s.class_id === filterClass);

  const filtered = parents.filter(p => {
    // Text search
    const matchSearch = p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone||'').includes(search) ||
      (p.student_name||'').toLowerCase().includes(search.toLowerCase());
    // Class filter
    const matchClass = !filterClass || (parentClassMap.get(p.id)?.has(filterClass) ?? false);
    // Section filter
    const matchSection = !filterSection || (parentSectionMap.get(p.id)?.has(filterSection) ?? false);
    return matchSearch && matchClass && matchSection;
  });
  const activeCount = parents.filter(p => p.is_active).length;

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Parent Management</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Parents linked to students in your school</p>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button
            onClick={() => { setShowAddModal(true); setAddError(''); setExistingParent(null); setAddForm({ full_name: '', phone: '', relationship: 'guardian' }); setSelectedStudentId(''); }}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.25)', whiteSpace:'nowrap' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Parent
          </button>
          <button
            onClick={() => setShowBulkImport(true)}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#7C3AED,#A855F7)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(124,58,237,0.3)', whiteSpace:'nowrap' }}
          >
            <span style={{ fontSize:16 }}>⬇</span> Bulk Import
          </button>
          <button
            onClick={async () => { setExportingCreds(true); await exportAllCredentials(); setExportingCreds(false); }}
            disabled={exportingCreds}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background: exportingCreds ? '#FDE68A' : 'linear-gradient(135deg,#D97706,#F59E0B)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor: exportingCreds ? 'wait' : 'pointer', boxShadow:'0 4px 12px rgba(217,119,6,0.3)', whiteSpace:'nowrap' }}
          >
            <span style={{ fontSize:15 }}>{exportingCreds ? '⏳' : '📥'}</span> {exportingCreds ? 'Exporting…' : 'Export Credentials'}
          </button>
        </div>
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

      {/* Search + Class/Section filter bar */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search by name, phone or student..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...IS, paddingLeft:36 }}/>
        </div>
        <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setFilterSection(''); }} style={{ ...IS, width:'auto', minWidth:130 }}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {filterClass && (
          <select value={filterSection} onChange={e => setFilterSection(e.target.value)} style={{ ...IS, width:'auto', minWidth:120 }}>
            <option value="">All Sections</option>
            {filtSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {(filterClass || filterSection) && (
          <button onClick={() => { setFilterClass(''); setFilterSection(''); }} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer' }}>✕ Clear</button>
        )}
      </div>

      {/* List */}
      <div className="list-table-container">
        <div className="parent-list-grid header-row" style={{ padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9', gridTemplateColumns:'2fr 1.2fr 1.5fr 1fr 1.6fr' }}>
          {['Parent','Phone (Login)','Child','PIN','Status / Actions'].map(h => (
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
          <div key={p.id} className="parent-list-grid" style={{ padding:'14px 20px', borderBottom:idx<filtered.length-1?'1px solid #F8FAFC':'none', alignItems:'center', gridTemplateColumns:'2fr 1.2fr 1.5fr 1fr 1.6fr' }}>
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
            {/* PIN column */}
            <div>
              {p.login_pin ? (
                <span style={{ fontFamily:'monospace', fontSize:14, fontWeight:800, color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'3px 10px', display:'inline-block', letterSpacing:2 }}>
                  {p.login_pin}
                </span>
              ) : (
                <span style={{ fontSize:12, color:'#CBD5E1', fontStyle:'italic' }}>—</span>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, background:p.is_active?'#F0FDF4':'#FEF2F2', color:p.is_active?'#16A34A':'#DC2626', width:'fit-content' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:p.is_active?'#16A34A':'#DC2626' }}/>
                {p.is_active?'Active':'Inactive'}
              </span>
              <button onClick={() => { setShowLinkModal({ parentId: p.id, parentName: p.full_name }); setLinkError(''); setLinkStudentId(''); }}
                title="Link to another student"
                style={{ padding:'4px 10px', borderRadius:8, background:'#EFF6FF', border:'1px solid #BFDBFE', color:'#1D4ED8', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                🔗 Link
              </button>
              <button
                onClick={() => handleResetPin(p.id, p.full_name)}
                disabled={resettingPinFor === p.id}
                title="Reset login PIN"
                style={{ padding:'4px 10px', borderRadius:8, background: resettingPinFor === p.id ? '#FEF9C3' : '#FFFBEB', border:'1px solid #FDE68A', color:'#92400E', fontSize:11, fontWeight:700, cursor: resettingPinFor === p.id ? 'wait' : 'pointer', whiteSpace:'nowrap' }}>
                {resettingPinFor === p.id ? '⏳…' : '🔑 PIN'}
              </button>
            </div>
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

      {/* ── New PIN Reveal Modal ─────────────────────────────────────────────── */}
      {showNewPin && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:400, background:'white', borderRadius:20, boxShadow:'0 25px 60px rgba(0,0,0,0.25)', overflow:'hidden', textAlign:'center', position:'relative' }}>
            <div style={{ position:'absolute', top:0, left:0, width:'100%', height:6, background:'linear-gradient(to right,#F59E0B,#FBBF24)' }} />
            <div style={{ padding:36 }}>
              <div style={{ width:72, height:72, margin:'0 auto 20px', background:'#FFFBEB', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #FDE68A', fontSize:34 }}>🔑</div>
              <h3 style={{ margin:'0 0 6px', fontSize:20, fontWeight:800, color:'#0F172A' }}>PIN Reset Successful</h3>
              <p style={{ margin:'0 0 24px', fontSize:14, color:'#475569' }}>Share these credentials with <strong>{showNewPin.name}</strong></p>
              <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:14, padding:20, textAlign:'left', marginBottom:24 }}>
                <div style={{ marginBottom:16 }}>
                  <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.06em' }}>Login Phone</p>
                  <p style={{ margin:0, fontFamily:'monospace', fontSize:18, fontWeight:800, color:'#0F172A' }}>{showNewPin.phone}</p>
                </div>
                <div>
                  <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.06em' }}>New PIN</p>
                  <p style={{ margin:0, fontFamily:'monospace', fontSize:32, fontWeight:800, color:'#B45309', letterSpacing:8 }}>{showNewPin.pin}</p>
                </div>
              </div>
              <p style={{ margin:'0 0 24px', fontSize:12, color:'#64748B' }}>The parent can use this PIN to log in immediately. They can change it from their profile settings.</p>
              <button
                onClick={() => setShowNewPin(null)}
                style={{ width:'100%', padding:13, borderRadius:10, fontSize:14, fontWeight:700, color:'white', background:'linear-gradient(135deg,#F59E0B,#D97706)', border:'none', cursor:'pointer', boxShadow:'0 4px 12px rgba(245,158,11,0.3)' }}
              >Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Single Parent Modal ─────────────────────────────────────────── */}
      {showAddModal && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:440, background:'white', borderRadius:20, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', overflow:'hidden' }}>
             <div style={{ padding:'20px 24px', borderBottom:'1px solid #E2E8F0', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h3 style={{ margin:0, fontSize:18, fontWeight:800, color:'#0F172A' }}>{existingParent ? '🔗 Link Parent to Student' : 'Add Parent Account'}</h3>
                <p style={{ margin:'4px 0 0', fontSize:12, color:'#64748B' }}>{existingParent ? 'This parent already exists — just linking' : 'Create and link a new parent'}</p>
              </div>
              <button onClick={() => setShowAddModal(false)} style={{ width:32, height:32, borderRadius:'50%', background:'white', border:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8', cursor:'pointer', fontSize:14 }}>✕</button>
            </div>
            <div style={{ padding:24 }}>
              {addError && <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:10, background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', fontSize:13, fontWeight:600 }}>{addError}</div>}
              {existingParent && (
                <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:12, background:'#F0FDF4', border:'1px solid #BBF7D0', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#16A34A,#4ADE80)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:14, fontWeight:800, flexShrink:0 }}>{existingParent.full_name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#065F46' }}>✅ Parent <strong>{existingParent.full_name}</strong> already exists</p>
                    <p style={{ margin:'2px 0 0', fontSize:11, color:'#16A34A' }}>No new account needed — will only create a link to the selected student</p>
                  </div>
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#334155', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Search & Select Student *</label>
                  <StudentSearchPicker students={allStudents} value={selectedStudentId} onChange={setSelectedStudentId} placeholder="Type student name, class, or section…" />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#334155', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Parent Full Name {existingParent ? '' : '*'}</label>
                  <input
                    value={addForm.full_name}
                    onChange={e => { if (!existingParent) setAddForm(f => ({ ...f, full_name: e.target.value })); }}
                    placeholder={existingParent ? '' : 'e.g. Ramesh Sharma'}
                    readOnly={!!existingParent}
                    style={{ ...IS, background: existingParent ? '#F1F5F9' : '#F8FAFC', color: existingParent ? '#64748B' : '#0F172A', cursor: existingParent ? 'not-allowed' : 'text' }}
                  />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div>
                    <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#334155', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Mobile Number *</label>
                    <div style={{ position:'relative' }}>
                      <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} maxLength={10} placeholder="10 digits" style={{ ...IS, background:'#F8FAFC', fontFamily:'monospace' }} />
                      {phoneLooking && <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'#94A3B8' }}>Checking…</span>}
                    </div>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#334155', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Relationship *</label>
                    <select value={addForm.relationship} onChange={e => setAddForm(f => ({ ...f, relationship: e.target.value }))} style={{ ...IS, background:'#F8FAFC' }}>
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="guardian">Guardian</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                {!existingParent && (
                  <div style={{ padding:'12px 14px', borderRadius:10, border:'1px solid #CCFBF1', background:'#F0FDFA', color:'#115E59', fontSize:12, fontWeight:600, lineHeight:1.5 }}>
                    ✅ A secure 6-digit PIN will be auto-generated. The parent will be linked to this student instantly.
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:10, marginTop:24 }}>
                <button onClick={() => setShowAddModal(false)} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:700, color:'#475569', cursor:'pointer' }}>Cancel</button>
                <button onClick={handleAddParent} disabled={addSaving} style={{ flex:1, padding:12, borderRadius:10, border:'none', background: addSaving ? '#A7F3D0' : existingParent ? 'linear-gradient(135deg,#1D4ED8,#3B82F6)' : 'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor: addSaving ? 'not-allowed' : 'pointer', boxShadow: existingParent ? '0 4px 12px rgba(29,78,216,0.2)' : '0 4px 12px rgba(15,118,110,0.2)' }}>
                  {addSaving ? 'Processing…' : existingParent ? '🔗 Link to Student' : 'Create & Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials Modal ───────────────────────────────────────────────── */}
      {showCreds && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:380, background:'white', borderRadius:20, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', overflow:'hidden', textAlign:'center', position:'relative' }}>
            <div style={{ position:'absolute', top:0, left:0, width:'100%', height:6, background:'linear-gradient(to right,#14B8A6,#10B981)' }} />
            <div style={{ padding:32 }}>
              <div style={{ width:72, height:72, margin:'0 auto 20px', background:'#F0FDFA', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #CCFBF1', fontSize:32 }}>🎉</div>
              <h3 style={{ margin:'0 0 8px', fontSize:20, fontWeight:800, color:'#0F172A' }}>Parent Created!</h3>
              <p style={{ margin:'0 0 20px', fontSize:14, color:'#475569' }}><strong>{showCreds.name}</strong> has been created and linked.</p>
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:14, padding:18, textAlign:'left', marginBottom:20 }}>
                <div style={{ marginBottom:14 }}>
                  <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Login Phone</p>
                  <p style={{ margin:0, fontFamily:'monospace', fontSize:16, fontWeight:800, color:'#0F172A' }}>{showCreds.phone}</p>
                </div>
                <div>
                  <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Generated PIN</p>
                  <p style={{ margin:0, fontFamily:'monospace', fontSize:22, fontWeight:800, color:'#0F766E', letterSpacing:6 }}>{showCreds.pin}</p>
                </div>
              </div>
              <p style={{ margin:'0 0 20px', fontSize:12, color:'#64748B', fontWeight:600 }}>Share these credentials with the parent. They'll be prompted to change their PIN on first login.</p>
              <button onClick={() => setShowCreds(null)} style={{ width:'100%', padding:12, borderRadius:10, fontSize:14, fontWeight:700, color:'white', background:'linear-gradient(135deg,#0F766E,#0D9488)', border:'none', cursor:'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.2)' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link Existing Parent to Another Student Modal ───────────────────── */}
      {showLinkModal && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:420, background:'white', borderRadius:20, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', overflow:'hidden' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid #E2E8F0', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h3 style={{ margin:0, fontSize:17, fontWeight:800, color:'#0F172A' }}>🔗 Link to Student</h3>
                <p style={{ margin:'4px 0 0', fontSize:12, color:'#64748B' }}>Link <strong>{showLinkModal.parentName}</strong> to another student</p>
              </div>
              <button onClick={() => setShowLinkModal(null)} style={{ width:32, height:32, borderRadius:'50%', background:'white', border:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8', cursor:'pointer', fontSize:14 }}>✕</button>
            </div>
            <div style={{ padding:24 }}>
              {linkError && <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:10, background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', fontSize:13, fontWeight:600 }}>{linkError}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#334155', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Search & Select Student *</label>
                  <StudentSearchPicker students={allStudents} value={linkStudentId} onChange={setLinkStudentId} placeholder="Type student name, class, or section…" />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#334155', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Relationship</label>
                  <select value={linkRelationship} onChange={e => setLinkRelationship(e.target.value)} style={{ ...IS, background:'#F8FAFC' }}>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="guardian">Guardian</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:24 }}>
                <button onClick={() => setShowLinkModal(null)} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:700, color:'#475569', cursor:'pointer' }}>Cancel</button>
                <button onClick={handleLinkExisting} disabled={linking} style={{ flex:1, padding:12, borderRadius:10, border:'none', background: linking ? '#93C5FD' : 'linear-gradient(135deg,#1D4ED8,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor: linking ? 'not-allowed' : 'pointer', boxShadow:'0 4px 12px rgba(29,78,216,0.25)' }}>
                  {linking ? 'Linking…' : 'Link Parent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
