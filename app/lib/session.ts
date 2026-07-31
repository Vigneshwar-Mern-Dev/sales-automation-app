import "server-only";

import type { Role } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const sessionCookieName = "crm_session";
const sessionDurationMs = 1000 * 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  role: Role;
  sessionVersion: number;
  expiresAt: number;
};

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      return "development-only-auth-secret-change-before-production";
    }

    throw new Error("AUTH_SECRET must be set for sessions.");
  }

  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters long.");
  }

  return secret;
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function isValidSignature(signature: string, expectedSignature: string) {
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  return (
    signatureBuffer.length === expectedBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedBuffer)
  );
}

export async function createSession(user: {
  id: string;
  role: Role;
  sessionVersion: number;
}) {
  const expiresAt = Date.now() + sessionDurationMs;
  const payload: SessionPayload = {
    userId: user.id,
    role: user.role,
    sessionVersion: user.sessionVersion,
    expiresAt,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  (await cookies()).set(sessionCookieName, `${encodedPayload}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function destroySession() {
  (await cookies()).delete(sessionCookieName);
}

export async function readSession() {
  const sessionCookie = (await cookies()).get(sessionCookieName)?.value;

  if (!sessionCookie) {
    return null;
  }

  const [encodedPayload, signature] = sessionCookie.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);

  if (!isValidSignature(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;

    if (
      !payload.userId ||
      !Number.isInteger(payload.sessionVersion) ||
      payload.sessionVersion < 1 ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await readSession();

  if (!session) {
    return null;
  }

  const user = await db.user.findFirst({
    where: { id: session.userId, isActive: true },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      sessionVersion: true,
    },
  });

  if (!user || user.sessionVersion !== session.sessionVersion) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(role: Role) {
  const user = await requireUser();

  if (user.role !== role) {
    redirect(user.role === "ADMIN" ? "/admin" : "/user");
  }

  return user;
}