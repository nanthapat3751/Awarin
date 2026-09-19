import type { CustomerDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function searchCustomers(q?: string): Promise<{ customers: CustomerDto[] }> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch(`/api/customers${query}`);
}
