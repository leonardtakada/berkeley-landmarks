import "@/lib/quiet-logs";
import { liftLaunchScreen } from "@/lib/launch-screen";
import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Stack from "expo-router/js-stack";
import { TransitionPresets } from "expo-router/js-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useReducedMotion } from "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { ReaderCopyProvider } from "@/lib/reader-copy-context";
import { WatchPlacesProvider } from "@/lib/watch-places";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { SourceSerif4_400Regular } from "@expo-google-fonts/source-serif-4/400Regular";
import { SourceSerif4_500Medium } from "@expo-google-fonts/source-serif-4/500Medium";
import { SourceSerif4_600SemiBold } from "@expo-google-fonts/source-serif-4/600SemiBold";
import { useFonts } from "expo-font";
import { FONT_ASSETS, PAPER } from "@/constants/book";
import {
  dissolveSpec,
  forDissolve,
  forNoTransition,
  forPageTurn,
  forUnfold,
  pageTurnSpec,
} from "@/lib/page-turn";
import { FROM_PLATE } from "@/lib/map-plate";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded] = useFonts({
    SourceSerif4_400Regular,
    SourceSerif4_500Medium,
    SourceSerif4_600SemiBold,
    ...FONT_ASSETS,
  });
  const reduceMotion = useReducedMotion();
  // The cover lifts the launch screen once its drawing is in; anywhere else
  // (or if that's slow), a moment after the type is ready.
  useEffect(() => {
    if (!fontsLoaded) return;
    const id = setTimeout(liftLaunchScreen, 800);
    return () => clearTimeout(id);
  }, [fontsLoaded]);

  // Entry pages are leaves laid over the book: they turn in on a hinge and
  // swipe back by the free edge. Reduce Motion swaps the turn for a dissolve.
  const leafOptions = reduceMotion
    ? { cardStyleInterpolator: forDissolve, transitionSpec: dissolveSpec }
    : {
        cardStyleInterpolator: forPageTurn,
        transitionSpec: pageTurnSpec,
        cardOverlayEnabled: false,
        cardShadowEnabled: false,
      };
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WatchPlacesProvider>
      <ReaderCopyProvider>
        <QueryClientProvider client={queryClient}>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <Stack
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: "horizontal",
              cardStyle: { backgroundColor: PAPER.page },
              ...leafOptions,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="login"
              options={{ presentation: "modal", ...TransitionPresets.ModalSlideFromBottomIOS }}
            />
            <Stack.Screen
              name="propose"
              options={{ presentation: "modal", ...TransitionPresets.ModalSlideFromBottomIOS }}
            />
            <Stack.Screen name="landmark/[id]" />
            <Stack.Screen name="tour/[id]" />
            <Stack.Screen name="architect/[key]" />
            <Stack.Screen name="stamps" />
            <Stack.Screen name="about" />
            <Stack.Screen
              name="map"
              options={({ route }: { route: { params?: object } }) =>
                (route.params as { unfold?: string } | undefined)?.unfold === FROM_PLATE
                  ? {
                      // Off the Landmarks page as its plate: the map unfolds over
                      // the page itself, and folds back into it, on its own.
                      presentation: "transparentModal",
                      animation: "none",
                      gestureEnabled: false,
                      cardStyle: { backgroundColor: "transparent" },
                      cardStyleInterpolator: forNoTransition,
                      cardOverlayEnabled: false,
                      cardShadowEnabled: false,
                    }
                  : {
                      // Panning the map must never be mistaken for turning back.
                      gestureEnabled: false,
                      ...(reduceMotion ? null : { cardStyleInterpolator: forUnfold, cardShadowEnabled: false }),
                    }
              }
            />
          </Stack>
          </trpc.Provider>
        </QueryClientProvider>
      </ReaderCopyProvider>
      </WatchPlacesProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  // Don't render until custom fonts are live — text laid out before the font
  // loads renders as tofu boxes (landmarks category chips).
  if (!shouldOverrideSafeArea && !fontsLoaded) {
    return null;
  }

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
