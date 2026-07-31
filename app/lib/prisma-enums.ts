import type {
  LeadActivityType as PrismaLeadActivityType,
  LeadSource as PrismaLeadSource,
  LeadStage as PrismaLeadStage,
  Role as PrismaRole,
  SheetConnectionStatus as PrismaSheetConnectionStatus,
  CallActivityType as PrismaCallActivityType,
  CallDirection as PrismaCallDirection,
  CallEventType as PrismaCallEventType,
  CallLeadStatus as PrismaCallLeadStatus,
  CallSessionStatus as PrismaCallSessionStatus,
  TaskPriority as PrismaTaskPriority,
  TaskStatus as PrismaTaskStatus,
  WhatsAppConnectionStatus as PrismaWhatsAppConnectionStatus,
  WhatsAppLeadStatus as PrismaWhatsAppLeadStatus,
} from "@prisma/client";

export type Role = PrismaRole;
export type TaskStatus = PrismaTaskStatus;
export type TaskPriority = PrismaTaskPriority;
export type LeadSource = PrismaLeadSource;
export type LeadStage = PrismaLeadStage;
export type LeadActivityType = PrismaLeadActivityType;
export type SheetConnectionStatus = PrismaSheetConnectionStatus;
export type CallEventType = PrismaCallEventType;
export type CallDirection = PrismaCallDirection;
export type CallSessionStatus = PrismaCallSessionStatus;
export type CallLeadStatus = PrismaCallLeadStatus;
export type CallActivityType = PrismaCallActivityType;
export type WhatsAppConnectionStatus = PrismaWhatsAppConnectionStatus;
export type WhatsAppLeadStatus = PrismaWhatsAppLeadStatus;

export const Role = {
  ADMIN: "ADMIN",
  USER: "USER",
} as const satisfies Record<PrismaRole, PrismaRole>;

export const TaskStatus = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<PrismaTaskStatus, PrismaTaskStatus>;

export const TaskPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const satisfies Record<PrismaTaskPriority, PrismaTaskPriority>;

export const LeadSource = {
  WEBSITE: "WEBSITE",
  INSTAGRAM: "INSTAGRAM",
  CALLS: "CALLS",
} as const satisfies Record<PrismaLeadSource, PrismaLeadSource>;

export const LeadStage = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  FOLLOW_UP: "FOLLOW_UP",
  INTERESTED: "INTERESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  NO_RESPONSE: "NO_RESPONSE",
  CONVERTED: "CONVERTED",
  CLOSED: "CLOSED",
} as const satisfies Record<PrismaLeadStage, PrismaLeadStage>;

export const LeadActivityType = {
  ASSIGNMENT_CHANGE: "ASSIGNMENT_CHANGE",
  STAGE_CHANGE: "STAGE_CHANGE",
  NOTE_ADDED: "NOTE_ADDED",
  FOLLOW_UP_UPDATE: "FOLLOW_UP_UPDATE",
  SYSTEM_SYNC: "SYSTEM_SYNC",
  CREATION: "CREATION",
} as const satisfies Record<PrismaLeadActivityType, PrismaLeadActivityType>;

export const SheetConnectionStatus = {
  NOT_CONNECTED: "NOT_CONNECTED",
  CONNECTED: "CONNECTED",
  ERROR: "ERROR",
} as const satisfies Record<
  PrismaSheetConnectionStatus,
  PrismaSheetConnectionStatus
>;

export const CallEventType = {
  RINGING: "RINGING",
  ANSWERED: "ANSWERED",
  ENDED: "ENDED",
  MISSED: "MISSED",
} as const satisfies Record<PrismaCallEventType, PrismaCallEventType>;

export const CallDirection = {
  INCOMING: "INCOMING",
  OUTGOING: "OUTGOING",
  UNKNOWN: "UNKNOWN",
} as const satisfies Record<PrismaCallDirection, PrismaCallDirection>;

export const CallSessionStatus = {
  RINGING: "RINGING",
  ANSWERED: "ANSWERED",
  MISSED: "MISSED",
  COMPLETED: "COMPLETED",
} as const satisfies Record<PrismaCallSessionStatus, PrismaCallSessionStatus>;

export const CallLeadStatus = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  FOLLOW_UP: "FOLLOW_UP",
  INTERESTED: "INTERESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  NO_RESPONSE: "NO_RESPONSE",
  CONVERTED: "CONVERTED",
  CLOSED: "CLOSED",
} as const satisfies Record<PrismaCallLeadStatus, PrismaCallLeadStatus>;

export const CallActivityType = {
  CALL_CREATED: "CALL_CREATED",
  CALL_RINGING: "CALL_RINGING",
  CALL_ANSWERED: "CALL_ANSWERED",
  CALL_MISSED: "CALL_MISSED",
  CALL_COMPLETED: "CALL_COMPLETED",
  ASSIGNMENT_CHANGE: "ASSIGNMENT_CHANGE",
  NOTE_ADDED: "NOTE_ADDED",
  FOLLOW_UP_UPDATE: "FOLLOW_UP_UPDATE",
  WHATSAPP_QUEUED: "WHATSAPP_QUEUED",
  WHATSAPP_SENDING: "WHATSAPP_SENDING",
  WHATSAPP_SENT: "WHATSAPP_SENT",
  WHATSAPP_OPENED: "WHATSAPP_OPENED",
  WHATSAPP_FAILED: "WHATSAPP_FAILED",
  FORM_STARTED: "FORM_STARTED",
  FORM_SUBMITTED: "FORM_SUBMITTED",
  ARCHIVED: "ARCHIVED",
} as const satisfies Record<PrismaCallActivityType, PrismaCallActivityType>;

export const WhatsAppConnectionStatus = {
  DISCONNECTED: "DISCONNECTED",
  QR_REQUIRED: "QR_REQUIRED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  ERROR: "ERROR",
  PAUSED: "PAUSED",
} as const satisfies Record<
  PrismaWhatsAppConnectionStatus,
  PrismaWhatsAppConnectionStatus
>;

export const WhatsAppLeadStatus = {
  NEW: "NEW",
  OPTED_IN: "OPTED_IN",
  QUEUED: "QUEUED",
  SENDING: "SENDING",
  SENT: "SENT",
  OPENED: "OPENED",
  FORM_STARTED: "FORM_STARTED",
  FORM_SUBMITTED: "FORM_SUBMITTED",
  ASSIGNED: "ASSIGNED",
  FOLLOW_UP: "FOLLOW_UP",
  INTERESTED: "INTERESTED",
  CONVERTED: "CONVERTED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  REPLIED: "REPLIED",
  DO_NOT_CONTACT: "DO_NOT_CONTACT",
} as const satisfies Record<PrismaWhatsAppLeadStatus, PrismaWhatsAppLeadStatus>;
