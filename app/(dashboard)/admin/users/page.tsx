import { db } from "@/app/lib/db";
import { CreateUserButton } from "./CreateUserButton";
import { UserRowActions } from "./UserRowActions";
import { getCurrentUser } from "@/app/lib/session";

type UserListItem = {
  id: string;
  username: string;
  email: string;
  role: "ADMIN" | "USER";
  department: string;
  isActive: boolean;
  createdAt: Date;
};

type CurrentUser = {
  id: string;
  username: string;
  email: string;
  role: "ADMIN" | "USER";
} | null;

async function getUsers() {
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        department: true,
        isActive: true,
        createdAt: true,
      },
    });

    return { users, error: null };
  } catch {
    return {
      users: [],
      error: "Database is unreachable. User list cannot be loaded right now.",
    };
  }
}

function UserTable({
  title,
  subtitle,
  users,
  currentUser,
  borderColor,
  badgeTone,
}: {
  title: string;
  subtitle: string;
  users: UserListItem[];
  currentUser: CurrentUser;
  borderColor: string;
  badgeTone: string;
}) {
  return (
    <section className={`overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] border-l-4 ${borderColor} transition-all duration-200 hover:border-cyan-500/30`}>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="font-semibold text-white tracking-tight flex items-center gap-2">
            <span>{title}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${badgeTone}`}>
              {users.length} {users.length === 1 ? "account" : "accounts"}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-5 py-4">User</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4">Role</th>
              <th className="px-5 py-4">Created</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.length ? (
              users.map((user) => (
                <tr className="text-slate-300 transition hover:bg-white/[0.01]" key={user.id}>
                  <td className="px-5 py-4 font-medium text-white">
                    {user.username}
                  </td>
                  <td className="px-5 py-4 text-slate-400">{user.email}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-100">
                        {user.role}
                      </span>
                      {!user.isActive ? (
                        <span className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-xs font-semibold text-amber-200">
                          INACTIVE
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-400">
                    {user.createdAt.toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-2">
                    <UserRowActions user={user} currentUserId={currentUser?.id} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-8 text-center text-slate-500 italic" colSpan={5}>
                  No accounts registered in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AdminUsersPage() {
  const { users, error } = await getUsers();
  const currentUser = await getCurrentUser();

  // 1. Partition admins
  const admins = users.filter((u) => u.role === "ADMIN");

  // 2. Partition standard users (role === "USER")
  const standardUsers = users.filter((u) => u.role === "USER");

  // 3. Dynamically group standard users by department
  const groupsMap: Record<string, UserListItem[]> = {};
  standardUsers.forEach((u) => {
    const dept = u.department || "Other";
    if (!groupsMap[dept]) {
      groupsMap[dept] = [];
    }
    groupsMap[dept].push(u);
  });

  // Get dynamic departments list, sorted alphabetically, with "Other" last
  const departments = Object.keys(groupsMap).sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Users</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Provision and manage registered accounts, dynamically grouped and displayable by departments.
          </p>
        </div>
        <div className="shrink-0 sm:mt-1">
          <CreateUserButton />
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        {/* Render Administrators if present */}
        {admins.length > 0 && (
          <UserTable
            title="Administrators"
            subtitle="Full access control and system configuration privileges"
            users={admins}
            currentUser={currentUser}
            borderColor="border-l-rose-500"
            badgeTone="bg-rose-500/10 text-rose-300 border border-rose-500/20"
          />
        )}

        {/* Dynamically render a table for each department that actually has users */}
        {departments.map((dept) => {
          const deptUsers = groupsMap[dept];
          
          let borderColor = "border-l-slate-400";
          let badgeTone = "bg-slate-400/10 text-slate-300 border border-slate-500/20";
          
          if (dept === "Telecalling") {
            borderColor = "border-l-teal-400";
            badgeTone = "bg-teal-400/10 text-teal-300 border border-teal-400/20";
          } else if (dept === "Video Editing") {
            borderColor = "border-l-purple-400";
            badgeTone = "bg-purple-400/10 text-purple-300 border border-purple-400/20";
          } else if (dept === "Designing") {
            borderColor = "border-l-amber-400";
            badgeTone = "bg-amber-400/10 text-amber-300 border border-amber-400/20";
          } else if (dept === "Sales") {
            borderColor = "border-l-cyan-400";
            badgeTone = "bg-cyan-400/10 text-cyan-300 border border-cyan-400/20";
          } else {
            // High-end vibrant indigo fallback for custom manual-typed departments
            borderColor = "border-l-indigo-400";
            badgeTone = "bg-indigo-400/10 text-indigo-300 border border-indigo-400/20";
          }

          return (
            <UserTable
              key={dept}
              title={`${dept} Team`}
              subtitle={`Accounts assigned to the ${dept.toLowerCase()} department`}
              users={deptUsers}
              currentUser={currentUser}
              borderColor={borderColor}
              badgeTone={badgeTone}
            />
          );
        })}

        {/* Global Empty State fallback if database is completely empty */}
        {users.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/10 p-10 text-center text-slate-500">
            No registered users found in the database.
          </div>
        )}
      </div>
    </div>
  );
}
