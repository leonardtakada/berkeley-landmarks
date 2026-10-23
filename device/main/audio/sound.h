/**
 * The speaker: ES8311 codec and NS4150B amplifier through the BSP, 22.05 kHz
 * mono. For now, synthesised sounds; the narration MP3s come in Phase 5.
 */
#pragma once
#include <stdbool.h>

/** Call once at start-up, before any sound. */
void sound_init(void);

/** The arrival chime: two bell notes falling a third, about a second and a half. Sounds take turns. */
void sound_chime(int volume);

/** A plain tone, for checking the speaker. */
void sound_tone(int hz, int ms, int volume);

/** Plays the chime on its own task, so the screen keeps moving; false if one is already playing. */
bool sound_chime_async(int volume);
