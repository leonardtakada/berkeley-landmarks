/**
 * The narration, from the SD card: one file per part (a stop's narration,
 * shared by every walk it's on, and each walk's introduction and end), packed
 * by scripts/narration/pack_guide.py into /sdcard/guide as IMA4 ADPCM at
 * 16 kHz in a CAF, with parts.txt saying how long each is and who speaks from
 * when. Played on its own task, the speaker borrowed from sound.c.
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

#define PLAYER_DIR "/sdcard/guide"
#define PLAYER_MAX_SECTIONS 6

typedef struct {
    char speaker[12]; /* an architect's key, or "guide" */
    uint32_t from_ms;
} player_section_t;

/** What parts.txt says of a part: its length, and who speaks from when. */
typedef struct {
    uint32_t length_ms;
    int sections;
    player_section_t section[PLAYER_MAX_SECTIONS];
} player_part_t;

/** The part named ("lm17", "w01i"), if the card has it; NULL if not (no card yet, or not packed). */
const player_part_t *player_part(const char *name);

/** Reads parts.txt again next time (after new parts are loaded onto the card). Call from the display's task. */
void player_forget_index(void);

/** Plays a part from `at_ms`; false if the card doesn't have it. Stops whatever was playing. */
bool player_play(const char *name, uint32_t at_ms);

void player_pause(bool paused);
void player_seek(uint32_t ms);
void player_stop(void);

/** The volume, in the controls' steps (0 silent … 10). */
void player_set_volume(int steps);

typedef struct {
    bool active;  /* a part is loaded */
    bool playing; /* and not paused */
    bool done;    /* it played to its end */
    uint32_t at_ms, length_ms;
} player_state_t;

player_state_t player_state(void);

/** True if that part is the one loaded (playing or paused). */
bool player_is(const char *name);

/** The speaker's volume (0–100) for the controls' steps: shared with the guide's own sounds. */
int player_codec_volume(int steps);
