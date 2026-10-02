/**
 * A release build keeps the device log quiet: the guide's chatter (sign-in
 * steps, which name the reader and part of their session token) goes only
 * to a development console. Warnings and errors still go through.
 */
if (!__DEV__) {
  const quiet = () => {};
  console.log = quiet;
  console.info = quiet;
  console.debug = quiet;
}

export {};
