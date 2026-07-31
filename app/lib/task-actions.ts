"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { TaskPriority, TaskStatus } from "./prisma-enums";
import { requireRole, requireUser } from "./session";

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalFormValue(formData: FormData, key: string) {
  const value = formValue(formData, key);
  return value || null;
}

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parseTaskStatus(value: string) {
  if (Object.values(TaskStatus).includes(value as TaskStatus)) {
    return value as TaskStatus;
  }

  return TaskStatus.PENDING;
}

function parseTaskPriority(value: string) {
  if (Object.values(TaskPriority).includes(value as TaskPriority)) {
    return value as TaskPriority;
  }

  return TaskPriority.MEDIUM;
}

function parseDueDate(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function taskRedirectPath(role: string) {
  return role === "ADMIN" ? "/admin/tasks" : "/user/tasks";
}

async function requireTaskAccess(taskId: string) {
  const user = await requireUser();
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, assignedToId: true },
  });

  if (!task) {
    redirectWithError(taskRedirectPath(user.role), "Task not found.");
  }

  if (user.role !== "ADMIN" && task.assignedToId !== user.id) {
    redirectWithError("/user/tasks", "You can only update tasks assigned to you.");
  }

  return user;
}

export async function createTaskAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const title = formValue(formData, "title");
  const description = optionalFormValue(formData, "description");
  const assignedToId = formValue(formData, "assignedToId");
  const status = parseTaskStatus(formValue(formData, "status"));
  const priority = parseTaskPriority(formValue(formData, "priority"));
  const dueDate = parseDueDate(formValue(formData, "dueDate"));

  if (!title || !assignedToId) {
    redirectWithError("/admin/tasks", "Task title and assigned user are required.");
  }

  const assignedUser = await db.user.findFirst({
    where: { id: assignedToId, isActive: true },
    select: { id: true },
  });

  if (!assignedUser) {
    redirectWithError("/admin/tasks", "Assigned user does not exist.");
  }

  await db.task.create({
    data: {
      title,
      description,
      assignedToId,
      assignedById: admin.id,
      status,
      priority,
      dueDate,
    },
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/user/tasks");
  redirect("/admin/tasks?created=1");
}

export async function updateTaskAction(formData: FormData) {
  await requireRole("ADMIN");

  const taskId = formValue(formData, "taskId");
  const title = formValue(formData, "title");
  const assignedToId = formValue(formData, "assignedToId");

  if (!taskId || !title || !assignedToId) {
    redirectWithError("/admin/tasks", "Task, title, and assigned user are required.");
  }

  const assignedUser = await db.user.findFirst({
    where: { id: assignedToId, isActive: true },
    select: { id: true },
  });

  if (!assignedUser) {
    redirectWithError("/admin/tasks", "Assigned user does not exist or is inactive.");
  }

  await db.task.update({
    where: { id: taskId },
    data: {
      title,
      description: optionalFormValue(formData, "description"),
      assignedToId,
      status: parseTaskStatus(formValue(formData, "status")),
      priority: parseTaskPriority(formValue(formData, "priority")),
      dueDate: parseDueDate(formValue(formData, "dueDate")),
    },
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/user/tasks");
  redirect("/admin/tasks?updated=1");
}

export async function deleteTaskAction(formData: FormData) {
  await requireRole("ADMIN");

  const taskId = formValue(formData, "taskId");

  if (!taskId) {
    redirectWithError("/admin/tasks", "Task id is required.");
  }

  await db.task.delete({ where: { id: taskId } });

  revalidatePath("/admin/tasks");
  revalidatePath("/user/tasks");
  redirect("/admin/tasks?deleted=1");
}

export async function changeTaskStatusAction(formData: FormData) {
  const taskId = formValue(formData, "taskId");
  const status = parseTaskStatus(formValue(formData, "status"));

  if (!taskId) {
    redirectWithError("/user/tasks", "Task id is required.");
  }

  const user = await requireTaskAccess(taskId);

  await db.task.update({
    where: { id: taskId },
    data: { status },
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/user/tasks");
  redirect(`${taskRedirectPath(user.role)}?statusUpdated=1`);
}

export async function addTaskCommentAction(formData: FormData) {
  const taskId = formValue(formData, "taskId");
  const body = formValue(formData, "body");

  if (!taskId || !body) {
    redirectWithError("/user/tasks", "Task and note are required.");
  }

  const user = await requireTaskAccess(taskId);

  await db.taskComment.create({
    data: {
      taskId,
      authorId: user.id,
      body,
    },
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/user/tasks");
  redirect(`${taskRedirectPath(user.role)}?commented=1`);
}
