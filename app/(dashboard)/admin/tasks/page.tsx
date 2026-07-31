import type { Prisma } from "@prisma/client";
import {
  addTaskCommentAction,
  changeTaskStatusAction,
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "@/app/lib/task-actions";
import { db } from "@/app/lib/db";
import { TASK_LIST_LIMIT } from "@/app/lib/query-limits";
import { TaskPriority, TaskStatus } from "@/app/lib/prisma-enums";

type AdminTasksPageProps = {
  searchParams: Promise<{
    commented?: string;
    created?: string;
    deleted?: string;
    error?: string;
    status?: string;
    statusUpdated?: string;
    updated?: string;
    user?: string;
  }>;
};

const statusOptions = Object.values(TaskStatus);
const priorityOptions = Object.values(TaskPriority);

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function isOverdue(status: TaskStatus, dueDate: Date | null) {
  return (
    Boolean(dueDate) &&
    dueDate! < new Date() &&
    status !== "COMPLETED" &&
    status !== "CANCELLED"
  );
}

function statusClass(status: TaskStatus) {
  const classes: Record<TaskStatus, string> = {
    PENDING: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    IN_PROGRESS: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    COMPLETED: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    CANCELLED: "border-rose-300/20 bg-rose-300/10 text-rose-100",
  };

  return classes[status];
}

function priorityClass(priority: TaskPriority) {
  const classes: Record<TaskPriority, string> = {
    LOW: "text-slate-300",
    MEDIUM: "text-cyan-100",
    HIGH: "text-amber-100",
    URGENT: "text-rose-100",
  };

  return classes[priority];
}

async function getTaskData(status?: string, userId?: string) {
  const where: Prisma.TaskWhereInput = {};

  if (statusOptions.includes(status as TaskStatus)) {
    where.status = status as TaskStatus;
  }

  if (userId) {
    where.assignedToId = userId;
  }

  try {
    const [users, tasks] = await Promise.all([
      db.user.findMany({
        where: { isActive: true },
        orderBy: { username: "asc" },
        select: { id: true, username: true, email: true, role: true, department: true },
      }),
      db.task.findMany({
        where,
        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
        take: TASK_LIST_LIMIT,
        include: {
          assignedTo: { select: { id: true, username: true, email: true } },
          assignedBy: { select: { username: true } },
          comments: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { author: { select: { username: true } } },
          },
        },
      }),
    ]);

    return { users, tasks, error: null };
  } catch {
    return {
      users: [],
      tasks: [],
      error: "Database is unreachable. Task Manager cannot load tasks right now.",
    };
  }
}

export default async function AdminTasksPage({
  searchParams,
}: AdminTasksPageProps) {
  const params = await searchParams;
  const { users, tasks, error } = await getTaskData(params.status, params.user);
  const overdueCount = tasks.filter((task) =>
    isOverdue(task.status, task.dueDate),
  ).length;
  const notice =
    params.created === "1"
      ? "Task created."
      : params.updated === "1"
        ? "Task updated."
        : params.deleted === "1"
          ? "Task deleted."
          : params.statusUpdated === "1"
            ? "Task status updated."
            : params.commented === "1"
              ? "Progress note added."
              : null;

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Task Manager
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Create, assign, edit, delete, filter, and track admin work across
            all users.
          </p>
        </div>
        <div className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {overdueCount} overdue
        </div>
      </section>

      {params.error || error ? (
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {params.error ?? error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <form
          action={createTaskAction}
          className="rounded-lg border border-white/10 bg-white/[0.03] p-5"
        >
          <h2 className="text-lg font-semibold">Create task</h2>
          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">Title</span>
              <input
                className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-300"
                name="title"
                placeholder="Follow up with new lead"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">
                Description
              </span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-cyan-300"
                name="description"
                placeholder="Add context, expected outcome, or notes."
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-400">
                  Assign to
                </span>
                <select
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-300"
                  name="assignedToId"
                  required
                >
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({user.role === "ADMIN" ? "Admin" : user.department})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-400">
                  Due date
                </span>
                <input
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-300"
                  name="dueDate"
                  type="date"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-400">Status</span>
                <select
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-300"
                  name="status"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-400">
                  Priority
                </span>
                <select
                  className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-300"
                  name="priority"
                  defaultValue="MEDIUM"
                >
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {label(priority)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              className="h-11 rounded-lg bg-cyan-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
              type="submit"
            >
              Create task
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold">Filters</h2>
          <form className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">Status</span>
              <select
                className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none"
                defaultValue={params.status ?? ""}
                name="status"
              >
                <option value="">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">User</span>
              <select
                className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none"
                defaultValue={params.user ?? ""}
                name="user"
              >
                <option value="">All users</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username} ({user.role === "ADMIN" ? "Admin" : user.department})
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <button
                className="h-11 flex-1 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                type="submit"
              >
                Apply
              </button>
              <a
                className="grid h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 place-items-center transition hover:bg-white/10"
                href="/admin/tasks"
              >
                Reset
              </a>
            </div>
          </form>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {statusOptions.map((status) => (
              <div
                className="rounded-lg border border-white/10 bg-black/20 p-4"
                key={status}
              >
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {label(status)}
                </p>
                <p className="mt-3 text-2xl font-bold">
                  {tasks.filter((task) => task.status === status).length}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {tasks.length ? (
          tasks.map((task) => {
            const overdue = isOverdue(task.status, task.dueDate);

            return (
              <article
                className="rounded-lg border border-white/10 bg-white/[0.03] p-5"
                key={task.id}
              >
                <div className="flex flex-col justify-between gap-4 xl:flex-row">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{task.title}</h2>
                      <span
                        className={`rounded-lg border px-2 py-1 text-xs font-semibold ${statusClass(task.status)}`}
                      >
                        {label(task.status)}
                      </span>
                      <span
                        className={`rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}
                      >
                        {label(task.priority)}
                      </span>
                      {overdue ? (
                        <span className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-2 py-1 text-xs font-semibold text-rose-100">
                          Overdue
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Assigned to {task.assignedTo.username} by{" "}
                      {task.assignedBy.username}
                      {task.dueDate
                        ? ` | Due ${task.dueDate.toLocaleDateString("en-IN")}`
                        : " | No due date"}
                    </p>
                    {task.description ? (
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                        {task.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form action={changeTaskStatusAction}>
                      <input name="taskId" type="hidden" value={task.id} />
                      <input name="status" type="hidden" value="COMPLETED" />
                      <button
                        className="h-10 rounded-lg border border-emerald-300/20 px-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/10"
                        type="submit"
                      >
                        Complete
                      </button>
                    </form>
                    <form action={deleteTaskAction}>
                      <input name="taskId" type="hidden" value={task.id} />
                      <button
                        className="h-10 rounded-lg border border-rose-300/20 px-3 text-sm font-semibold text-rose-100 hover:bg-rose-300/10"
                        type="submit"
                        onClick={(e) => {
                          if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) e.preventDefault();
                        }}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                <details className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-cyan-100">
                    Edit task
                  </summary>
                  <form action={updateTaskAction} className="mt-4 grid gap-4">
                    <input name="taskId" type="hidden" value={task.id} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-400">
                          Title
                        </span>
                        <input
                          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
                          defaultValue={task.title}
                          name="title"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-400">
                          Assign to
                        </span>
                        <select
                          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
                          defaultValue={task.assignedToId}
                          name="assignedToId"
                        >
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.username} ({user.role === "ADMIN" ? "Admin" : user.department})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Description
                      </span>
                      <textarea
                        className="min-h-20 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none"
                        defaultValue={task.description ?? ""}
                        name="description"
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-400">
                          Status
                        </span>
                        <select
                          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
                          defaultValue={task.status}
                          name="status"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {label(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-400">
                          Priority
                        </span>
                        <select
                          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
                          defaultValue={task.priority}
                          name="priority"
                        >
                          {priorityOptions.map((priority) => (
                            <option key={priority} value={priority}>
                              {label(priority)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-400">
                          Due date
                        </span>
                        <input
                          className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none"
                          defaultValue={formatDateInput(task.dueDate)}
                          name="dueDate"
                          type="date"
                        />
                      </label>
                    </div>

                    <button
                      className="h-10 w-fit rounded-lg bg-cyan-300 px-4 text-sm font-bold text-slate-950"
                      type="submit"
                    >
                      Save changes
                    </button>
                  </form>
                </details>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300">
                      Recent progress notes
                    </h3>
                    <div className="mt-3 space-y-2">
                      {task.comments.length ? (
                        task.comments.map((comment) => (
                          <div
                            className="rounded-lg border border-white/10 bg-black/20 p-3"
                            key={comment.id}
                          >
                            <p className="text-sm text-slate-200">
                              {comment.body}
                            </p>
                            <p className="mt-2 text-xs text-slate-500">
                              {comment.author.username} |{" "}
                              {comment.createdAt.toLocaleString("en-IN")}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">No notes yet.</p>
                      )}
                    </div>
                  </div>

                  <form action={addTaskCommentAction}>
                    <input name="taskId" type="hidden" value={task.id} />
                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-400">
                        Add note
                      </span>
                      <textarea
                        className="min-h-24 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none"
                        name="body"
                        placeholder="Write a progress note..."
                        required
                      />
                    </label>
                    <button
                      className="mt-3 h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10"
                      type="submit"
                    >
                      Add note
                    </button>
                  </form>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 p-10 text-center text-slate-500">
            No tasks found.
          </div>
        )}
      </section>
    </div>
  );
}
