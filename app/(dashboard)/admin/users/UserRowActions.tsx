"use client";

import { useState } from "react";
import {
  adminDeleteUserAction,
  adminEditUserAction,
  adminRestoreUserAction,
} from "@/app/lib/admin-actions";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from "@/app/lib/password-policy";

type UserRowActionsProps = {
  user: {
    id: string;
    username: string;
    email: string;
    role: "ADMIN" | "USER";
    department: string;
    isActive: boolean;
  };
  currentUserId: string | undefined;
};

export function UserRowActions({ user, currentUserId }: UserRowActionsProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Edit states
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"ADMIN" | "USER">(user.role);
  const [department, setDepartment] = useState(user.department);
  const [isCustomDept, setIsCustomDept] = useState(
    user.department !== "Telecalling" && user.department !== "Video Editing"
  );
  const [customDeptText, setCustomDeptText] = useState(
    user.department !== "Telecalling" && user.department !== "Video Editing" ? user.department : ""
  );

  const handleDepartmentChange = (val: string) => {
    if (val === "CUSTOM") {
      setIsCustomDept(true);
    } else {
      setIsCustomDept(false);
      setDepartment(val);
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!username.trim() || !email.trim()) {
      setError("Username and email are required.");
      setIsLoading(false);
      return;
    }

    const policyError = password ? passwordPolicyError(password) : null;
    if (policyError) {
      setError(policyError);
      setIsLoading(false);
      return;
    }

    const finalDepartment = isCustomDept ? customDeptText.trim() : department;
    if (isCustomDept && !customDeptText.trim()) {
      setError("Please specify your custom department.");
      setIsLoading(false);
      return;
    }

    try {
      const result = await adminEditUserAction({
        id: user.id,
        username,
        email,
        password: password || undefined,
        role,
        department: finalDepartment,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          setIsEditOpen(false);
          setSuccess(false);
          setPassword("");
        }, 1500);
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await adminDeleteUserAction(user.id);

      if (result.error) {
        setError(result.error);
        setIsLoading(false);
      } else {
        setIsDeleteOpen(false);
        setIsLoading(false);
      }
    } catch {
      setError("An unexpected error occurred.");
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await adminRestoreUserAction(user.id);
      if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseEdit = () => {
    setIsEditOpen(false);
    setError(null);
    setShowPassword(false);
    setUsername(user.username);
    setEmail(user.email);
    setPassword("");
    setRole(user.role);
    const isCustom = user.department !== "Telecalling" && user.department !== "Video Editing";
    setDepartment(user.department);
    setIsCustomDept(isCustom);
    setCustomDeptText(isCustom ? user.department : "");
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsEditOpen(true)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-cyan-400 transition cursor-pointer"
          title="Edit account"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>

        {user.isActive ? (
          <button
            onClick={() => setIsDeleteOpen(true)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition cursor-pointer"
            title="Deactivate account"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        ) : (
          <button
            disabled={isLoading}
            onClick={handleRestore}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
            title="Restore account"
          >
            Restore
          </button>
        )}
      </div>

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => !isLoading && handleCloseEdit()} className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300" />
          <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#0c0f17] p-6 shadow-2xl transition-all duration-300 hover:border-cyan-500/30 text-left">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
            
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Edit Account</h3>
                <p className="text-xs text-slate-400 mt-1">Modify details for {user.username}.</p>
              </div>
              <button disabled={isLoading} onClick={handleCloseEdit} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50 cursor-pointer">
                <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{error}</div>}

            {success ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-white">Account Updated Successfully</h4>
                <p className="mt-1 text-xs text-slate-400">Refreshing registry...</p>
              </div>
            ) : (
              <form onSubmit={handleEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    disabled={isLoading}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 transition focus:border-cyan-400 focus:bg-white/[0.06] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 transition focus:border-cyan-400 focus:bg-white/[0.06] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                    <span>New Password</span>
                    <span className="text-[10px] text-slate-500 font-normal lowercase tracking-normal">leave blank to keep current</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      disabled={isLoading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={password ? PASSWORD_MIN_LENGTH : undefined}
                      maxLength={PASSWORD_MAX_LENGTH}
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-3 pr-10 py-2 text-sm text-white placeholder-slate-500 transition focus:border-cyan-400 focus:bg-white/[0.06] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition focus:outline-none cursor-pointer p-1"
                    >
                      {showPassword ? (
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Access Role</label>
                  <select
                    disabled={isLoading}
                    value={role}
                    onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")}
                    className="w-full rounded-lg border border-white/10 bg-[#0c0f17] px-3 py-2 text-sm text-white transition focus:border-cyan-400 focus:outline-none cursor-pointer"
                  >
                    <option value="USER" className="bg-[#0c0f17]">USER (Standard Account)</option>
                    <option value="ADMIN" className="bg-[#0c0f17]">ADMIN (Full Control)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Department</label>
                  <select
                    disabled={isLoading}
                    value={isCustomDept ? "CUSTOM" : department}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#0c0f17] px-3 py-2 text-sm text-white transition focus:border-cyan-400 focus:outline-none cursor-pointer"
                  >
                    <option value="Telecalling" className="bg-[#0c0f17]">Telecalling</option>
                    <option value="Video Editing" className="bg-[#0c0f17]">Video Editing</option>
                    <option value="CUSTOM" className="bg-[#0c0f17]">Other (Type Custom...)</option>
                  </select>
                </div>

                {isCustomDept && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Specify Department</label>
                    <input
                      type="text"
                      required
                      disabled={isLoading}
                      value={customDeptText}
                      onChange={(e) => setCustomDeptText(e.target.value)}
                      placeholder="e.g. Designing, Sales"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 transition focus:border-cyan-400 focus:bg-white/[0.06] focus:outline-none"
                    />
                  </div>
                )}

                <div className="mt-6 flex gap-3 pt-2">
                  <button type="button" disabled={isLoading} onClick={handleCloseEdit} className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50 cursor-pointer">Cancel</button>
                  <button type="submit" disabled={isLoading} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50 cursor-pointer">
                    {isLoading ? <span>Updating...</span> : <span>Save Changes</span>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => !isLoading && setIsDeleteOpen(false)} className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300" />
          <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-[#0c0f17] p-6 shadow-2xl transition-all duration-300 hover:border-red-500/30 text-left">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent" />
            
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white tracking-tight">Deactivate Account?</h3>
              <p className="text-xs text-slate-400 mt-2">
                Are you sure you want to deactivate {user.username}?
                {currentUserId === user.id ? (
                  <span className="block mt-2 font-semibold text-red-400">You cannot deactivate your own signed-in account.</span>
                ) : (
                  <span className="block mt-2 text-slate-500">Login will be blocked, but historical work will be preserved.</span>
                )}
              </p>
            </div>

            {error && <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{error}</div>}

            <div className="mt-6 flex gap-3">
              <button type="button" disabled={isLoading} onClick={() => setIsDeleteOpen(false)} className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50 cursor-pointer">Cancel</button>
              <button type="button" disabled={isLoading} onClick={handleDelete} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50 cursor-pointer">
                {isLoading ? <span>Deactivating...</span> : <span>Deactivate</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
