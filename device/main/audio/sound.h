/**
 * The speaker: ES8311 codec and NS4150B amplifier through the BSP, mono. The
 * guide's own sounds are synthesised here at 22.05 kHz; the narration comes
 * from the card through player.c, which borrows the speaker (sound_take).
 */
#pragma once
#include <stdbool.h>
#include "esp_codec_dev.h"

/** Call once at start-up, before any sound. */
void sound_init(void);

/** The arrival chime: two bell notes falling a third, about a second and a half. Sounds take turns. */
void sound_chime(int volume);

/** A plain tone, for checking the speaker. */
void sound_tone(int hz, int ms, int volume);

/** Plays the chime on its own task, so the screen keeps moving; false if one is already playing. */
bool sound_chime_async(int volume);

/**
 * For a longer sound played elsewhere (the narration): waits its turn, then
 * opens the speaker at `rate` Hz and `volume` (0–100) and hands it over; NULL
 * if it can't. Give it back with sound_give() so other sounds can play.
 */
esp_codec_dev_handle_t sound_take(int rate, int volume);

/** Sets the volume (0–100) of the speaker while it's taken. */
void sound_volume(int volume);

void sound_give(void);
