import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { UNAUTHED_ERR_MSG } from "@/shared/const";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";

type UseAuthOptions = {
  autoFetch?: boolean;
};

/**
 * The reader's sign-in, one for the whole guide: signing in on the sign-in
 * sheet shows at once on the page that sent them there. On a phone the
 * session is a token in the secure store, with the reader beside it so the
 * guide knows them offline; once a launch the server is asked whether it
 * still holds, and a session it has dropped (expired, or the account
 * deleted) is let go here too.
 */
type State = { user: Auth.User | null; loading: boolean; error: Error | null };

let state: State = { user: null, loading: true, error: null };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

function toUser(u: Api.AuthUser): Auth.User {
  return {
    id: u.id,
    openId: u.openId,
    name: u.name,
    email: u.email,
    loginMethod: u.loginMethod,
    lastSignedIn: new Date(u.lastSignedIn ?? Date.now()),
  };
}

async function load() {
  try {
    if (Platform.OS !== "web") {
      const [token, cached] = await Promise.all([Auth.getSessionToken(), Auth.getUserInfo()]);
      set({ user: cached, loading: false });
      if (!token && !cached) return;
    }
    const known = await Api.checkSession();
    if (known === undefined) return; // (Offline: keep what's known.)
    if (known === null) {
      await forgetSession();
      return;
    }
    const user = toUser(known);
    set({ user, error: null });
    await Auth.setUserInfo(user);
  } catch (err) {
    set({ error: err instanceof Error ? err : new Error("Failed to fetch user") });
  } finally {
    set({ loading: false });
  }
}

/** Keeps a new sign-in and shows it on every page. */
export async function signedIn(user: Auth.User, sessionToken?: string) {
  if (sessionToken) await Auth.setSessionToken(sessionToken);
  await Auth.setUserInfo(user);
  set({ user, loading: false, error: null });
}

/** Lets go of the session on this phone (the server has, or will). */
export async function forgetSession() {
  await Auth.removeSessionToken();
  await Auth.clearUserInfo();
  set({ user: null, error: null });
}

/** Whether a call failed because the server no longer knows the reader. */
export function isSignedOutError(e: unknown): boolean {
  const err = e as { message?: string; data?: { code?: string } } | null;
  return err?.data?.code === "UNAUTHORIZED" || err?.message === UNAUTHED_ERR_MSG;
}

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (autoFetch) loading ??= load();
  }, [autoFetch]);

  const refresh = useCallback(async () => {
    loading = load();
    await loading;
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } catch (err) {
      // Server unavailable — still clear local state
      console.log("[Auth] Logout API call failed (offline?):", err);
    } finally {
      await forgetSession();
    }
  }, []);

  return {
    user: current.user,
    loading: autoFetch ? current.loading : false,
    error: current.error,
    isAuthenticated: current.user !== null,
    refresh,
    logout,
  };
}
