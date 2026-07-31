import { db } from "@/app/lib/db";
import { expireStaleRingingCalls } from "@/app/lib/call-session-maintenance";
import { CallbacksPage } from "./callbacks-page";

export default async function AdminMissedCallsPage() {
  await expireStaleRingingCalls();

  const terminalLeadStatuses = ["CONVERTED", "CLOSED", "NOT_INTERESTED"] as const;
  const leadSelect = {
    id: true,
    displayName: true,
    phone: true,
    email: true,
    city: true,
    address: true,
    ownershipType: true,
    language: true,
    message: true,
    status: true,
    assignedToId: true,
    nextFollowUpAt: true,
    notes: true,
    createdAt: true,
    localContactName: true,
    _count: { select: { sessions: true } },
  };
  const [activeCalls, calls, agents] = await Promise.all([
    db.callSession.findMany({
      where: { status: { in: ["RINGING", "ANSWERED"] }, endedAt: null },
      include: {
        companyPhone: { select: { label: true, phoneNumber: true } },
        lead: { select: leadSelect },
        assignedTo: { select: { username: true } },
      },
      orderBy: { firstRingAt: "desc" },
      take: 25,
    }),
    db.callSession.findMany({
      where: { status: "MISSED", lead: { status: { notIn: [...terminalLeadStatuses] } } },
      include: {
        companyPhone: { select: { label: true, phoneNumber: true } },
        lead: { select: leadSelect },
        assignedTo: { select: { username: true } },
      },
      orderBy: { firstRingAt: "asc" },
      take: 100,
    }),
    db.user.findMany({
      where: { role: "USER", isActive: true },
      select: { id: true, username: true, email: true, department: true },
      orderBy: { username: "asc" },
    }),
  ]);

  return <CallbacksPage activeCalls={activeCalls} agents={agents} calls={calls} />;
}
