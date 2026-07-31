"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAssignCallLeadAction,
  adminDeleteCallLeadsAction,
  createManualCallLeadAction,
  saveCallLeadToSheetAction,
  toggleCallLeadImportantAction,
  updateCallLeadDetailsAction,
  updateCallLeadStatusAction,
  updateCallLeadWorkflowAction,
} from "@/app/lib/call-lead-actions";
import { CallLeadStatus } from "@/app/lib/prisma-enums";
import { CallCenterTabs, PageHeader, StatCard, StatusBadge, formatDuration } from "../call-ui";

type FormSubmissionRow = {
  id: string;
  status: string;
  submittedAt: Date | string | null;
  name: string | null;
  city: string | null;
  propertyType: string | null;
  mapsLocation: string | null;
  formToken: string | null;
};

export type CallLeadRow = {
  id: string;
  phone: string;
  displayName: string;
  email: string | null;
  city: string | null;
  address: string | null;
  ownershipType: string | null;
  language: string | null;
  message: string | null;
  status: CallLeadStatus;
  assignedToId: string | null;
  lastCompanyPhone: string | null;
  lastContactedAt: Date | string | null;
  nextFollowUpAt: Date | string | null;
  notes: string | null;
  isImportant: boolean;
  locationSent: boolean;
  instagramLeadId: string | null;
  sheetSyncedAt: Date | string | null;
  sheetSyncWarning: string | null;
  updatedAt: Date | string;
  assignedTo?: { id: string; username: string; email: string; department?: string } | null;
  sessions?: Array<{
    id: string;
    firstRingAt: Date | string;
    callDirection: string;
    status: string;
    durationSeconds: number | null;
    companyPhone: { label: string; phoneNumber: string };
  }>;
  latestOutgoingSession: {
    id: string;
    firstRingAt: Date | string;
    callDirection: string;
    status: string;
    durationSeconds: number | null;
    companyPhone: { label: string; phoneNumber: string };
  } | null;
  latestDurationSession: {
    id: string;
    firstRingAt: Date | string;
    callDirection: string;
    status: string;
    durationSeconds: number | null;
    companyPhone: { label: string; phoneNumber: string };
  } | null;
  incomingCallCount: number;
  outgoingCallCount: number;
  activities?: Array<{
    id: string;
    actionType: string;
    description: string;
    createdAt: Date | string;
    user?: { username: string } | null;
  }>;
  _count: { sessions: number; followUps: number };
  // Form and WhatsApp visibility
  hasSubmittedForm: boolean;
  submittedFormData?: FormSubmissionRow | null;
  formSubmission?: FormSubmissionRow | null;
  whatsappStatus: string | null;
  lastWhatsAppError: string | null;
  formToken: string | null;
};

type Agent = { id: string; username: string; email: string; department?: string };

const statusOptions = Object.keys(CallLeadStatus) as CallLeadStatus[];
const quickStatusOptions: Array<{ label: string; value: CallLeadStatus }> = [
  { label: "New", value: "NEW" },
  { label: "In Progress", value: "CONTACTED" },
  { label: "Follow-up", value: "FOLLOW_UP" },
  { label: "Completed", value: "CONVERTED" },
  { label: "No Response", value: "NO_RESPONSE" },
];

function formatDate(value: Date | string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function toDateTimeLocal(value: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function statusTone(status: string) {
  if (status === "CONVERTED") {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "FOLLOW_UP" || status === "INTERESTED") {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  if (status === "NOT_INTERESTED" || status === "CLOSED") {
    return "border-rose-300/20 bg-rose-300/10 text-rose-100";
  }

  return "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    NEW: "New",
    CONTACTED: "In Progress",
    FOLLOW_UP: "Follow-up",
    INTERESTED: "Interested",
    NOT_INTERESTED: "Not Interested",
    NO_RESPONSE: "No Response",
    CONVERTED: "Completed",
    CLOSED: "Closed",
  };

  return labels[status] || status.replaceAll("_", " ");
}

function directionLabel(direction: string | null | undefined) {
  if (direction === "OUTGOING") {
    return "Outgoing";
  }

  if (direction === "INCOMING") {
    return "Incoming";
  }

  return "--";
}

type QueueCounts = {
  open: number;
  followUp: number;
  unassigned: number;
  important: number;
  filledForm: number;
  synced: number;
};

type LeadQueue = "OPEN" | "FOLLOW_UP" | "UNASSIGNED" | "IMPORTANT" | "SYNCED" | "ALL";

type Pagination = {
  currentPage: number;
  pageSize: number;
  totalLeads: number;
  totalPages: number;
};

export function CallLeadsPage({
  leads,
  agents,
  filterFilledForm,
  queueCounts,
  initialAgentId = "ALL",
  initialQueue = "ALL",
  initialSearch = "",
  pagination,
}: {
  leads: CallLeadRow[];
  agents: Agent[];
  filterFilledForm: boolean;
  queueCounts: QueueCounts;
  initialAgentId?: string;
  initialQueue?: LeadQueue;
  initialSearch?: string;
  pagination: Pagination;
}) {
  const router = useRouter();
  const [activeLead, setActiveLead] = useState<CallLeadRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSavingPanel, setIsSavingPanel] = useState(false);
  const [detailName, setDetailName] = useState("");
  const [detailPhone, setDetailPhone] = useState("");
  const [detailEmail, setDetailEmail] = useState("");
  const [detailCity, setDetailCity] = useState("");
  const [detailLanguage, setDetailLanguage] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [detailOwnership, setDetailOwnership] = useState("");
  const [detailLocationSent, setDetailLocationSent] = useState(false);
  const [detailMessage, setDetailMessage] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState<CallLeadStatus>("NEW");
  const [workflowNotes, setWorkflowNotes] = useState("");
  const [workflowFollowUp, setWorkflowFollowUp] = useState("");
  const [workflowAssignee, setWorkflowAssignee] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [quickAssignLeadId, setQuickAssignLeadId] = useState<string | null>(null);
  const [quickAssignAgentId, setQuickAssignAgentId] = useState("");
  const [quickStatusLeadId, setQuickStatusLeadId] = useState<string | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualLanguage, setManualLanguage] = useState("");
  const [manualOwnership, setManualOwnership] = useState("");
  const [manualLocationSent, setManualLocationSent] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  const { currentPage, pageSize, totalLeads, totalPages } = pagination;


  const visibleLeads = leads;
  const paginationPages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    return Array.from(
      new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]),
    )
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
  }, [currentPage, totalPages]);
  const firstVisibleLead = totalLeads ? (currentPage - 1) * pageSize + 1 : 0;
  const lastVisibleLead = Math.min(currentPage * pageSize, totalLeads);
  const allVisibleLeadsSelected =
    visibleLeads.length > 0 && visibleLeads.every((lead) => selectedLeadIds.includes(lead.id));

  const navigateWithParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const target = "/admin/calls/leads" + (params.size ? "?" + params.toString() : "");
    setExpandedLeadId(null);
    startTransition(() => router.push(target));
  };

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    navigateWithParams({ page: page === 1 ? null : String(page) });
  };

  const toggleFilledFormFilter = () => {
    navigateWithParams({
      filledForm: filterFilledForm ? null : "true",
      page: null,
    });
  };

  const openPanel = (lead: CallLeadRow) => {
    setActiveLead(lead);
    setMessage(null);
    setError(null);
    setDetailName(lead.displayName || "");
    setDetailPhone(lead.phone || "");
    setDetailEmail(lead.email || "");
    setDetailCity(lead.city || "");
    setDetailLanguage(lead.language || "");
    setDetailAddress(lead.address || "");
    setDetailOwnership(lead.ownershipType || "");
    setDetailLocationSent(lead.locationSent);
    setDetailMessage(lead.message || "");
    setWorkflowStatus(lead.status);
    setWorkflowNotes(lead.notes || "");
    setWorkflowFollowUp(toDateTimeLocal(lead.nextFollowUpAt));
    setWorkflowAssignee(lead.assignedToId || "");
  };

  const viewAndCall = (lead: CallLeadRow) => {
    openPanel(lead);
  };

  const selectAllVisible = (checked: boolean) => {
    if (checked) {
      setSelectedLeadIds((current) =>
        Array.from(new Set([...current, ...visibleLeads.map((lead) => lead.id)])),
      );
      return;
    }

    setSelectedLeadIds((current) =>
      current.filter((id) => !visibleLeads.some((lead) => lead.id === id)),
    );
  };

  const selectLead = (leadId: string, checked: boolean) => {
    setSelectedLeadIds((current) =>
      checked ? Array.from(new Set([...current, leadId])) : current.filter((id) => id !== leadId),
    );
  };

  const deleteSelected = () => {
    if (!selectedLeadIds.length) return;
    if (!window.confirm(`Delete ${selectedLeadIds.length} selected call lead${selectedLeadIds.length === 1 ? "" : "s"}? Their tracked call history will also be removed.`)) return;

    startTransition(async () => {
      const result = await adminDeleteCallLeadsAction(selectedLeadIds);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (activeLead && selectedLeadIds.includes(activeLead.id)) {
        setActiveLead(null);
      }
      setSelectedLeadIds([]);
      setMessage("Selected call leads deleted.");
      router.refresh();
    });
  };

  const saveQuickAssignment = (leadId: string) => {
    if (!quickAssignAgentId) return;

    startTransition(async () => {
      const result = await adminAssignCallLeadAction(
        leadId,
        quickAssignAgentId === "UNASSIGNED" ? null : quickAssignAgentId,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      setQuickAssignLeadId(null);
      setQuickAssignAgentId("");
      router.refresh();
    });
  };

  const saveQuickStatus = (leadId: string, status: CallLeadStatus) => {
    startTransition(async () => {
      const result = await updateCallLeadStatusAction(leadId, status);

      if (result.error) {
        setError(result.error);
        return;
      }

      setQuickStatusLeadId(null);
      setMessage(`Status changed to ${statusLabel(status)}.`);
      router.refresh();
    });
  };

  const toggleImportant = (lead: CallLeadRow) => {
    startTransition(async () => {
      const result = await toggleCallLeadImportantAction(lead.id, !lead.isImportant);

      if (result.error) {
        setError(result.error);
        return;
      }

      setMessage(!lead.isImportant ? "Lead marked important." : "Lead unmarked important.");
      router.refresh();
    });
  };

  const resetManualForm = () => {
    setManualName("");
    setManualPhone("");
    setManualEmail("");
    setManualCity("");
    setManualLanguage("");
    setManualOwnership("");
    setManualLocationSent(false);
    setManualAddress("");
    setManualMessage("");
    setManualNotes("");
  };

  const saveManualLead = () => {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await createManualCallLeadAction({
        displayName: manualName,
        phone: manualPhone,
        email: manualEmail,
        city: manualCity,
        language: manualLanguage,
        ownershipType: manualOwnership,
        locationSent: manualLocationSent,
        address: manualAddress,
        message: manualMessage,
        notes: manualNotes,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setManualOpen(false);
      resetManualForm();
      setMessage(result.updated ? "Manual lead updated." : "Manual lead added.");
      router.refresh();
    });
  };

  const saveLeadWorkflowAndSheet = () => {
    if (!activeLead) return;
    setMessage(null);
    setError(null);
    setIsSavingPanel(true);

    startTransition(async () => {
      try {
        const leadId = activeLead.id;
        const detailResult = await updateCallLeadDetailsAction(leadId, {
          displayName: detailName,
          phone: detailPhone,
          email: detailEmail,
          city: detailCity,
          language: detailLanguage,
          address: detailAddress,
          ownershipType: detailOwnership,
          locationSent: detailLocationSent,
          message: detailMessage,
        });

        if (detailResult.error) {
          setError(detailResult.error);
          return;
        }

        const workflowResult = await updateCallLeadWorkflowAction(leadId, {
          status: workflowStatus,
          notes: workflowNotes,
          nextFollowUpAt: workflowFollowUp || undefined,
          assignedToId: workflowAssignee || undefined,
        });

        if (workflowResult.error) {
          setError(workflowResult.error);
          return;
        }

        const sheetResult = await saveCallLeadToSheetAction(leadId);

        if (sheetResult.error) {
          setError(sheetResult.error);
          return;
        }

        setMessage(sheetResult.warning || "Saved to sheet.");
        router.refresh();
      } finally {
        setIsSavingPanel(false);
      }
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        actions={(
          <button
            className="h-10 rounded-lg bg-cyan-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
            disabled={isPending}
            onClick={() => {
              setError(null);
              setMessage(null);
              setManualOpen(true);
            }}
            type="button"
          >
            Manual Add
          </button>
        )}
        description="Work phone leads as a queue: contact the customer, capture the requirement, schedule the next step, and sync qualified records to the lead sheet."
        title="Call leads"
      />
      <CallCenterTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard detail="Still needs operator attention" label="Open leads" value={queueCounts.open} />
        <StatCard detail="Scheduled or marked for follow-up" label="Follow-ups" tone="amber" value={queueCounts.followUp} />
        <StatCard detail="Needs an owner" label="Unassigned" tone={queueCounts.unassigned ? "rose" : "cyan"} value={queueCounts.unassigned} />
        <StatCard detail="Starred for priority handling" label="Important" tone="amber" value={queueCounts.important} />
        <StatCard detail="Customer submitted the form" label="Filled Form" tone="emerald" value={queueCounts.filledForm} />
        <StatCard detail="Written to the lead sheet" label="Synced" tone="emerald" value={queueCounts.synced} />
      </section>

      <section className="flex flex-col gap-3 rounded-t-xl border border-b-0 border-white/10 bg-white/[0.02] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-white">All leads</h2>
          <select
            className="h-9 rounded-lg border border-white/10 bg-black/40 px-3 text-xs font-semibold text-slate-200 outline-none focus:border-cyan-300"
            disabled={isPending}
            onChange={(event) =>
              navigateWithParams({
                queue: event.target.value === "ALL" ? null : event.target.value,
                page: null,
              })
            }
            value={initialQueue}
          >
            <option value="OPEN">Open Leads</option>
            <option value="FOLLOW_UP">Follow-ups</option>
            <option value="UNASSIGNED">Unassigned</option>
            <option value="IMPORTANT">Important</option>
            <option value="SYNCED">Synced</option>
            <option value="ALL">All Leads</option>
          </select>
          <select
            className="h-9 rounded-lg border border-white/10 bg-black/40 px-3 text-xs font-semibold text-slate-200 outline-none focus:border-cyan-300"
            disabled={isPending}
            onChange={(event) =>
              navigateWithParams({
                agent: event.target.value === "ALL" ? null : event.target.value,
                page: null,
              })
            }
            value={initialAgentId}
          >
            <option value="ALL">All Agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.username}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleFilledFormFilter}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
              filterFilledForm
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 shadow-[0_0_8px_0px_rgba(52,211,153,0.25)]"
                : "border-white/10 bg-black/40 text-slate-300 hover:border-emerald-400/30 hover:text-emerald-300"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Filled Form
            {filterFilledForm && (
              <span className="ml-0.5 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                {totalLeads}
              </span>
            )}
          </button>
        </div>
        <form
          className="flex w-full gap-2 lg:ml-auto lg:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            const normalizedSearch = search.trim();
            navigateWithParams({ q: normalizedSearch || null, page: null });
          }}
        >
          <input
            className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-300"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search all leads..."
            value={search}
          />
          <button
            className="h-9 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50"
            disabled={isPending}
            type="submit"
          >
            Search
          </button>
        </form>
        <span className="whitespace-nowrap rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300">
          {totalLeads} lead{totalLeads === 1 ? "" : "s"}
        </span>
      </section>

      {selectedLeadIds.length ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/20 bg-cyan-950/30 px-4 py-3">
          <p className="text-sm font-bold text-cyan-100">
            {selectedLeadIds.length} call lead{selectedLeadIds.length === 1 ? "" : "s"} selected
          </p>
          <div className="flex gap-2">
            <button className="h-9 rounded-lg border border-rose-300/25 bg-rose-300/10 px-4 text-xs font-bold text-rose-100 transition hover:bg-rose-300/20 disabled:opacity-50" disabled={isPending} onClick={deleteSelected} type="button">
              {isPending ? "Deleting..." : "Delete"}
            </button>
            <button className="h-9 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-300 transition hover:bg-white/10" onClick={() => setSelectedLeadIds([])} type="button">
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-b-xl border border-white/10 bg-white/[0.02]">
        <div className="grid grid-cols-[28px_0.95fr_36px_1.1fr_1.35fr_0.8fr_0.68fr_1.15fr_0.78fr_0.68fr] gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3 text-xs font-semibold text-slate-200">
          <input checked={allVisibleLeadsSelected} className="rounded border-white/10 bg-black/40" onChange={(event) => selectAllVisible(event.target.checked)} type="checkbox" />
          <span>Date</span>
          <span className="text-center">Imp</span>
          <span>Name</span>
          <span>Address / State</span>
          <span>Property / Location</span>
          <span>Duration / Calls</span>
          <span>Agent / Assign</span>
          <span>Next Follow-up</span>
          <span />
        </div>

        <div className="divide-y divide-white/10">
          {visibleLeads.map((lead) => {
            const latestSession = lead.sessions?.[0];
            const latestMeasuredSession = lead.latestDurationSession;
            const callHistory = lead.sessions || [];
            const isExpanded = expandedLeadId === lead.id;

            return (
              <Fragment key={lead.id}>
                <div
                  className={`grid cursor-pointer grid-cols-[28px_0.95fr_36px_1.1fr_1.35fr_0.8fr_0.68fr_1.15fr_0.78fr_0.68fr] items-center gap-2 px-4 py-3 text-xs transition hover:bg-white/[0.02] ${isExpanded ? "bg-cyan-300/[0.04]" : ""}`}
                  onClick={() => setExpandedLeadId((current) => (current === lead.id ? null : lead.id))}
                >
                  <input
                    checked={selectedLeadIds.includes(lead.id)}
                    className="rounded border-white/10 bg-black/40"
                    onChange={(event) => selectLead(lead.id, event.target.checked)}
                    onClick={(event) => event.stopPropagation()}
                    type="checkbox"
                  />
                  <div>
                    <p className="font-semibold text-slate-400">
                      {formatDate(latestSession?.firstRingAt || lead.updatedAt)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {lead.incomingCallCount} incoming / {lead._count.followUps} follow-ups
                    </p>
                  </div>
                  <button
                    aria-label={lead.isImportant ? "Unmark important" : "Mark important"}
                    className={`grid h-8 w-8 place-items-center rounded-lg border transition ${
                      lead.isImportant
                        ? "border-amber-300/40 bg-amber-300/15 text-amber-300"
                        : "border-white/10 bg-white/[0.03] text-slate-500 hover:border-amber-300/30 hover:text-amber-200"
                    }`}
                    disabled={isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleImportant(lead);
                    }}
                    title={lead.isImportant ? "Important" : "Mark important"}
                    type="button"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-[18px] w-[18px]"
                      fill={lead.isImportant ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path d="m12 3.75 2.54 5.15 5.68.83-4.11 4 .97 5.65L12 16.7l-5.08 2.68.97-5.65-4.11-4 5.68-.83L12 3.75Z" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-slate-100">{lead.displayName}</p>
                      {quickStatusLeadId === lead.id ? (
                        <select
                          autoFocus
                          className="h-7 rounded-md border border-cyan-500/30 bg-black/60 px-2 text-[10px] font-semibold text-slate-200 outline-none focus:border-cyan-400"
                          defaultValue={lead.status}
                          disabled={isPending}
                          onBlur={() => setQuickStatusLeadId(null)}
                          onChange={(event) => saveQuickStatus(lead.id, event.target.value as CallLeadStatus)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {quickStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          className={`rounded-md border px-2 py-1 text-[10px] font-bold transition hover:brightness-125 ${statusTone(lead.status)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuickStatusLeadId(lead.id);
                          }}
                          type="button"
                        >
                          {statusLabel(lead.status)}
                        </button>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="truncate text-xs text-slate-400">{lead.phone}</p>
                      {lead.lastCompanyPhone && (
                        <span className="inline-flex items-center rounded-md bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-300 border border-slate-700" title={`Received on ${lead.lastCompanyPhone}`}>
                          via {lead.lastCompanyPhone.slice(-4)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 text-xs">
                    {lead.address && (lead.address.startsWith("http://") || lead.address.startsWith("https://")) ? (
                      <a
                        href={lead.address}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 hover:underline font-semibold"
                        title={lead.address}
                      >
                        Open Map
                      </a>
                    ) : (
                      <p className="truncate text-slate-400" title={lead.address || ""}>{lead.address || "--"}</p>
                    )}
                    <p className="mt-1 truncate text-[11px] text-slate-500">{lead.city || "--"}</p>
                  </div>
                  <div className="min-w-0 text-xs">
                    <p className="truncate text-slate-300">{lead.ownershipType || "Not confirmed"}</p>
                    <p className={`mt-1 text-[11px] ${lead.locationSent ? "text-emerald-300" : "text-slate-500"}`}>
                      {lead.locationSent ? "Location sent" : "Location not sent"}
                    </p>
                  </div>
                  <div className="whitespace-nowrap text-xs">
                    <p className="text-slate-400">
                      {latestMeasuredSession
                        ? `${directionLabel(latestMeasuredSession.callDirection)} / ${formatDuration(latestMeasuredSession.durationSeconds)}`
                        : "No duration"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {lead.incomingCallCount} in / {lead.outgoingCallCount} out
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 truncate text-xs font-semibold text-slate-300">
                      {lead.assignedTo?.username || "Unassigned"}
                    </p>
                    {quickAssignLeadId === lead.id ? (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <select
                          autoFocus
                          className="h-8 min-w-0 rounded-lg border border-cyan-500/30 bg-black/60 px-2 text-[11px] text-slate-200 outline-none focus:border-cyan-400"
                          onChange={(event) => setQuickAssignAgentId(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          value={quickAssignAgentId}
                        >
                          <option value="">Select agent...</option>
                          <option value="UNASSIGNED">Unassign</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.username} ({agent.department || "Other"})
                            </option>
                          ))}
                        </select>
                        <button
                          className="h-8 rounded-lg bg-cyan-400 px-2 text-[10px] font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-40"
                          disabled={!quickAssignAgentId || isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            saveQuickAssignment(lead.id);
                          }}
                          type="button"
                        >
                          {isPending ? "..." : "Save"}
                        </button>
                        <button
                          className="h-8 w-8 rounded-lg border border-white/10 text-[10px] text-slate-400 transition hover:text-white"
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuickAssignLeadId(null);
                            setQuickAssignAgentId("");
                          }}
                          type="button"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <button
                        className="h-7 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 text-[11px] font-semibold text-amber-200 transition hover:border-amber-400/40 hover:bg-amber-500/20"
                        onClick={(event) => {
                          event.stopPropagation();
                          setQuickAssignLeadId(lead.id);
                          setQuickAssignAgentId(lead.assignedToId || "");
                        }}
                        type="button"
                      >
                        {lead.assignedTo?.username ? "Reassign" : "Assign"}
                      </button>
                    )}
                  </div>
                  <p className="whitespace-nowrap text-xs text-slate-400">{formatDate(lead.nextFollowUpAt)}</p>
                  <button
                    className="h-9 w-fit rounded-lg border border-white/10 bg-white/10 px-3 text-xs font-bold text-slate-200 transition hover:bg-white/15"
                    onClick={(event) => {
                      event.stopPropagation();
                      viewAndCall(lead);
                    }}
                    type="button"
                  >
                    View &amp; Call
                  </button>
                </div>
                {isExpanded ? (
                  <div className="bg-cyan-950/10 px-4 py-4 text-xs">
                    <div className="grid gap-5 xl:grid-cols-[0.85fr_0.95fr_1fr_1.05fr]">
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                          Customer Details
                        </p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-300">
                          <dt className="text-slate-500">Name</dt>
                          <dd className="font-semibold text-slate-100">{lead.displayName}</dd>
                          <dt className="text-slate-500">Phone</dt>
                          <dd>{lead.phone}</dd>
                          <dt className="text-slate-500">Email</dt>
                          <dd>{lead.email || "--"}</dd>
                          <dt className="text-slate-500">Language</dt>
                          <dd>{lead.language || "--"}</dd>
                          <dt className="text-slate-500">Property</dt>
                          <dd>{lead.ownershipType || "Not confirmed"}</dd>
                          <dt className="text-slate-500">Location</dt>
                          <dd className={lead.locationSent ? "text-emerald-300" : "text-slate-300"}>
                            {lead.locationSent ? "Sent" : "Not sent"}
                          </dd>
                          <dt className="text-slate-500">City / State</dt>
                          <dd>{lead.city || "--"}</dd>
                        </dl>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                          Call & Follow-up
                        </p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-300">
                          <dt className="text-slate-500">Status</dt>
                          <dd><StatusBadge tone="slate">{statusLabel(lead.status)}</StatusBadge></dd>
                          <dt className="text-slate-500">Assigned</dt>
                          <dd>{lead.assignedTo?.username || "Unassigned"}</dd>
                          <dt className="text-slate-500">Next follow-up</dt>
                          <dd>{formatDate(lead.nextFollowUpAt)}</dd>
                          <dt className="text-slate-500">Last contacted</dt>
                          <dd>{formatDate(lead.lastContactedAt)}</dd>
                          <dt className="text-slate-500">Incoming calls</dt>
                          <dd>{lead.incomingCallCount}</dd>
                          <dt className="text-slate-500">Outgoing calls</dt>
                          <dd>{lead.outgoingCallCount}</dd>
                          <dt className="text-slate-500">Last direction</dt>
                          <dd>{directionLabel(latestMeasuredSession?.callDirection || latestSession?.callDirection)}</dd>
                          <dt className="text-slate-500">Last duration</dt>
                          <dd>{formatDuration(latestMeasuredSession?.durationSeconds ?? latestSession?.durationSeconds ?? null)}</dd>
                          <dt className="text-slate-500">Company phone</dt>
                          <dd>{latestSession?.companyPhone.phoneNumber || lead.lastCompanyPhone || "--"}</dd>
                          <dt className="text-slate-500">Sheet sync</dt>
                          <dd>{lead.sheetSyncedAt ? formatDate(lead.sheetSyncedAt) : "Not synced"}</dd>
                        </dl>
                      </div>

                      {/* WhatsApp and form status */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                          WhatsApp &amp; Form
                        </p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-300">
                          <dt className="text-slate-500">WhatsApp status</dt>
                          <dd>
                            {lead.whatsappStatus ? (
                              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                                lead.whatsappStatus === "SENT" ? "border-sky-300/20 bg-sky-300/10 text-sky-100" :
                                lead.whatsappStatus === "FAILED" ? "border-rose-300/20 bg-rose-300/10 text-rose-100" :
                                lead.whatsappStatus === "QUEUED" || lead.whatsappStatus === "SENDING" ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100" :
                                lead.whatsappStatus === "FORM_SUBMITTED" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" :
                                "border-white/10 bg-white/5 text-slate-300"
                              }`}>
                                {lead.whatsappStatus === "QUEUED" ? "Waiting to send" :
                                 lead.whatsappStatus === "SENDING" ? "Sending now" :
                                 lead.whatsappStatus === "SENT" ? "Sent \u2014 awaiting form" :
                                 lead.whatsappStatus === "FAILED" ? "Failed \u26A0" :
                                 lead.whatsappStatus === "FORM_SUBMITTED" ? "Form submitted \u2713" :
                                 lead.whatsappStatus.replace(/_/g, " ")}
                              </span>
                            ) : (
                              <span className="text-slate-500">Not sent</span>
                            )}
                          </dd>
                          <dt className="text-slate-500">Form status</dt>
                          <dd>
                            {lead.hasSubmittedForm ? (
                              <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100">
                                Submitted
                              </span>
                            ) : lead.formSubmission?.status === "FORM_STARTED" ? (
                              <span className="text-amber-300 text-[11px]">Started (not submitted)</span>
                            ) : lead.formSubmission?.status === "OPENED" ? (
                              <span className="text-slate-400 text-[11px]">Opened (not started)</span>
                            ) : lead.formToken ? (
                              <span className="text-slate-500 text-[11px]">Pending form</span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">No form</span>
                            )}
                          </dd>
                          {lead.hasSubmittedForm && lead.submittedFormData && (
                            <>
                              <dt className="text-slate-500">Form name</dt>
                              <dd>{lead.submittedFormData.name || "--"}</dd>
                              <dt className="text-slate-500">Form city</dt>
                              <dd>{lead.submittedFormData.city || "--"}</dd>
                              <dt className="text-slate-500">Form property</dt>
                              <dd>{lead.submittedFormData.propertyType || "--"}</dd>
                              <dt className="text-slate-500">Form location</dt>
                              <dd>
                                {lead.submittedFormData.mapsLocation ? (
                                  <a href={lead.submittedFormData.mapsLocation} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 underline text-[11px]">
                                    Open Map
                                  </a>
                                ) : "--"}
                              </dd>
                            </>
                          )}
                          <dt className="text-slate-500">Sheet sync</dt>
                          <dd className={lead.sheetSyncedAt ? "text-emerald-300" : "text-slate-500"}>
                            {lead.sheetSyncedAt ? `Synced ${formatDate(lead.sheetSyncedAt)}` : "Not synced"}
                          </dd>
                          {lead.sheetSyncWarning && (
                            <>
                              <dt className="text-slate-500">Sync warning</dt>
                              <dd className="text-amber-300 text-[11px]">{lead.sheetSyncWarning}</dd>
                            </>
                          )}
                          {lead.lastWhatsAppError && (
                            <>
                              <dt className="text-slate-500">WA error</dt>
                              <dd className="text-rose-300 text-[11px]">{lead.lastWhatsAppError}</dd>
                            </>
                          )}
                        </dl>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                            Notes
                          </p>
                          <p className="mt-2 whitespace-pre-wrap leading-5 text-slate-300">
                            {lead.notes?.trim() || "No notes recorded."}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                            Requirement
                          </p>
                          <p className="mt-2 whitespace-pre-wrap leading-5 text-slate-300">
                            {lead.message?.trim() || "No requirement captured."}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                            Address
                          </p>
                          <p className="mt-2 whitespace-pre-wrap leading-5 text-slate-300">
                            {lead.address?.trim() || "No address captured."}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                            Call History
                          </p>
                          <span className="text-[11px] text-slate-500">
                            {lead._count.sessions} total
                          </span>
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
                          <div className="grid grid-cols-[88px_1fr_70px] gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-500">
                            <span>Type</span>
                            <span>Time</span>
                            <span className="text-right">Duration</span>
                          </div>
                          {callHistory.length ? (
                            <div className="divide-y divide-white/10">
                              {callHistory.map((session) => (
                                <div
                                  className="grid grid-cols-[88px_1fr_70px] items-center gap-2 px-3 py-2"
                                  key={session.id}
                                >
                                  <span className={`w-fit rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${session.callDirection === "OUTGOING" ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"}`}>
                                    {directionLabel(session.callDirection)}
                                  </span>
                                  <p className="truncate font-semibold text-slate-300">
                                    {formatDate(session.firstRingAt)}
                                  </p>
                                  <p className="text-right font-semibold text-slate-200">
                                    {formatDuration(session.durationSeconds)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="px-3 py-4 text-slate-500">No call sessions recorded.</p>
                          )}
                        </div>
                        {lead._count.sessions > callHistory.length ? (
                          <p className="text-[11px] text-slate-500">
                            Showing latest {callHistory.length} calls.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {lead.activities?.length ? (
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Latest Activity
                        </p>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {lead.activities.slice(0, 2).map((activity) => (
                            <div className="border-l border-cyan-300/30 pl-3" key={activity.id}>
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone="slate">{activity.actionType.replaceAll("_", " ")}</StatusBadge>
                                <span className="text-[11px] text-slate-500">{formatDate(activity.createdAt)}</span>
                              </div>
                              <p className="mt-1 leading-5 text-slate-300">{activity.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Fragment>
            );
          })}
          {!visibleLeads.length ? (
            <div className="px-4 py-8 text-sm text-slate-400">
              No call leads match this queue or search.
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col gap-3 border-t border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>
              Showing <strong className="text-slate-200">{firstVisibleLead}-{lastVisibleLead}</strong> of{" "}
              <strong className="text-slate-200">{totalLeads}</strong> leads
            </span>
            <label className="flex items-center gap-2">
              <span>Rows per page</span>
              <select
                aria-label="Rows per page"
                className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs font-semibold text-slate-200 outline-none focus:border-cyan-300"
                disabled={isPending}
                onChange={(event) =>
                  navigateWithParams({
                    pageSize: event.target.value === "25" ? null : event.target.value,
                    page: null,
                  })
                }
                value={pageSize}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>

          <nav aria-label="Call leads pagination" className="flex flex-wrap items-center gap-1">
            <button
              aria-label="Previous page"
              className="h-8 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage === 1 || isPending}
              onClick={() => goToPage(currentPage - 1)}
              type="button"
            >
              Previous
            </button>
            {paginationPages.map((page, pageIndex) => (
              <Fragment key={page}>
                {pageIndex > 0 && page - paginationPages[pageIndex - 1] > 1 ? (
                  <span className="px-1 text-xs text-slate-600">...</span>
                ) : null}
                <button
                  aria-current={page === currentPage ? "page" : undefined}
                  aria-label={"Page " + page}
                  className={
                    "grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-xs font-bold transition " +
                    (page === currentPage
                      ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 text-slate-400 hover:bg-white/10 hover:text-white")
                  }
                  disabled={isPending}
                  onClick={() => goToPage(page)}
                  type="button"
                >
                  {page}
                </button>
              </Fragment>
            ))}
            <button
              aria-label="Next page"
              className="h-8 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage === totalPages || isPending}
              onClick={() => goToPage(currentPage + 1)}
              type="button"
            >
              Next
            </button>
          </nav>
        </footer>
      </section>

      {manualOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setManualOpen(false)} />
          <section className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0e0f14] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Manual Lead</p>
                <h2 className="mt-1 text-xl font-bold text-white">Add call lead</h2>
              </div>
              <button
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:text-white"
                onClick={() => setManualOpen(false)}
                type="button"
              >
                x
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Name", manualName, setManualName],
                  ["Phone", manualPhone, setManualPhone],
                  ["Email", manualEmail, setManualEmail],
                  ["City / State", manualCity, setManualCity],
                  ["Language", manualLanguage, setManualLanguage],
                ].map(([label, value, setter]) => (
                  <label className="block" key={label as string}>
                    <span className="mb-2 block text-[11px] text-slate-400">{label as string}</span>
                    <input
                      className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                      onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                      value={value as string}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="mb-2 block text-[11px] text-slate-400">Own / Rental</span>
                  <select
                    className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                    onChange={(event) => setManualOwnership(event.target.value)}
                    value={manualOwnership}
                  >
                    <option value="">Not confirmed</option>
                    <option value="OWN">Own</option>
                    <option value="RENTAL">Rental</option>
                  </select>
                </label>
                <label className="flex h-10 items-center gap-3 self-end rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-slate-200">
                  <input
                    checked={manualLocationSent}
                    className="rounded border-white/10 bg-black/40"
                    onChange={(event) => setManualLocationSent(event.target.checked)}
                    type="checkbox"
                  />
                  Location sent
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-[11px] text-slate-400">Address</span>
                <textarea
                  className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                  onChange={(event) => setManualAddress(event.target.value)}
                  rows={3}
                  value={manualAddress}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] text-slate-400">Lead Message / Requirement</span>
                <textarea
                  className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                  onChange={(event) => setManualMessage(event.target.value)}
                  rows={3}
                  value={manualMessage}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] text-slate-400">Workflow Notes</span>
                <textarea
                  className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                  onChange={(event) => setManualNotes(event.target.value)}
                  rows={3}
                  value={manualNotes}
                />
              </label>

              <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
                <button
                  className="h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-300 transition hover:bg-white/10"
                  disabled={isPending}
                  onClick={() => setManualOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="h-10 rounded-lg bg-cyan-300 px-5 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
                  disabled={isPending || !manualPhone.trim()}
                  onClick={saveManualLead}
                  type="button"
                >
                  {isPending ? "Saving..." : "Save Lead"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeLead ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setActiveLead(null)} />
          <div className="relative z-10 flex h-full w-full flex-col border-l border-white/10 bg-[#0e0f14] shadow-2xl sm:max-w-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">
                  Call Lead Action Panel
                </p>
                <h2 className="mt-1 text-xl font-bold text-white">{activeLead.displayName}</h2>
              </div>
              <button
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:text-white"
                onClick={() => setActiveLead(null)}
                type="button"
              >
                x
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {error ? (
                <div className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-xs text-rose-200">
                  {error}
                </div>
              ) : null}
              {message ? (
                <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs text-emerald-200">
                  {message}
                </div>
              ) : null}
              {activeLead.sheetSyncWarning ? (
                <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs text-amber-200">
                  {activeLead.sheetSyncWarning}
                </div>
              ) : null}

              <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  Customer Data
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {[
                    ["Name", detailName, setDetailName],
                    ["Phone", detailPhone, setDetailPhone],
                    ["Email", detailEmail, setDetailEmail],
                    ["City / State", detailCity, setDetailCity],
                    ["Language", detailLanguage, setDetailLanguage],
                  ].map(([label, value, setter]) => (
                    <label className="block" key={label as string}>
                      <span className="mb-2 block text-[11px] text-slate-400">{label as string}</span>
                      <input
                        className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                        onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                        value={value as string}
                      />
                    </label>
                  ))}
                  <label className="block">
                    <span className="mb-2 block text-[11px] text-slate-400">Own / Rental</span>
                    <select
                      className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                      onChange={(event) => setDetailOwnership(event.target.value)}
                      value={detailOwnership}
                    >
                      <option value="">Not confirmed</option>
                      <option value="OWN">Own</option>
                      <option value="RENTAL">Rental</option>
                    </select>
                  </label>
                  <label className="flex h-10 items-center gap-3 self-end rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-slate-200">
                    <input
                      checked={detailLocationSent}
                      className="rounded border-white/10 bg-black/40"
                      onChange={(event) => setDetailLocationSent(event.target.checked)}
                      type="checkbox"
                    />
                    Location sent
                  </label>
                </div>
                <label className="mt-4 block">
                  <span className="mb-2 block text-[11px] text-slate-400">Address</span>
                  <textarea
                    className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                    onChange={(event) => setDetailAddress(event.target.value)}
                    rows={3}
                    value={detailAddress}
                  />
                </label>
                <label className="mt-4 block">
                  <span className="mb-2 block text-[11px] text-slate-400">Lead Message / Requirement</span>
                  <textarea
                    className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                    onChange={(event) => setDetailMessage(event.target.value)}
                    rows={3}
                    value={detailMessage}
                  />
                </label>
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  Follow-up Workflow
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[11px] text-slate-400">Status</span>
                    <select
                      className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                      onChange={(event) => setWorkflowStatus(event.target.value as CallLeadStatus)}
                      value={workflowStatus}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[11px] text-slate-400">Assign To</span>
                    <select
                      className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                      onChange={(event) => setWorkflowAssignee(event.target.value)}
                      value={workflowAssignee}
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.username}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-[11px] text-slate-400">Next Follow-up Date</span>
                    <input
                      className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                      onChange={(event) => setWorkflowFollowUp(event.target.value)}
                      type="datetime-local"
                      value={workflowFollowUp}
                    />
                  </label>
                </div>
                <label className="mt-4 block">
                  <span className="mb-2 block text-[11px] text-slate-400">Notes</span>
                  <textarea
                    className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-200 outline-none focus:border-cyan-300"
                    onChange={(event) => setWorkflowNotes(event.target.value)}
                    rows={3}
                    value={workflowNotes}
                  />
                </label>
              </section>

              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 text-xs font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
                disabled={isPending || isSavingPanel}
                onClick={saveLeadWorkflowAndSheet}
                type="button"
              >
                {isSavingPanel ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : null}
                {isSavingPanel ? "Saving..." : "Save Lead, Workflow & Sheet"}
              </button>

              <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  Recent Activity
                </h3>
                <div className="mt-4 space-y-3">
                  {activeLead.activities?.map((activity) => (
                    <div className="border-l border-cyan-300/30 pl-3" key={activity.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone="slate">{activity.actionType.replaceAll("_", " ")}</StatusBadge>
                        <span className="text-[11px] text-slate-500">{formatDate(activity.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-300">{activity.description}</p>
                    </div>
                  ))}
                  {!activeLead.activities?.length ? <p className="text-xs text-slate-500">No activity recorded yet.</p> : null}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
