import { MOCK_DATA } from "./config";

export function createApi<T>(sources: { mock: T; real: T }): T {
  return MOCK_DATA ? sources.mock : sources.real;
}
