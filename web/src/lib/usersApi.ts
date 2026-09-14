import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { USER_ROLES, type SessionUser, type UserRole } from "./tokenStore";

export type User = SessionUser;
export type UserInput = { readonly email: string; readonly name: string; readonly role: UserRole; readonly password?: string };
export type UserPage = { readonly items: readonly User[]; readonly total: number; readonly page: number; readonly pageSize: number };

function object(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null) throw new Error("Invalid API response"); return value as Record<string, unknown>; }
function parseUser(value: unknown): User { const data = object(value); if (typeof data.id !== "number" || typeof data.email !== "string" || typeof data.name !== "string" || typeof data.role !== "string" || !USER_ROLES.includes(data.role as UserRole)) throw new Error("Invalid user response"); return { id: data.id, email: data.email, name: data.name, role: data.role as UserRole }; }
async function json(response: Response): Promise<unknown> { return response.json(); }

export async function listUsers(page: number): Promise<UserPage> { const data = object(await json(await apiFetch(`/users?page=${page}&pageSize=20`))); if (!Array.isArray(data.items) || typeof data.total !== "number" || typeof data.page !== "number" || typeof data.pageSize !== "number") throw new Error("Invalid users response"); return { items: data.items.map(parseUser), total: data.total, page: data.page, pageSize: data.pageSize }; }
export async function createUser(input: UserInput): Promise<User> { return parseUser(await json(await apiFetch("/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }))); }
export async function updateUser(id: number, input: UserInput): Promise<User> { return parseUser(await json(await apiFetch(`/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }))); }
export function useUsers(page: number) { return useQuery({ queryKey: ["users", page], queryFn: () => listUsers(page), placeholderData: (previous) => previous }); }
export function useSaveUser() { const client = useQueryClient(); return useMutation({ mutationFn: (input: { readonly id: number | null; readonly user: UserInput }) => input.id === null ? createUser(input.user) : updateUser(input.id, input.user), onSuccess: () => { void client.invalidateQueries({ queryKey: ["users"] }); } }); }
