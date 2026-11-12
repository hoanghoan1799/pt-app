import "server-only";

import { callApi } from "@/services/api/call";

export interface AdminAccount {
  id: number;
  username: string;
  role: "super_admin" | "pt";
  verified: boolean;
  // Trainees in this account's workspace.
  traineeCount: number;
}

// Every admin account (super admins and PTs) for the "Quản lý PT" page.
export const listAdminAccounts = async (): Promise<AdminAccount[]> => {
  const { accounts } = await callApi("admin", (api) => api.GET("/v1/pts"));

  return accounts;
};

export interface WorkspaceTrainee {
  id: number;
  name: string;
  ptAdminId: number | null;
}

// Every trainee with their PT, for the move-between-PTs lists. The ones this
// super admin hid are not listed (GET /v1/trainees leaves them out).
export const listWorkspaceTrainees = async (): Promise<WorkspaceTrainee[]> => {
  const { trainees } = await callApi("admin", (api) => api.GET("/v1/trainees"));

  return trainees.map((trainee) => ({
    id: trainee.id,
    name: trainee.name,
    ptAdminId: trainee.ptAdminId,
  }));
};

// PT accounts by username, for the "move to another PT" select.
export const listPtOptions = async () => {
  const accounts = await listAdminAccounts();

  return accounts
    .filter((account) => account.role === "pt")
    .map((account) => ({ id: account.id, username: account.username }))
    .sort((a, b) => a.username.localeCompare(b.username));
};
