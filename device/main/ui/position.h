/**
 * Where you are, for the walks and the free map: the GNSS fix, or at the desk
 * a position set from the console ("here <lat> <lon>"), which can then walk
 * itself toward wherever you're going ("here walk") so both can be tried
 * indoors.
 */
#pragma once
#include <stdbool.h>

typedef struct {
    bool known;     /* a fix, or a pretend position */
    bool pretend;   /* set from the console, not the sky */
    bool moving;    /* fast enough for the course to mean something */
    double lat, lon;
    float course;   /* degrees clockwise from north, while moving */
    float accuracy; /* metres, about: the GNSS's HDOP times a typical 5 m */
} position_t;

position_t position_now(void);

/** Pretends you're here (the console's "here"); off: back to the sky. */
void position_pretend(double lat, double lon);
void position_pretend_off(void);

/** A pretend position walks `metres` toward (lat, lon); a real one is left to your feet. */
void position_walk_toward(double lat, double lon, double metres);

/** Whether a pretend position walks itself along a walk's route ("here walk"), at walking pace. */
void position_pretend_walking(bool on);
bool position_walks_itself(void);

/** Metres and bearing (degrees from north) between two points: near enough for a town. */
double position_metres(double lat1, double lon1, double lat2, double lon2);
double position_bearing(double lat1, double lon1, double lat2, double lon2);
