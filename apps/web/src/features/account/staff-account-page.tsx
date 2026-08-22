import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { errorMessage, sendData } from "../../api/client";
import { Card, Field, PageHeader } from "../../components/ui";
import { showToast } from "../../components/toast";
import type { TenantPrincipal, Workspace } from "../../types";

export function StaffAccountPage({
  principal,
  workspace,
}: {
  principal: TenantPrincipal;
  workspace: Workspace;
}) {
  const client = useQueryClient();
  const [profile, setProfile] = useState({
    fullName: principal.fullName,
    email: principal.email ?? "",
  });
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const profileMutation = useMutation({
    mutationFn: () => sendData<TenantPrincipal>("put", "/auth/profile", profile),
    onSuccess: async (updated) => {
      client.setQueryData(["tenant-principal"], updated);
      await client.invalidateQueries({ queryKey: ["tenant-principal"] });
      showToast({ title: "Profile updated", message: "Your personal information has been saved." });
    },
  });
  const passwordMutation = useMutation({
    mutationFn: () => sendData("post", "/auth/change-password", password),
    onSuccess: () => {
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
      showToast({
        title: "Password updated",
        message: "Other signed-in sessions have been secured.",
      });
    },
  });
  const branches = principal.allBranches
    ? workspace.branches
    : workspace.branches.filter((branch) => principal.branchIds.includes(branch.id));
  const initials = principal.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const roleName = principal.role === "LAB_TECHNICIAN" ? "Lab Technician" : "Doctor";
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="My account"
        description="Manage your personal information, password, and work access from one secure page."
      />
      <section className="mb-6 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="grid size-20 shrink-0 place-items-center rounded-full bg-emerald-100 text-2xl font-extrabold text-emerald-800">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-extrabold text-slate-950">{principal.fullName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {principal.username} · {roleName} · {workspace.tenant.name}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 size={14} /> Active account
        </span>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card
            title="Personal information"
            description="Update your contact details and account identity."
          >
            <form
              className="space-y-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                profileMutation.mutate();
              }}
            >
              <Field label="Full name">
                <div className="relative">
                  <UserRound
                    className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <input
                    className="input pl-10"
                    style={{ paddingLeft: "2.5rem" }}
                    value={profile.fullName}
                    onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
                    minLength={2}
                    required
                  />
                </div>
              </Field>
              <Field label="Email address">
                <div className="relative">
                  <Mail
                    className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <input
                    className="input pl-10"
                    style={{ paddingLeft: "2.5rem" }}
                    type="email"
                    value={profile.email}
                    onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                    placeholder="doctor@example.com"
                  />
                </div>
              </Field>
              {profileMutation.error ? (
                <p className="text-sm font-medium text-rose-700">
                  {errorMessage(profileMutation.error)}
                </p>
              ) : null}
              <button className="btn-primary w-full sm:w-auto" disabled={profileMutation.isPending}>
                Save changes
              </button>
            </form>
          </Card>
          <Card
            title="Work access"
            description="Role and assigned branches are managed by your administrator."
          >
            <div className="space-y-5 p-5">
              <div>
                <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
                  Assigned role
                </p>
                <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">
                  {principal.role === "DOCTOR" ? (
                    <Stethoscope size={17} className="text-emerald-600" />
                  ) : (
                    <ShieldCheck size={17} className="text-violet-600" />
                  )}
                  {roleName}
                </span>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
                  Branch access
                </p>
                <div className="space-y-2">
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
                    >
                      <Building2 size={16} className="text-slate-400" />
                      <span className="text-sm font-semibold text-slate-700">{branch.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
        <Card
          title="Change password"
          description="Use a strong password that you do not reuse elsewhere."
          className="h-fit"
        >
          <form
            className="space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              passwordMutation.mutate();
            }}
          >
            <Field label="Current password">
              <PasswordInput
                value={password.currentPassword}
                show={showPassword}
                onChange={(value) => setPassword({ ...password, currentPassword: value })}
              />
            </Field>
            <Field label="New password">
              <PasswordInput
                value={password.newPassword}
                show={showPassword}
                onChange={(value) => setPassword({ ...password, newPassword: value })}
              />
            </Field>
            <Field label="Confirm new password">
              <PasswordInput
                value={password.confirmPassword}
                show={showPassword}
                onChange={(value) => setPassword({ ...password, confirmPassword: value })}
              />
            </Field>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              {showPassword ? "Hide passwords" : "Show passwords"}
            </button>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-700">Password requirements</p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
                <li>• At least 12 characters</li>
                <li>• New and confirmation passwords must match</li>
                <li>• Must be different from your current password</li>
              </ul>
            </div>
            {password.newPassword &&
            password.confirmPassword &&
            password.newPassword !== password.confirmPassword ? (
              <p className="text-sm font-medium text-rose-700">New passwords do not match.</p>
            ) : null}
            {passwordMutation.error ? (
              <p className="text-sm font-medium text-rose-700">
                {errorMessage(passwordMutation.error)}
              </p>
            ) : null}
            <button
              className="btn-primary w-full sm:w-auto"
              disabled={
                passwordMutation.isPending ||
                password.newPassword !== password.confirmPassword ||
                password.newPassword.length < 12
              }
            >
              <KeyRound size={17} /> Update password
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}

function PasswordInput({
  value,
  show,
  onChange,
}: {
  value: string;
  show: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <KeyRound className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={17} />
      <input
        className="input pr-10 pl-10"
        style={{ paddingRight: "2.5rem", paddingLeft: "2.5rem" }}
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        minLength={8}
        required
      />
    </div>
  );
}
