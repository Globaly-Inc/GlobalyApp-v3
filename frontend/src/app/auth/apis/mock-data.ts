import type { Employee } from "./types";

const employees: Employee[] = [
  { id: "1", name: "Asha Rai", department: "Engineering" },
  { id: "2", name: "Bikash Thapa", department: "Payroll" },
];

export const authMockApi = {
  getEmployees: async (): Promise<Employee[]> => employees,
};
