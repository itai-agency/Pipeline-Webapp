import axios, { type AxiosRequestConfig } from "axios";
import { env } from "../config/env.js";
import { getKommoApiBase } from "../config/kommoStageMap.js";
import { withNetworkRetry } from "./retry.js";

export async function kommoGet<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const base = getKommoApiBase();
  if (!base) throw new Error("Kommo API base URL is not configured");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return withNetworkRetry(`kommo GET ${path}`, async () => {
    const response = await axios.get<T>(url, {
      ...config,
      headers: {
        Authorization: `Bearer ${env.KOMMO_ACCESS_TOKEN}`,
        ...config?.headers,
      },
      timeout: config?.timeout ?? 60_000,
    });
    return response.data;
  });
}
