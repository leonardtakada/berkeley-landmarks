import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

/**
 * tRPC React client for type-safe API calls.
 * Works in standalone mode — requests fail gracefully if no server is running.
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates the tRPC client.
 * Safe to call even when no server is running — requests will fail gracefully.
 */
export function createTRPCClient() {
  const baseUrl = getApiBaseUrl();
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: baseUrl ? `${baseUrl}/api/trpc` : "http://localhost:0/api/trpc",
        transformer: superjson,
        async headers() {
          try {
            const token = await Auth.getSessionToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          } catch {
            return {};
          }
        },
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  });
}
