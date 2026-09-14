import { useState } from "react";
import { apiErrorMessage, changePassword } from "../lib/authApi";
import { useSession } from "../lib/tokenStore";

export function AccountPage() {
  const { user } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async (): Promise<void> => {
    setSaving(true); setError(null); setUpdated(false);
    try {
      await changePassword(currentPassword, newPassword);
      setUpdated(true);
      setCurrentPassword(""); setNewPassword("");
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSaving(false); }
  };
  return <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-lg font-semibold text-slate-900">Account</h1>
    {user !== null ? <dl className="mt-4 flex flex-col gap-2 border-b border-slate-200 pb-4 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{user.name}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-900">{user.email}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-slate-500">Role</dt><dd><span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{user.role}</span></dd></div>
      <div className="flex justify-between gap-4"><dt className="text-slate-500">User ID</dt><dd className="font-mono text-xs text-slate-500">{user.id}</dd></div>
    </dl> : null}
    <h2 className={user !== null ? "mt-6 text-sm font-semibold text-slate-900" : "mt-4 text-sm font-semibold text-slate-900"}>Change password</h2>
    <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Current password</span><input required minLength={1} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">New password</span><input required minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
      {updated ? <p role="status" className="text-sm text-green-700">Password updated.</p> : null}
      {error !== null ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">{saving ? "Saving…" : "Change password"}</button>
    </form>
  </section>;
}
