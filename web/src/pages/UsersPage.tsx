import { useEffect, useState } from "react";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { RoleGate } from "../components/RoleGate";
import { useSaveUser, useUsers, type User } from "../lib/usersApi";
import { USER_ROLES, useSession, type UserRole } from "../lib/tokenStore";
import { formatTimestamp } from "../lib/datetime";

const SEARCH_DEBOUNCE_MS = 300;

const selectClass =
  "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none";

export function UsersPage() {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20); const [editing, setEditing] = useState<User | null>(null); const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(""); const [searchQuery, setSearchQuery] = useState(""); const [role, setRole] = useState<UserRole | "">("");
  const query = useUsers(page, pageSize, { q: searchQuery === "" ? undefined : searchQuery, role: role === "" ? undefined : role }); const save = useSaveUser();
  const [form, setForm] = useState({ name: "", email: "", role: "ANALYST" as UserRole, password: "" });
  const session = useSession();
  const isSelf = editing !== null && editing.id === session.user?.id;
  const start = (user: User | null): void => { setEditing(user); setForm(user === null ? { name: "", email: "", role: "ANALYST", password: "" } : { name: user.name, email: user.email, role: user.role, password: "" }); setOpen(true); save.reset(); };
  const submit = (): void => { save.mutate({ id: editing?.id ?? null, user: { ...form, ...(form.password === "" ? {} : { password: form.password }) } }, { onSuccess: () => setOpen(false) }); };
  const total = query.data?.total ?? 0; const effectivePageSize = query.data?.pageSize ?? pageSize;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  return <RoleGate roles={["admin"]}><section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-4"><h1 className="text-lg font-semibold text-slate-900">Users</h1><div className="flex items-center gap-2"><input aria-label="Search users" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name or email" className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none" /><button type="button" onClick={() => start(null)} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">Add user</button></div></div>
    <div aria-label="Role access" className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600"><p className="font-medium text-slate-700">Role access</p><ul className="mt-1 list-disc pl-4"><li>ADMIN — users, integrations, everything</li><li>EDITOR — feeds, clients/channels, tickets incl. send/close</li><li>ANALYST — view + work tickets (take, research, IOCs, AI fill), may only create ANALYST users, cannot send, cannot manage integrations</li></ul></div>
    <div className="mt-4 flex flex-wrap gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Filter by role</span>
        <select aria-label="Filter by role" value={role} onChange={(event) => { setRole(event.target.value as UserRole | ""); setPage(1); }} className={selectClass}>
          <option value="">All roles</option>
          {USER_ROLES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
    {query.isPending ? <p className="mt-4 text-sm text-slate-500">Loading users…</p> : query.isError ? <p role="alert" className="mt-4 text-sm text-red-600">{query.error.message}</p> : <table className="mt-4 w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Name</th><th className="py-2">Email</th><th className="py-2">Role</th><th className="py-2">Created</th><th className="py-2">Updated</th><th className="py-2">Actions</th></tr></thead><tbody>{query.data.items.map((user) => <tr key={user.id} className="border-b border-slate-100"><td className="py-2">{user.name}</td><td className="py-2">{user.email}</td><td className="py-2">{user.role}</td><td className="py-2 text-slate-500" title={user.createdAt}>{formatTimestamp(user.createdAt)}</td><td className="py-2 text-slate-500" title={user.updatedAt}>{formatTimestamp(user.updatedAt)}</td><td className="py-2"><button type="button" onClick={() => start(user)} className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">Edit</button></td></tr>)}</tbody></table>}
    <Pagination page={page} pageSize={effectivePageSize} total={total} itemLabel="users" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
    {open ? <Modal open onClose={() => setOpen(false)} title={editing === null ? "Create user" : "Edit user"}><form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}><label className="flex flex-col gap-1"><span>Name</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-md border border-slate-200 px-3 py-2" /></label><label className="flex flex-col gap-1"><span>Email</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-md border border-slate-200 px-3 py-2" /></label><label className="flex flex-col gap-1"><span>Role</span><select value={form.role} disabled={isSelf} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })} className="rounded-md border border-slate-200 px-3 py-2">{USER_ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>{isSelf ? <span className="text-xs text-slate-500">You cannot change your own role</span> : null}<label className="flex flex-col gap-1"><span>Password{editing === null ? "" : " (leave blank to keep)"}</span><input required={editing === null} minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="rounded-md border border-slate-200 px-3 py-2" /></label>{save.isError ? <p role="alert" className="text-sm text-red-600">{save.error.message}</p> : null}<button type="submit" disabled={save.isPending} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white">{editing === null ? "Create user" : "Save changes"}</button></form></Modal> : null}
  </section></RoleGate>;
}
