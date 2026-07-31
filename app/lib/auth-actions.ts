"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { verifyPassword } from "./password";
import { hasPrismaCode } from "./prisma-utils";
import { consumeRateLimit, rateLimitKey, resetRateLimit } from "./rate-limit";
import { getClientIpFromHeaders } from "./request-ip";
import { createSession, destroySession } from "./session";

const loginWindowMs = 10 * 60 * 1000;

function formValue(formData: FormData, key: string, trim = true) {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }

  return trim ? value.trim() : value;
}

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}



function handleDatabaseError(path: string, error: unknown): never {
  if (hasPrismaCode(error, "P1001")) {
    redirectWithError(
      path,
      "Database connection failed. Check your internet connection or Neon database status, then try again.",
    );
  }

  throw error;
}

export async function loginAction(formData: FormData) {
  const identifier = formValue(formData, "identifier").toLowerCase();
  const password = formValue(formData, "password", false);

  if (!identifier || !password) {
    redirectWithError("/login", "Enter your username or email and password.");
  }

  const ipAddress = getClientIpFromHeaders(await headers());
  const ipKey = rateLimitKey("login-ip", ipAddress);
  const accountIpKey = rateLimitKey("login-account-ip", identifier, ipAddress);

  try {
    const [ipLimit, accountIpLimit] = await Promise.all([
      consumeRateLimit({ key: ipKey, limit: 30, windowMs: loginWindowMs }),
      consumeRateLimit({
        key: accountIpKey,
        limit: 5,
        windowMs: loginWindowMs,
        blockMs: loginWindowMs,
      }),
    ]);

    if (!ipLimit.allowed || !accountIpLimit.allowed) {
      redirectWithError(
        "/login",
        "Too many login attempts from this network. Wait a few minutes, then try again.",
      );
    }

    const user = await db.user.findFirst({
      where: {
        isActive: true,
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      redirectWithError(
        "/login",
        "We could not sign you in. Check your details or contact your CRM administrator.",
      );
    }

    await resetRateLimit(accountIpKey);
    await createSession(user);
    redirect(user.role === "ADMIN" ? "/admin" : "/user");
  } catch (error) {
    handleDatabaseError("/login", error);
  }
}

export async function registerAction() {
  redirectWithError("/login", "Public registration is disabled on this platform.");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}