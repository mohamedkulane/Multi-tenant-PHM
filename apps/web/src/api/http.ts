import axios from "axios";

const configuredApiUrl: unknown = import.meta.env["VITE_API_URL"];
const apiBaseUrl =
  typeof configuredApiUrl === "string" && configuredApiUrl.length > 0
    ? configuredApiUrl
    : "http://127.0.0.1:5001/api/v1";

export const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 8_000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});
