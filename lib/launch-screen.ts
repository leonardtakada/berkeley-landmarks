import * as SplashScreen from "expo-splash-screen";

// The launch screen stays up until the cover can be seen whole — its type
// set and the Campanile drawn — then fades into it, so the bare board never
// shows: the launch screen is the cover's board and Campanile already.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

let lift: () => void = () => {};
const lifted = new Promise<void>((resolve) => {
  lift = resolve;
});
let done = false;

/** Fades the launch screen away (the first call only). */
export function liftLaunchScreen() {
  if (done) return;
  done = true;
  SplashScreen.hideAsync()
    .catch(() => {})
    .finally(lift);
}

/** Resolves once the launch screen has been lifted. */
export function launchScreenLifted() {
  return lifted;
}
