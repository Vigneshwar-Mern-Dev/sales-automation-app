"use client";

import { useState } from "react";
import { adminCreateUserAction } from "@/app/lib/admin-actions";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from "@/app/lib/password-policy";

export function CreateUserButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [department, setDepartment] = useState("Telecalling");
  const [isCustomDept, setIsCustomDept] = useState(false);
  const [customDeptText, setCustomDeptText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleDepartmentChange = (val: string) => {
    if (val === "CUSTOM") {
      setIsCustomDept(true);
    } else {
      setIsCustomDept(false);
      setDepartment(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required.");
      setIsLoading(false);
      return;
    }

    const policyError = passwordPolicyError(password);
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
      const result = await adminCreateUserAction({
        username,
        email,
        password,
        role,
        department: finalDepartment,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(false);
          setUsername("");
          setEmail("");
          setPassword("");
          setShowPassword(false);
          setRole("USER");
          setDepartment("Telecalling");
          setIsCustomDept(false);
          setCustomDeptText("");
        }, 1500);
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    setShowPassword(false);
    setIsCustomDept(false);
    setCustomDeptText("");
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition-all duration-200 hover:bg-cyan-300 hover:shadow-[0_0_15px_rgba(34,211,238,0.4)] focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 active:scale-95 cursor-pointer"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span>Add Account</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with transition */}
          <div
            onClick={() => !isLoading && handleClose()}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#0c0f17] p-6 shadow-2xl transition-all duration-300 hover:border-cyan-500/30">
            {/* Elegant glowing indicator line on top */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Provision New Account</h3>
                <p className="text-xs text-slate-400 mt-1">Fill in details to set up username, email, and password.</p>
              </div>
              <button
                disabled={isLoading}
                onClick={handleClose}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50 cursor-pointer"
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                {error}
              </div>
            )}

            {success ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-white">Account Created Successfully</h4>
                <p className="mt-1 text-xs text-slate-400">Refreshing account registry...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isLoading}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. johndoe"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 transition focus:border-cyan-400 focus:bg-white/[0.06] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. john@example.com"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 transition focus:border-cyan-400 focus:bg-white/[0.06] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      disabled={isLoading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={PASSWORD_MIN_LENGTH}
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Access Role
                  </label>
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Department
                  </label>
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
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Specify Department
                    </label>
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
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleClose}
                    className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Creating...</span>
                      </>
                    ) : (
                      <span>Create Account</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
