import axios from "axios";
import { http } from "./http";

export interface ApiEnvelope<T> {
  data: T;
  requestId?: string;
}

export async function getData<T>(url: string) {
  return (await http.get<ApiEnvelope<T>>(url)).data.data;
}

export async function sendData<T>(method: "post" | "put" | "patch", url: string, body?: unknown) {
  return (await http.request<ApiEnvelope<T>>({ method, url, data: body })).data.data;
}

export async function removeSession(url: string) {
  await http.post(url);
}

export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { error?: { message?: string } } | undefined;
    return payload?.error?.message ?? error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

export async function downloadFile(url: string, filename: string) {
  const response = await http.get<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
