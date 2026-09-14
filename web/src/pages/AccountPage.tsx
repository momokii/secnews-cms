import { useState } from "react";
import { apiErrorMessage, changePassword } from "../lib/authApi";
import { updateUser } from "../lib/usersApi";
import { setUser, useSession } from "../lib/tokenStore";

export function AccountPage() {
  const { user } = useSession();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profileEmail, setProfileEmail] = useState(user?.email ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileUpdated, setProfileUpdated] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [saving, setSaving] = useState(false);
  const editProfile = (): void => {
    if (user === null) return;
    setProfileName(user.name);
    setProfileEmail(user.email);
    setProfileError(null);
    setProfileUpdated(false);
    setEditingProfile(true);
  };
  const cancelProfileEdit = (): void => {
    setEditingProfile(false);
    setProfileError(null);
  };
  const submitProfile = async (): Promise<void> => {
    if (user === null) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileUpdated(false);
    try {
      const updatedUser = await updateUser(user.id, { name: profileName, email: profileEmail });
      setUser(updatedUser);
      setEditingProfile(false);
      setProfileUpdated(true);
    } catch (caught) {
      setProfileError(apiErrorMessage(caught));
    } finally {
      setProfileSaving(false);
    }
  };
  const submit = async (): Promise<void> => {
    setSaving(true); setError(null); setUpdated(false);
    try {
      await changePassword(currentPassword, newPassword);
      setUpdated(true);
      setCurrentPassword(""); setNewPassword("");
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSaving(false); }
  };
  return <section className="mx-auto flex max-w-3xl flex-col gap-6">
    <h1 className="text-lg font-semibold text-slate-900">Account</h1>
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
        {user !== null && !editingProfile ? <button type="button" onClick={editProfile} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Edit profile</button> : null}
      </div>
      {user !== null && editingProfile ? <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submitProfile(); }}>
        <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Name</span><input required value={profileName} onChange={(event) => setProfileName(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Email</span><input required type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
        <div className="flex justify-between gap-4 text-sm"><span className="text-slate-500">Role</span><span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{user.role}</span></div>
        <div className="flex gap-2"><button type="submit" disabled={profileSaving} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">{profileSaving ? "Saving…" : "Save profile"}</button><button type="button" onClick={cancelProfileEdit} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Cancel</button></div>
        {profileError !== null ? <p role="alert" className="text-sm text-red-600">{profileError}</p> : null}
      </form> : user !== null ? <dl className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{user.name}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-900">{user.email}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">Role</dt><dd><span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{user.role}</span></dd></div>
        <div className="flex justify-between gap-4"><dt className="text-slate-500">User ID</dt><dd className="font-mono text-xs text-slate-500">{user.id}</dd></div>
      </dl> : <p className="mt-4 text-sm text-slate-500">No profile is available.</p>}
      {profileUpdated ? <p role="status" className="mt-4 text-sm text-green-700">Profile updated.</p> : null}
    </section>
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
      <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Current password</span><input required minLength={1} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">New password</span><input required minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
      {updated ? <p role="status" className="text-sm text-green-700">Password updated.</p> : null}
      {error !== null ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">{saving ? "Saving…" : "Change password"}</button>
    </form>
    </section>
  </section>;
}
