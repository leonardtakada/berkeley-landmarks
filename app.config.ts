// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID: reverse-DNS, letters/numbers/dots only; each segment must start with a letter
const rawBundleId = "com.berkeleytours.app";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "com.berkeleytours.app";
// Deep link scheme derived from bundle id (without TLD)
const schemeFromBundleId = "berkeleylandmarks";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "Berkeley Tours",
  appSlug: "berkeley-landmarks",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663309907148/Kz8NFXFrKYV7Md4eJzEsHq/berkeley-landmarks-icon-Ru46adubDtgrt9dM2ZZUdf.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

/** Why the guide may ask for location "Always" — for watched places. */
const ALWAYS =
  "The guide uses your location to show where you are on the map, to collect each stop of a walk as you reach it, and to stamp the places you visit — and, for a place you ask it to watch, to tell you when you're near, even with the guide closed. Your location stays on this phone.";

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    buildNumber: "13",
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-updates",
    "expo-font",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "The guide uses your location to show where you are on the map, to collect each stop of a walk as you reach it, and to stamp the places you visit.",
        // "Always" is asked only when a reader watches a place: its fence
        // must be able to wake the guide. (expo-location won't set fences
        // without the background mode, though iOS itself would.)
        locationAlwaysAndWhenInUsePermission: ALWAYS,
        locationAlwaysPermission: ALWAYS,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
    "expo-notifications",
    [
      "expo-image-picker",
      {
        photosPermission: "The guide lets you choose photographs of a place to send to its editors.",
      },
    ],
    [
      "expo-splash-screen",
      {
        // Android shows a centred device on flat blue: the cut-out logo, so
        // there's no square of textured blue around it.
        image: "./assets/images/logo-on-blue.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0A2C8D",
        dark: {
          backgroundColor: "#0A2C8D",
        },
        // iOS shows the whole textured board as one sheet (scripts/splash.mjs).
        ios: {
          image: "./assets/images/splash-full.png",
          resizeMode: "cover",
          enableFullScreenImage_legacy: true,
          backgroundColor: "#0A2C8D",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "16.4",
        },
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "46888740-3b37-4e10-9a34-ac17bc7a52f6",
    },
  },
};

export default config;
