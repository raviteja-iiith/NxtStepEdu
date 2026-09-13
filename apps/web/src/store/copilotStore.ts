// Zustand store for AI Copilot conversation state
// Handles: open/close, messages, streaming, context, confirmations

import { create } from 'zustand';

// ─── Message Types ─────────────────────────────────────────────────────────────

export interface ChartConfig {
  xKey: string;
  yKeys: string[];
  colors: string[];
  label?: string;
}

export interface ChartData {
  chartType: 'area' | 'bar' | 'pie';
  data: Record<string, any>[];
  config: ChartConfig;
}

export interface TableData {
  headers: string[];
  rows: (string | number | null)[][];
}

export interface ActionItem {
  label: string;
  icon?: string;
  variant?: 'primary' | 'success' | 'danger' | 'secondary';
  action: 'navigate' | 'send_message';
  value: string;
}

export interface ConfirmData {
  message: string;
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  action: string;
  params: Record<string, any>;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  // Primary text content (streamed incrementally for assistant)
  content: string;
  // Rich structured content (appended during streaming)
  toolStatuses: string[];       // e.g. "🔍 Checking payroll..."
  charts: ChartData[];
  tables: TableData[];
  actions: ActionItem[];
  confirm: ConfirmData | null;
  hasError: boolean;
  timestamp: number;
}

export interface CopilotContext {
  page: string;         // e.g. "/principal/hr"
  pageLabel: string;    // e.g. "HR & Payroll"
  role: string;         // "principal"
  userName: string;
  schoolName: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface CopilotStore {
  isOpen: boolean;
  messages: CopilotMessage[];
  isStreaming: boolean;
  context: CopilotContext;

  // Actions
  toggle: () => void;
  open: () => void;
  close: () => void;
  addMessage: (msg: CopilotMessage) => void;
  updateMessage: (id: string, updates: Partial<CopilotMessage>) => void;
  appendText: (id: string, chunk: string) => void;
  appendToolStatus: (id: string, status: string) => void;
  appendChart: (id: string, chart: ChartData) => void;
  appendTable: (id: string, table: TableData) => void;
  setActions: (id: string, actions: ActionItem[]) => void;
  setConfirm: (id: string, confirm: ConfirmData) => void;
  clearMessages: () => void;
  setStreaming: (v: boolean) => void;
  setContext: (ctx: Partial<CopilotContext>) => void;
}

let _counter = 0;
export function genMsgId() {
  return `cmsg_${++_counter}_${Date.now()}`;
}

export function createUserMessage(content: string): CopilotMessage {
  return {
    id: genMsgId(), role: 'user', content,
    toolStatuses: [], charts: [], tables: [], actions: [], confirm: null,
    hasError: false, timestamp: Date.now(),
  };
}

export function createAssistantMessage(): CopilotMessage {
  return {
    id: genMsgId(), role: 'assistant', content: '',
    toolStatuses: [], charts: [], tables: [], actions: [], confirm: null,
    hasError: false, timestamp: Date.now(),
  };
}

export const useCopilotStore = create<CopilotStore>((set) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,
  context: {
    page: '/', pageLabel: 'Dashboard',
    role: 'principal', userName: 'Principal', schoolName: 'School',
  },

  toggle: () => set(s => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),

  updateMessage: (id, updates) => set(s => ({
    messages: s.messages.map(m => m.id === id ? { ...m, ...updates } : m),
  })),

  appendText: (id, chunk) => set(s => ({
    messages: s.messages.map(m =>
      m.id === id ? { ...m, content: m.content + chunk } : m
    ),
  })),

  appendToolStatus: (id, status) => set(s => ({
    messages: s.messages.map(m =>
      m.id === id ? { ...m, toolStatuses: [...m.toolStatuses, status] } : m
    ),
  })),

  appendChart: (id, chart) => set(s => ({
    messages: s.messages.map(m =>
      m.id === id ? { ...m, charts: [...m.charts, chart] } : m
    ),
  })),

  appendTable: (id, table) => set(s => ({
    messages: s.messages.map(m =>
      m.id === id ? { ...m, tables: [...m.tables, table] } : m
    ),
  })),

  setActions: (id, actions) => set(s => ({
    messages: s.messages.map(m => m.id === id ? { ...m, actions } : m),
  })),

  setConfirm: (id, confirm) => set(s => ({
    messages: s.messages.map(m => m.id === id ? { ...m, confirm } : m),
  })),

  clearMessages: () => set({ messages: [] }),
  setStreaming: (v) => set({ isStreaming: v }),
  setContext: (ctx) => set(s => ({ context: { ...s.context, ...ctx } })),
}));
