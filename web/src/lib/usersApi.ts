import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { USER_ROLES, type SessionUser, type UserRole } from "./tokenStore";

export type User = SessionUser & { readonly createdAt: string; readonly updatedAt: string };
export type UserInput = { readonly email: string; readonly name: string; readonly role: UserRole; readonly password?: string };
export type UserProfileInput = Pick<UserInput, "email" | "name">;
export type UserPage = { readonly items: readonly User[]; readonly total: number; readonly page: number; readonly pageSize: number };

function object(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null) throw new Error("Invalid API response"); return value as Record<string, unknown>; }
function parseUser(value: unknown): User { const data = object(value); if (typeof data.id !== "string" || typeof data.email !== "string" || typeof data.name !== "string" || typeof data.role !== "string" || !USER_ROLES.includes(data.role as UserRole) || typeof data.createdAt !== "string" || typeof data.updatedAt !== "string") throw new Error("Invalid user response"); return { id: data.id, email: data.email, name: data.name, role: data.role as UserRole, createdAt: data.createdAt, updatedAt: data.updatedAt }; }
async function json(response: Response): Promise<unknown> { return response.json(); }

export type UserFilters = { readonly q?: string; readonly role?: UserRole };

export async function listUsers(page: number, pageSize: number = 20, filters: UserFilters = {}): Promise<UserPage> { const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }); if (filters.q !== undefined) params.set("q", filters.q); if (filters.role !== undefined) params.set("role", filters.role); const data = object(await json(await apiFetch(`/users?${params.toString()}`))); if (!Array.isArray(data.items) || typeof data.total !== "number" || typeof data.page !== "number" || typeof data.pageSize !== "number") throw new Error("Invalid users response"); return { items: data.items.map(parseUser), total: data.total, page: data.page, pageSize: data.pageSize }; }
export async function createUser(input: UserInput): Promise<User> { return parseUser(await json(await apiFetch("/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }))); }
export async function updateUser(id: string, input: UserInput | UserProfileInput): Promise<User> { return parseUser(await json(await apiFetch(`/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }))); }
export function useUsers(page: number, pageSize: number = 20, filters: UserFilters = {}) { return useQuery({ queryKey: ["users", page, pageSize, filters], queryFn: () => listUsers(page, pageSize, filters), placeholderData: (previous) => previous }); }
export function useSaveUser() { const client = useQueryClient(); return useMutation({ mutationFn: (input: { readonly id: string | null; readonly user: UserInput }) => input.id === null ? createUser(input.user) : updateUser(input.id, input.user), onSuccess: () => { void client.invalidateQueries({ queryKey: ["users"] }); } }); }
