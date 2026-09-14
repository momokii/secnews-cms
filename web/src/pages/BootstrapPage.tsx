import { useState } from "react";
import { useNavigate } from "react-router";
import { apiErrorMessage, bootstrap, getAuthStatus } from "../lib/authApi";
import { setToken, setUser } from "../lib/tokenStore";
import { useQuery } from "@tanstack/react-query";

export function BootstrapPage() {
  const status = useQuery({ queryKey: ["auth-status"], queryFn: getAuthStatus, retry: false });
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", name: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const submit = async (): Promise<void> => {
    setError(null);
    try { const result = await bootstrap(form.email, form.name, form.password); setToken(result.token); setUser(result.user); navigate("/feeds", { replace: true }); }
    catch (caught) { setError(apiErrorMessage(caught)); }
  };
  if (status.isPending) return <p className="text-sm text-slate-500">Checking setup status…</p>;
  if (status.isError) return <p role="alert" className="text-sm text-red-600">{apiErrorMessage(status.error)}</p>;
  if (!status.data.needsBootstrap) return <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-lg font-semibold text-slate-900">Setup complete</h1><p className="mt-2 text-sm text-slate-500">An administrator already exists.</p></section>;
  return <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-lg font-semibold text-slate-900">First-run setup</h1><form className="mt-4 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Admin name</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
    <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Admin email</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
    <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Password</span><input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
    {error !== null ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}<button type="submit" className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">Create admin</button>
  </form></section>;
}
