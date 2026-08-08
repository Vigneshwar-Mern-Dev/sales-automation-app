import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { WhatsAppConnectionStatus } from "@/app/lib/prisma-enums";
import { validateBody } from "@/app/lib/validators/validate";
import { whatsappBridgePayloadSchema } from "@/app/lib/validators/whatsapp";
import { resolveBridgeStatus } from "@/app/lib/whatsapp-bridge-state";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const expectedToken = process.env.WHATSAPP_BRIDGE_TOKEN;
  const token = request.headers.get("x-whatsapp-bridge-token");

  if (!expectedToken || token !== expectedToken) {
    return unauthorized();
  }

  const validation = await validateBody(request, whatsappBridgePayloadSchema);
  if (!validation.success) {
    return validation.response;
  }

  const payload = validation.data;
  const status = payload.status;

  // Account creation is admin-only. The bridge must reference an existing account.
  // If accountId is provided, look it up. Otherwise fall back to the first account
  // for backward compatibility with single-account setups.
  const account = payload.accountId
    ? await db.whatsAppAccount.findUnique({ where: { id: payload.accountId } })
    : await db.whatsAppAccount.findFirst({ orderBy: { createdAt: "asc" } });

  if (!account) {
    return NextResponse.json(
      {
        error: payload.accountId
          ? `Account ${payload.accountId} not found. Create it from the admin panel.`
          : "No WhatsApp account exists. Create one from the admin panel first.",
      },
      { status: 404 },
    );
  }

  const updated = await db.whatsAppAccount.update({
    where: { id: account.id },
    data: {
      status: resolveBridgeStatus(account.status, status, payload.heartbeatOnly === true),
      qrCodeData: payload.heartbeatOnly ? undefined : payload.qrCodeData,
      phoneNumber: payload.phoneNumber,
      lastError: payload.heartbeatOnly ? undefined : payload.lastError,
      lastConnectedAt: status === WhatsAppConnectionStatus.CONNECTED ? new Date() : undefined,
      // Update heartbeat on every bridge call so the picker knows the worker is alive
      lastHeartbeatAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      phoneNumber: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, account: updated });
}
