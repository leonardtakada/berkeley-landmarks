# Pocket guide UX review — 23 October 2026

The device needs a more predictable interaction model and a clearer information hierarchy. Keep the blue, cream, vermilion, architectural illustrations and hosts. Give navigation, playback and recovery the strongest positions on the screen.

Scope: current firmware source at `81d7ec1`, plus saved device captures. The USB device was disconnected during this review, so this is a source and visual inspection, not a fresh hands-on usability test. Some saved captures predate the current map and button improvements. Recommendations below use current code for behavior. No firmware changes or flashing were performed for this review.

## Fix first: trust and continuity

1. **Stop presenting simulated navigation as a real walk.** `screen_follow.c:52–60` subtracts distance every second and calls arrival at 25 m, without reading GPS. The pointer animates around a stored bearing (`110–113`). The guided map interpolates the simulated position (`screen_map.c:203`). A working GPS receiver does not fix that separate integration gap. Use fresh positions for distance and arrival, freeze guidance with a clear searching state when unavailable, and put simulation behind an explicit Preview mode. Do not present a stationary course-over-ground reading as a compass.

2. **Make Map and Menu temporary views that preserve context.** Narration → Menu → Map currently stops the audio (`ui.c:46–47`); Map → Back opens Follow (`nav.c:119–120`). Preserve the story, playback position and paused/playing state, and return to the exact screen that opened the map. Back should never silently restart or abandon an activity.

3. **Use honest playback states.** Opening text cycles every eight seconds instead of following the full narration, and missing audio falls back to a simulated timer (`screen_narration.c:45–58,140–175,369–370`). Show a static summary until synchronized captions exist. Missing audio should say “Audio unavailable” and offer reading or continuing, with no moving playback clock.

4. **Give Resume a first-class path.** `walk_begin()` clears progress (`walk.c:91–95`). Save the active walk, current stop and playback position; opening the guide should offer Resume walk. Investigate a source-derived bug before shipping: skipping calls `walk_to()` and clears `heard_ms`, but deleting the outgoing narration screen later writes the previous story's position into it (`nav.c:60–61`, `screen_narration.c:208–213`). Keep playback position per stop. This ordering issue has not been reproduced on hardware in this review.

## Simplify the interaction

- **Choose → Walk ↔ Story** should be the main flow. Map, stop list and settings open temporarily and return to their caller. Arrival and speaker handover belong within the stop/story screen.
- **One deliberate Start button.** The whole walk-picker page currently starts the walk when tapped (`screen_walks.c:42–49`). Keep swipe/arrows for browsing, but make only the labeled Start control start it. Show walk name, duration, distance and start location before committing.
- **Remove hidden consequential taps.** The distance card currently marks arrival (`screen_follow.c:145–151`). Make it informational. Offer a clearly labeled manual arrival fallback when GPS is unavailable, separate from the primary control.
- **Upper physical button = the visible primary action.** On a story, that means Play/Pause, not Next stop. Both physical buttons currently exit a story in free exploration (`nav.c:137–140`). Lower = Menu from the main screen, Back from a secondary screen. Put Skip and End in the menu. Keep a visible End option; do not require users to discover a long press.
- **Let the user control pacing.** Current arrival waits 7 seconds, with another 4.5 seconds for a guest handover; narration then advances after 1.5 seconds (`screen_stamped.c:22`, `screen_handover.c:23`, `screen_narration.c:175`). Show the stop and Listen immediately. Make autoplay an explicit preference. After a story, leave Replay and Next stop available until the user chooses.

## Rebalance the round screen

The saved Follow screen spends most of its area on a portrait, with the destination and actions squeezed onto small slips and edge tabs. On the 1.75-inch display, that makes an attractive composition harder to read while moving.

- **Walking:** destination, real distance and direction/map first; host as a small cameo or signature. Keep the larger character for the story and arrival celebration.
- **Listening:** persistent building name, prominent Play/Pause, rewind and elapsed time. A short summary is more useful than an animated paragraph that repeats. Speaker credit can be secondary.
- **Touch:** prototype main targets around 80–96 native pixels (roughly 7.6–9.2 mm at the documented density), with gaps. Make the visible shape close to the actual hit area. Validate on the real device; large invisible hit areas can still overlap neighboring controls.
- **Type:** try 24–28 px for essential labels and regular/medium weights outdoors. Keep tracked small capitals for short headings. Long building names should wrap rather than disappear into ellipses.
- **Motion:** keep one short stamp/host greeting, then settle. Avoid a swaying navigation pointer and moving captions. Test ordinary transitions around 150–200 ms, with immediate press feedback.
- **Menu:** make Resume the most prominent action. End walk currently has the strongest filled treatment in controls; move it below routine actions. Retain confirmation for ending, rather than adding confirmations to every interaction.

## Make exploration easier to select

The current Explore view draws every visible landmark and chooses the nearest within a 40-pixel radius. It offers zoom but no map-drag handler (`screen_explore.c`). The current map artwork has improved since the saved raster captures, but the selection problem remains at dense locations.

Offer a short Nearby list with names and distances, alongside the map. Cluster dense markers or offer a small disambiguation list after a tap. Use one selected landmark card with a clear Go or Listen action. Add pan plus Recenter if free map browsing remains central. Clearly label straight-line guidance until pedestrian routes are available; a connecting line should not imply a walkable street route.

## Suggested first implementation pass

1. Isolate Preview mode; connect guided distance/arrival to fresh GPS, and label missing location/audio correctly.
2. Preserve navigation and playback context; fix per-stop playback storage; add Resume.
3. Make upper-button Play/Pause and explicit Start/Listen/Next the default.
4. Merge arrival/handover into the story screen; enlarge essential labels and controls; reduce walking-screen portrait area.
5. Field-test before expanding map features.

## Validation on the device

Ask someone unfamiliar with the guide to do these without coaching: choose a different walk; start it; identify the next building at a glance; pause with a physical button; open the map during a story and return; skip one stop; pause the walk and resume it. Record wrong taps, backtracking and requests for help. Repeat outdoors while walking. Separately confirm that standing still does not reduce distance or collect a stop, loss of GPS is explicit, and missing audio does not simulate playback.

Apple's [watchOS design guidance](https://developer.apple.com/design/human-interface-guidelines/designing-for-watchos/) is a useful small-screen reference for focused, glanceable interactions. The proposed dimensions, timings and flow here are design hypotheses for this hardware, not claims of measured usability improvement.
