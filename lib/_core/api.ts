import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/api";
import * as Auth from "./auth";

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }
  }

  const baseUrl = getApiBaseUrl();
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${cleanBaseUrl}${cleanEndpoint}` : endpoint;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorText;
      } catch {
        // Not JSON, use text as is
      }
      throw new Error(errorMessage || `API call failed: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Unknown error occurred");
  }
}

export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", { method: "POST" });
}

interface AuthUser {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
}

export async function getMe(): Promise<AuthUser | null> {
  try {
    const result = await apiCall<{ user: AuthUser }>("/api/auth/me");
    return result.user || null;
  } catch {
    return null;
  }
}

export async function establishSession(token: string): Promise<boolean> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/auth/session`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}
