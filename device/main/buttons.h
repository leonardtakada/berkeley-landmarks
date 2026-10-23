/**
 * The two side buttons. The upper (PWR) is the power manager's key, read
 * through the I/O expander; the lower (BOOT) is GPIO 0. Polled on the
 * sensor task; each press goes to ui_button() with the display locked.
 */
#pragma once
#include <stdbool.h>

bool buttons_init(void);

/** Call every 50 ms. */
void buttons_poll(void);

/** For the console: each button's state now and the last few presses. */
void buttons_print(void);
