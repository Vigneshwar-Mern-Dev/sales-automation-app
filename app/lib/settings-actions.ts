"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/lib/db";
import { hashPassword, verifyPassword } from "@/app/lib/password";
import { passwordPolicyError } from "@/app/lib/password-policy";
import { createSession, requireRole } from "@/app/lib/session";

export async function changePasswordAction(formData: FormData) {
  const user = await requireRole("ADMIN");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All fields are required." };
  }

  const policyError = passwordPolicyError(newPassword);
  if (policyError) {
    return { error: policyError };
  }

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!dbUser || !(await verifyPassword(currentPassword, dbUser.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  const passwordHash = await hashPassword(newPassword);
  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      sessionVersion: { increment: 1 },
    },
    select: { id: true, role: true, sessionVersion: true },
  });

  await createSession(updatedUser);
  revalidatePath("/admin/settings");

  return { success: true };
}