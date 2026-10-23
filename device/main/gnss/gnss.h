/**
 * The LC76G GNSS module, read over I2C in its own task (Waveshare's
 * 09_LC76G_I2C protocol, with the care gnss.c describes). Parses
 * the NMEA it sends: RMC for the fix, position, speed and course; GGA for
 * satellites used and HDOP; GSV for satellites in view.
 * The first fix, and the latest every half minute, are kept in flash, so an
 * outdoor test can be read back at the desk ("gps log").
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool ok;            /* the module answers on I2C */
    bool fix;
    int quality;        /* GGA: 0 none, 1 GPS, 2 DGPS … */
    int sats_used, sats_in_view;
    float hdop;
    double lat, lon;    /* degrees */
    float alt_m, speed_kmh, course;
    char utc[9];        /* hh:mm:ss */
    char date[11];      /* yyyy-mm-dd */
    uint32_t bytes, sentences, bad;
    int64_t first_fix_ms; /* since boot, −1 until there is one */
} gnss_state_t;

/** What was kept from a fix, in flash. */
typedef struct {
    int64_t after_ms; /* since boot */
    double lat, lon;
    float hdop;
    int sats_used, sats_in_view;
    char utc[9], date[11];
} gnss_record_t;

bool gnss_start(void);

/** Waits (up to `timeout_ms`) for the module's first words, at its quieter output; true once heard. */
bool gnss_wait_quiet(uint32_t timeout_ms);
gnss_state_t gnss_state(void);

/** Stops (or restarts) polling, so the module can be probed by hand. */
void gnss_pause(bool on);

/** Keeps the reader paused from boot (saved in flash), for stepping through by hand. */
void gnss_set_manual(bool on);

/** By hand: one length request and one read of up to `len` − 1 bytes into `out`, NUL-ended.
 *  Returns the bytes read, 0 if none waiting, −1 if the length was refused, −2 if the data was. */
int gnss_read_once(char *out, size_t len);

/** Sends a command sentence ("PQTMVERNO" goes as "$PQTMVERNO*58\r\n"); false if refused. */
bool gnss_send(const char *body);

/** Reads a byte at 0x54 and 0x58, which ends an answer the module is stuck in (the reader does it too). */
void gnss_unstick(void);

/** Echo the module's sentences to the console as they arrive. */
void gnss_echo(bool on);

/** The kept first fix and latest fix; false where there's none. */
bool gnss_record(const char *which, gnss_record_t *out);
