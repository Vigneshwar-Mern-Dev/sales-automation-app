"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────
export type DailyCallPoint = { date: string; incoming: number; outgoing: number };
export type StatusPoint = { name: string; value: number; color: string };
export type WaDailyPoint = { date: string; sent: number; replied: number };
export type TaskTrendPoint = { date: string; completed: number; created: number };

const TOOLTIP_STYLE = {
  backgroundColor: "#0d0f14",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  color: "#e2e8f0",
  fontSize: 12,
};

// ── Daily Calls Line Chart ────────────────────────────────────────────────────
export function DailyCallsChart({ data }: { data: DailyCallPoint[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-sm font-semibold text-white">Daily calls — last 14 days</h3>
      <p className="mt-0.5 text-xs text-slate-500">Incoming vs outgoing call volume per day</p>
      <div className="mt-5 h-52">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="incomingGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#67e8f9" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="outgoingGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 8 }} />
            <Area dataKey="incoming" fill="url(#incomingGrad)" name="Incoming" stroke="#67e8f9" strokeWidth={2} type="monotone" />
            <Area dataKey="outgoing" fill="url(#outgoingGrad)" name="Outgoing" stroke="#a78bfa" strokeWidth={2} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Lead Status Donut Chart ───────────────────────────────────────────────────
export function LeadStatusDonut({ data }: { data: StatusPoint[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-sm font-semibold text-white">Call lead distribution</h3>
      <p className="mt-0.5 text-xs text-slate-500">By current status</p>
      <div className="mt-4 flex items-center gap-6">
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                cx="50%"
                cy="50%"
                data={data}
                dataKey="value"
                innerRadius={48}
                outerRadius={68}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell fill={entry.color} key={entry.name} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {data.map((item) => (
            <div className="flex items-center justify-between text-xs" key={item.name}>
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />
                <span className="text-slate-400">{item.name}</span>
              </span>
              <span className="font-semibold text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── WhatsApp Daily Sends Area Chart ──────────────────────────────────────────
export function WaDailySendsChart({ data }: { data: WaDailyPoint[] }) {
  return (
    <div className="rounded-xl border border-emerald-300/10 bg-emerald-300/5 p-5">
      <h3 className="text-sm font-semibold text-white">WhatsApp sends — last 14 days</h3>
      <p className="mt-0.5 text-xs text-slate-500">Messages sent vs replies received per day</p>
      <div className="mt-5 h-52">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="sentGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="repliedGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 8 }} />
            <Area dataKey="sent" fill="url(#sentGrad)" name="Sent" stroke="#34d399" strokeWidth={2} type="monotone" />
            <Area dataKey="replied" fill="url(#repliedGrad)" name="Replied" stroke="#a78bfa" strokeWidth={2} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Task Completion Bar Chart ─────────────────────────────────────────────────
export function TaskCompletionChart({ data }: { data: TaskTrendPoint[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-sm font-semibold text-white">Task activity — last 14 days</h3>
      <p className="mt-0.5 text-xs text-slate-500">Tasks created vs completed per day</p>
      <div className="mt-5 h-52">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 8 }} />
            <Bar dataKey="created" fill="#38bdf8" name="Created" radius={[4, 4, 0, 0]} />
            <Bar dataKey="completed" fill="#4ade80" name="Completed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
