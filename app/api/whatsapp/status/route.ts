import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { requireApiRole, hasValidBridgeToken } from "@/app/lib/api-auth";
import { withApiErrorHandling } from "@/app/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return withApiErrorHandling<unknown>(
    {
      route: "/api/whatsapp/status",
      method: "GET",
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip"),
    },
    async () => {
      if (!hasValidBridgeToken(request)) {
        await requireApiRole("ADMIN");
      }

      const url = new URL(request.url);
      const accountId = url.searchParams.get("accountId");

      if (accountId) {
        // Return status for a specific account
        const account = await db.whatsAppAccount.findUnique({
          where: { id: accountId },
          select: {
            id: true,
            label: true,
            status: true,
            qrCodeData: true,
            phoneNumber: true,
            lastConnectedAt: true,
            lastHeartbeatAt: true,
            updatedAt: true,
          },
        });

        if (!account) {
          return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
        }

        return NextResponse.json({
          ok: true,
          ...account,
        });
      }

      // Return all accounts
      const accounts = await db.whatsAppAccount.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          label: true,
          status: true,
          qrCodeData: true,
          phoneNumber: true,
          lastConnectedAt: true,
          lastHeartbeatAt: true,
          updatedAt: true,
        },
      });

      // Backward compatible: also return top-level fields from the first account
      const primary = accounts[0] ?? null;

      return NextResponse.json({
        ok: true,
        accounts,
        // Backward compatibility
        status: primary?.status ?? "DISCONNECTED",
        qrCodeData: primary?.qrCodeData ?? null,
        phoneNumber: primary?.phoneNumber ?? null,
        lastConnectedAt: primary?.lastConnectedAt ?? null,
        updatedAt: primary?.updatedAt ?? null,
      });
    },
  );
}
