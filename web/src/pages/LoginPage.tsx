import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { apiErrorMessage, login } from "../lib/authApi";
import { setToken, setUser } from "../lib/tokenStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const result = await login(email, password);
      setToken(result.token); setUser(result.user);
       const from = location.state && typeof location.state === "object" && "from" in location.state && typeof location.state.from === "string" ? location.state.from : "/dashboard";
      navigate(from, { replace: true });
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSaving(false); }
  };
  return <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-lg font-semibold text-slate-900">Login</h1>
    <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-700">Password</span><input required minLength={1} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" /></label>
      {error !== null ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">{saving ? "Signing in…" : "Sign in"}</button>
    </form>
  </section>;
}
