'use client';

// AI Copilot — Message Renderer
// Renders all message types: text (markdown-lite), charts, tables,
// action buttons, and confirmation dialogs.

import { useRouter } from 'next/navigation';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { ChartData, TableData, ActionItem, ConfirmData, CopilotMessage } from '@/store/copilotStore';

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

function formatYAxis(v: number) {
  if (v >= 100000) return `₹${(v/100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v/1000).toFixed(0)}K`;
  return `${v}`;
}

// ─── Mini Markdown renderer ────────────────────────────────────────────────────

function renderMarkdownText(text: string) {
  // Process line by line for bullets and numbered lists; inline bold/code
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { elements.push(<div key={key++} style={{ height: 8 }} />); continue; }

    // Heading
    if (trimmed.startsWith('### ')) {
      elements.push(
        <p key={key++} style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', marginTop: 10, marginBottom: 4 }}>
          {renderInline(trimmed.slice(4))}
        </p>
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <p key={key++} style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginTop: 12, marginBottom: 4, borderBottom: '1px solid #E2E8F0', paddingBottom: 4 }}>
          {renderInline(trimmed.slice(3))}
        </p>
      );
      continue;
    }

    // Bullet list
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: '#3B82F6', fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>•</span>
          <span style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.6 }}>{renderInline(trimmed.slice(2))}</span>
        </div>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const [num, ...rest] = trimmed.split(/\.\s/);
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: '#3B82F6', fontSize: 12, fontWeight: 700, lineHeight: 1.6, flexShrink: 0, minWidth: 18 }}>{num}.</span>
          <span style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.6 }}>{renderInline(rest.join('. '))}</span>
        </div>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.65, marginBottom: 2 }}>
        {renderInline(trimmed)}
      </p>
    );
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text** or __text__
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 700, color: '#0F172A' }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{ fontFamily: 'monospace', fontSize: 11, background: '#F1F5F9', padding: '1px 5px', borderRadius: 4, color: '#1E40AF' }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

// ─── Chart Renderer ────────────────────────────────────────────────────────────

const CHART_COLORS = ['#3B82F6','#16A34A','#DC2626','#D97706','#7C3AED','#0891B2'];

function ChartCard({ chartData }: { chartData: ChartData }) {
  const { chartType, data, config } = chartData;
  if (!data || data.length === 0) return null;

  const colors = config.colors?.length ? config.colors : CHART_COLORS;

  const cardStyle: React.CSSProperties = {
    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
    padding: '14px 16px', marginTop: 10,
  };

  if (chartType === 'pie') {
    const total = data.reduce((s, d) => s + (d.value || 0), 0);
    return (
      <div style={cardStyle}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} cx="40%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
              {data.map((entry, i) => <Cell key={i} fill={entry.fill || colors[i % colors.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => [v, '']} />
            <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'area') {
    const yKey = config.yKeys?.[0] ?? 'value';
    const isCurrency = config.label?.includes('₹') || yKey === 'total';
    return (
      <div style={cardStyle}>
        {config.label && <p style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{config.label}</p>}
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="grad0" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors[0]} stopOpacity={0.2}/>
                <stop offset="95%" stopColor={colors[0]} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey={config.xKey} tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} tickFormatter={isCurrency ? formatYAxis : undefined} width={isCurrency ? 52 : 32} />
            <Tooltip formatter={(v: any) => [isCurrency ? formatCurrency(v) : v, config.label || yKey]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
            <Area type="monotone" dataKey={yKey} stroke={colors[0]} fill="url(#grad0)" strokeWidth={2} dot={{ fill: colors[0], r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'bar') {
    const yKey = config.yKeys?.[0] ?? 'value';
    return (
      <div style={cardStyle}>
        {config.label && <p style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{config.label}</p>}
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey={config.xKey} tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={32} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
            {config.yKeys.map((yk, i) => (
              <Bar key={yk} dataKey={yk} fill={colors[i % colors.length]} radius={[4,4,0,0]} maxBarSize={32} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}

// ─── Table Renderer ────────────────────────────────────────────────────────────

function TableCard({ tableData }: { tableData: TableData }) {
  if (!tableData.rows?.length) return null;
  return (
    <div style={{ marginTop: 10, borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden', fontSize: 12 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {tableData.headers.map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #E2E8F0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? 'white' : '#FAFAFA', borderBottom: '1px solid #F1F5F9' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '7px 12px', color: '#1E293B', whiteSpace: 'nowrap' }}>
                    {cell === null || cell === undefined ? '—' : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Action Buttons ────────────────────────────────────────────────────────────

function ActionButtons({ actions, onSendMessage }: { actions: ActionItem[]; onSendMessage: (msg: string) => void }) {
  const router = useRouter();
  if (!actions?.length) return null;

  const variantStyle: Record<string, React.CSSProperties> = {
    primary:   { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' },
    success:   { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' },
    danger:    { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FEE2E2' },
    secondary: { background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' },
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={() => {
            if (a.action === 'navigate') router.push(a.value);
            else if (a.action === 'send_message') onSendMessage(a.value);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s ease',
            ...(variantStyle[a.variant ?? 'secondary'] ?? variantStyle.secondary),
          }}
        >
          {a.icon && <span style={{ fontSize: 14 }}>{a.icon}</span>}
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ─── Confirm Dialog ────────────────────────────────────────────────────────────

export function ConfirmCard({
  confirm, onConfirm, onCancel, loading,
}: {
  confirm: ConfirmData;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div style={{
      marginTop: 12, border: '1px solid #FDE68A', borderRadius: 12,
      background: '#FFFBEB', padding: '14px 16px',
      animation: 'fadeIn 0.25s ease',
    }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: '#92400E', marginBottom: 4 }}>⚠️ Confirm Action</p>
      <p style={{ fontSize: 13, color: '#92400E', marginBottom: 4 }}>{confirm.message}</p>
      {confirm.details && <p style={{ fontSize: 12, color: '#B45309', marginBottom: 12 }}>{confirm.details}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onConfirm}
          disabled={loading}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: '#DC2626', color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1, transition: 'all 0.15s',
          }}
        >
          {loading ? '⏳ Processing...' : (confirm.confirmLabel ?? '✓ Confirm')}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'white', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer',
          }}
        >
          {confirm.cancelLabel ?? 'Cancel'}
        </button>
      </div>
    </div>
  );
}

// ─── Tool Status Indicator ─────────────────────────────────────────────────────

function ToolStatusList({ statuses }: { statuses: string[] }) {
  if (!statuses.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
      {statuses.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />
          {s}
        </div>
      ))}
    </div>
  );
}

// ─── Main Message Renderer ────────────────────────────────────────────────────

interface MessageRendererProps {
  message: CopilotMessage;
  isStreaming?: boolean;
  onConfirm?: (confirm: ConfirmData) => void;
  onCancelConfirm?: (msgId: string) => void;
  onSendMessage?: (text: string) => void;
  confirmLoading?: boolean;
}

export default function MessageRenderer({
  message, isStreaming, onConfirm, onCancelConfirm, onSendMessage, confirmLoading,
}: MessageRendererProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{
          maxWidth: '80%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px',
          background: 'linear-gradient(135deg, #1E40AF, #3B82F6)', color: 'white',
          fontSize: 13, lineHeight: 1.5, boxShadow: '0 2px 8px rgba(59,130,246,0.2)',
        }}>
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div style={{ marginBottom: 16, animation: 'fadeIn 0.3s ease' }}>
      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
        }}>✦</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5', letterSpacing: '0.05em' }}>AI COPILOT</span>
        <span style={{ fontSize: 10, color: '#CBD5E1' }}>
          {new Date(message.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Message card */}
      <div style={{
        marginLeft: 36, background: 'white', border: '1px solid #E2E8F0',
        borderRadius: '4px 16px 16px 16px', padding: '12px 14px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        {/* Tool statuses */}
        <ToolStatusList statuses={message.toolStatuses} />

        {/* Error state */}
        {message.hasError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#DC2626', fontSize: 13 }}>
            <span>⚠️</span><span>{message.content || "I couldn't complete that request."}</span>
          </div>
        )}

        {/* Text content */}
        {!message.hasError && message.content && (
          <div>
            {renderMarkdownText(message.content)}
            {/* Blinking cursor while streaming */}
            {isStreaming && (
              <span style={{ display: 'inline-block', width: 2, height: 14, background: '#3B82F6', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'pulse 1s infinite' }} />
            )}
          </div>
        )}

        {/* Streaming indicator (no text yet) */}
        {isStreaming && !message.content && !message.hasError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%', background: '#CBD5E1',
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}

        {/* Charts */}
        {message.charts?.map((c, i) => <ChartCard key={i} chartData={c} />)}

        {/* Tables */}
        {message.tables?.map((t, i) => <TableCard key={i} tableData={t} />)}

        {/* Confirm dialog */}
        {message.confirm && (
          <ConfirmCard
            confirm={message.confirm}
            onConfirm={() => onConfirm?.(message.confirm!)}
            onCancel={() => onCancelConfirm?.(message.id)}
            loading={!!confirmLoading}
          />
        )}

        {/* Action buttons (hidden while confirm is shown) */}
        {!message.confirm && message.actions?.length > 0 && (
          <ActionButtons actions={message.actions} onSendMessage={onSendMessage ?? (() => {})} />
        )}
      </div>
    </div>
  );
}
