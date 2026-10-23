/**
 * A line console on the board's own USB port, for working on the guide from
 * the Mac (scripts/device/snap.py):
 *
 *   snap              the screen as it is, base64 RGB565 between "SNAP w h" and "SNAP-END"
 *   show <name>       go to a screen: cover, walks, finding, follow
 *   walk <n>          choose Walk n (1-12) and show the picker
 *   stats             frames drawn per second and how idle LVGL is, over two seconds
 *   bench             how long a whole-screen redraw of the screen showing takes
 *   tree              the screen's top-level parts, numbered
 *   hide <i>          hide part i of the screen, or show it again (for timing with bench)
 *   tap <x> <y>       a finger down and up at a point, as the touch panel would report it
 *   swipe <dir> [ms]  a finger drawn left or right across the middle (300 ms: a flick)
 *   where             the screen showing and the walk chosen
 *
 * And the hardware check (Phase 1):
 *
 *   i2c               who answers on the shared bus
 *   reg <a> <r> [v]   read (or write) register r of the device at a, in hex
 *   i2cw <a> <b…>     write raw bytes to the device at a; `i2cr <a> <n>` reads n
 *   uart [rx baud s]  listen on a pin as a UART for s seconds (default GPIO18, 115200, 3)
 *   gps               the fix as it stands; `gps raw on|off` echoes NMEA; `gps log` the kept fixes;
 *                     `gps pause|resume` stops polling; `gps probe` times the module's answer;
 *                     `gps manual on|off` keeps polling off from boot; `gps read` one exchange
 *                     by hand; `gps unstick` ends a stuck answer; `gps send PQTMVERNO`
 *                     sends a command (the $, checksum and line end are added)
 *   imu, pmu          the motion sensor; the power manager and battery
 *   sd                mount the card, write and read back a file
 *   chime [vol]       the arrival chime; `tone <hz> <ms>` a plain tone
 */
#pragma once

void console_start(void);
