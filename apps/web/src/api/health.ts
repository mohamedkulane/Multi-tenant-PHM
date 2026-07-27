import { http } from "./http";

export interface ApiLiveness {
  data: {
    status: "up";
    service: string;
    timestamp: string;
  };
  requestId: string;
}

export async function getApiLiveness() {
  const response = await http.get<ApiLiveness>("/health/live");
  return response.data;
}
