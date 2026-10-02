/**
 * The fences behind the watchlist: each watch registers an OS geofence
 * (CLCircularRegion on iOS, Geofencing on Android) at the place's own
 * radius — 60 m at a building, 300 m across a district — so the guide can
 * say, with the app closed and the phone in a pocket, "you're at the door."
 *
 * All on-device: no push server, no network, nothing sent anywhere. Fences
 * are reconciled against the ledger every time the guide is opened, so a
 * restart, an update, or an OS eviction costs at most one quiet re-arm.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { router } from "expo-router";

import { landmarks, type Landmark } from "@/data/landmarks";
import { today } from "@/lib/reader-copy";
import {
  EMPTY_LEDGER,
  MAX_WATCHES,
  RE_FIRE_BLOCK_MS,
  canFire,
  noticeCopy,
  parseLedger,
  recordFire,
  retireWatch,
  setWatch,
  shouldQuietlyRetire,
  type Watch,
  type WatchLedger,
} from "@/lib/watches";

const LEDGER_KEY = "@berkeley_landmarks_watchlist_v1";
const FENCES_KEY = "@berkeley_landmarks_watch_fences_v1";
const READER_COPY_KEY = "@berkeley_reader_copy_v1";
const GEOFENCE_TASK = "berkeley-watch";
/** A fence found entered this soon after its watch began: the reader is standing there already. */
const SETTLE_MS = 90_000;

/** One notice per place: a second for it replaces the first rather than stacking. */
const noticeId = (landmarkId: string) => `watch-${landmarkId}`;

const byId = new Map(landmarks.map((l) => [l.id, l]));
const native = Platform.OS !== "web";

/** The ledger as kept — shared with the headless task through the store. */
async function readLedger(): Promise<WatchLedger> {
  try {
    return parseLedger(await AsyncStorage.getItem(LEDGER_KEY)) ?? EMPTY_LEDGER;
  } catch {
    return EMPTY_LEDGER;
  }
}

async function writeLedger(ledger: WatchLedger): Promise<void> {
  try {
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    /* the fences will re-sync against what's kept */
  }
}

/**
 * One change to the ledger at a time — from a screen or from a fence — each
 * reading what's kept and writing it back. (Fence events come in bursts; two
 * reading the ledger at once would both find the place unannounced.)
 */
let ledgerLock: Promise<unknown> = Promise.resolve();
function withLedger<T>(change: (ledger: WatchLedger) => Promise<[WatchLedger, T]>): Promise<T> {
  const run = ledgerLock.then(async () => {
    const before = await readLedger();
    const [after, out] = await change(before);
    if (after !== before) await writeLedger(after);
    return out;
  });
  ledgerLock = run.catch(() => undefined);
  return run;
}

/** The days the reader stamped places, from their copy. */
async function readVisited(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(READER_COPY_KEY);
    return raw ? ((JSON.parse(raw)?.visited ?? {}) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * The headless half: a fence entered, the app long closed. A fence wakes
 * the guide in the background before any screen is drawn, so the task is
 * defined here, as the guide's code is first read — defined any later and
 * the OS's event would find nothing to hand it to.
 */
async function onFence({ data, error }: TaskManager.TaskManagerTaskBody<unknown>) {
  if (error) return;
  const { region, eventType } = (data ?? {}) as { region?: { identifier?: string }; eventType?: number };
  const id = region?.identifier;
  if (!id || eventType !== Location.GeofencingEventType.Enter) return;
  await withLedger<void>(async (ledger) => {
    const watch = ledger.watches[id];
    if (!watch || watch.status !== "watching" || !watch.notifying) return [ledger, undefined];
    // Watched while standing there: no notice for the place underfoot.
    if (Date.now() - Date.parse(watch.watchedAt) < SETTLE_MS) return [ledger, undefined];
    // A fired-and-left watch stays quiet for thirty days.
    if (watch.lastFiredAt && Date.now() - Date.parse(watch.lastFiredAt) < RE_FIRE_BLOCK_MS) return [ledger, undefined];
    // The stamp is the payoff: stamped today, the watch retires without a word.
    if ((await readVisited())[id] === today()) return [retireWatch(ledger, id), undefined];
    // The throttles: an hour holds one notice, a day three. Overflow is dropped.
    if (!canFire(ledger)) return [ledger, undefined];
    const landmark = byId.get(id);
    const { title, body } = noticeCopy(landmark?.name ?? "a place", landmark?.designationType);
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: noticeId(id),
        content: { title, body, data: { landmarkId: id, via: "watch" } },
        trigger: null,
      });
    } catch {
      return [ledger, undefined];
    }
    return [recordFire(ledger, id), undefined];
  });
}

if (native && !TaskManager.isTaskDefined(GEOFENCE_TASK)) TaskManager.defineTask(GEOFENCE_TASK, onFence);
if (native) {
  // A notice that comes in while the guide is open still shows, quietly.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/**
 * Brings the fences into line with the ledger. Idempotent. On the way: a
 * place stamped since it was watched retires its watch (watch → go →
 * stamped), a year-untouched watch is let go, and a notice left unread
 * thirty days re-arms its watch. A watch says it notifies only while its
 * fence is really set — without Always-location and notices, it's kept as a
 * bookmark, and it comes back by itself once they're allowed.
 */
async function syncFences(ledger: WatchLedger): Promise<WatchLedger> {
  if (!native) return ledger;
  const now = Date.now();
  const visited = await readVisited();
  let next = ledger;
  for (const w of Object.values(ledger.watches)) {
    if (w.status === "retired") continue;
    // (A day after the watch began: a place stamped before, or earlier the
    // same day, can still be watched. Same-day stamps after it retire the
    // watch where they're made, or quietly when its fence is next entered.)
    const stamped = visited[w.landmarkId];
    if ((stamped && stamped > today(new Date(w.watchedAt))) || shouldQuietlyRetire(w, now)) {
      next = retireWatch(next, w.landmarkId);
    } else if (w.status === "fired" && w.lastFiredAt && now - Date.parse(w.lastFiredAt) >= RE_FIRE_BLOCK_MS) {
      next = setWatch(next, w.landmarkId, { ...w, status: "watching" });
    }
  }

  let allowed = false;
  try {
    const [where, notes] = await Promise.all([Location.getBackgroundPermissionsAsync(), Notifications.getPermissionsAsync()]);
    allowed = where.status === "granted" && notes.granted;
  } catch {
    allowed = false;
  }
  const regions = Object.values(next.watches)
    .filter((w) => w.status === "watching")
    .map((w) => {
      const l = byId.get(w.landmarkId);
      return l
        ? {
            identifier: w.landmarkId,
            latitude: l.latitude,
            longitude: l.longitude,
            radius: l.designationType === "Historic District" ? 300 : 60,
            notifyOnEntry: true,
            notifyOnExit: false,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r != null);
  // Fences are set again only when they change: each setting makes iOS
  // report every fence the reader is standing in as newly entered.
  const fences = JSON.stringify(regions.map((r) => [r.identifier, r.radius]).sort());
  // (With nothing to fence — every watch fired — a watch still notifies if allowed.)
  let armed = allowed;
  try {
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (allowed && regions.length) {
      if (!started || (await AsyncStorage.getItem(FENCES_KEY)) !== fences) {
        await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
        await AsyncStorage.setItem(FENCES_KEY, fences);
      }
    } else if (started) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
      await AsyncStorage.removeItem(FENCES_KEY);
    }
  } catch {
    armed = false;
  }
  for (const w of Object.values(next.watches)) {
    if (w.status !== "retired" && w.notifying !== armed) next = setWatch(next, w.landmarkId, { ...w, notifying: armed });
  }
  return next;
}

interface WatchPlacesContext {
  ledger: WatchLedger;
  loaded: boolean;
  /** Turns a watch on or off; says what came of it. */
  toggle: (landmark: Landmark) => Promise<"watching" | "removed" | "full" | "denied">;
  /** Retires a watch — tapped through, stamped, or let go. */
  retire: (landmarkId: string) => Promise<void>;
  /** The watches standing in the list, oldest first — for the 21st's choice. */
  activeWatches: Watch[];
}

const Context = createContext<WatchPlacesContext | undefined>(undefined);

/** Keeps the watchlist and its fences. */
export function WatchPlacesProvider({ children }: { children: React.ReactNode }) {
  const [ledger, setLedger] = useState<WatchLedger>(EMPTY_LEDGER);
  const [loaded, setLoaded] = useState(false);
  // Each change is made on the ledger as kept (a fence may have written a
  // notice since this screen last looked), and the fences follow it.
  const update = useCallback(async (change: (l: WatchLedger) => WatchLedger) => {
    const next = await withLedger(async (l) => {
      const synced = await syncFences(change(l));
      return [synced, synced];
    });
    setLedger(next);
    return next;
  }, []);

  // Every time the guide is opened: read what's kept, re-arm the fences.
  useEffect(() => {
    const reopen = async () => {
      await update((l) => l);
      setLoaded(true);
    };
    void reopen();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reopen();
    });
    return () => sub.remove();
  }, [update]);

  // A retired watch takes its notice with it, if it's still on the screen.
  const retire = useCallback(
    async (landmarkId: string) => {
      await update((l) => retireWatch(l, landmarkId));
      if (native) void Notifications.dismissNotificationAsync(noticeId(landmarkId)).catch(() => undefined);
    },
    [update],
  );

  const toggle = useCallback(
    async (landmark: Landmark) => {
      const current = await readLedger();
      const existing = current.watches[landmark.id];
      if (existing && existing.status !== "retired") {
        await update((l) => setWatch(l, landmark.id, null));
        return "removed" as const;
      }
      const count = Object.values(current.watches).filter((w) => w.status !== "retired").length;
      if (count >= MAX_WATCHES) return "full" as const;
      // Always-location and notices are asked at the moment of intent: the
      // reader has just chosen this place. (Notices are asked even if Always
      // is refused: until they've been asked, iOS gives the guide no
      // Notifications switch in Settings to turn on later.)
      if (native) {
        try {
          const fg = await Location.requestForegroundPermissionsAsync();
          if (fg.status === "granted") {
            await Location.requestBackgroundPermissionsAsync();
            await Notifications.requestPermissionsAsync();
          }
        } catch {
          /* denied or unavailable: kept as a bookmark */
        }
      }
      // A re-watch of a retired place arms it fresh; whether it can notify
      // is the fences' to say.
      const next = await update((l) =>
        setWatch(l, landmark.id, {
          landmarkId: landmark.id,
          watchedAt: new Date().toISOString(),
          lastFiredAt: null,
          firedCount: 0,
          status: "watching",
          notifying: false,
        }),
      );
      return next.watches[landmark.id]?.notifying ? ("watching" as const) : ("denied" as const);
    },
    [update],
  );

  // Tapping the notice opens the entry and retires the watch — its work is
  // done. (This sits inside the book's navigator, so a tap that opened the
  // guide from closed can turn to the page as soon as it's read.)
  const handled = useRef(new Set<string>());
  useEffect(() => {
    if (!native || !loaded) return;
    const open = (response: Notifications.NotificationResponse) => {
      const key = `${response.notification.request.identifier}@${response.notification.date}`;
      const id = response.notification.request.content.data?.landmarkId;
      if (handled.current.has(key) || typeof id !== "string" || !byId.has(id)) return;
      handled.current.add(key);
      void update((l) => (l.watches[id]?.status === "fired" ? retireWatch(l, id) : l));
      router.push(`/landmark/${id}`);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      open(last);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    // A notice that arrives with the guide open: the ledger changed underneath.
    const received = Notifications.addNotificationReceivedListener(() => void update((l) => l));
    return () => {
      sub.remove();
      received.remove();
    };
  }, [loaded, update]);

  const activeWatches = useMemo(
    () =>
      Object.values(ledger.watches)
        .filter((w) => w.status !== "retired")
        .sort((a, b) => a.watchedAt.localeCompare(b.watchedAt)),
    [ledger.watches],
  );

  const value = useMemo(() => ({ ledger, loaded, toggle, retire, activeWatches }), [ledger, loaded, toggle, retire, activeWatches]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWatchPlaces() {
  const context = useContext(Context);
  if (!context) throw new Error("useWatchPlaces must be used within a WatchPlacesProvider");
  return context;
}
