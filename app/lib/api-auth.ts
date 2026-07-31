import type { Role } from "@prisma/client";
import { AppError } from "./api-errors";
import { getCurrentUser } from "./session";

export async function requireApiUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new AppError("Authentication required.", 401, { code: "UNAUTHORIZED" });
  }

  return user;
}

export async function requireApiRole(role: Role) {
  const user = await requireApiUser();

  if (user.role !== role) {
    throw new AppError("You do not have permission to access this resource.", 403, {
      code: "FORBIDDEN",
    });
  }

  return user;
}

export function hasValidBridgeToken(request: Request) {
  const expectedToken = process.env.WHATSAPP_BRIDGE_TOKEN;
  const token = request.headers.get("x-whatsapp-bridge-token");

  return Boolean(expectedToken && token && token === expectedToken);
}
