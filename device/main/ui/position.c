#include "position.h"
#include <math.h>
#include "esp_timer.h"
#include "gnss/gnss.h"

#define EARTH_M 6371000.0
#define MOVING_KMH 2.5 /* below a slow walk the course is noise (standing indoors, the fix wanders at 1–2 km/h) */
#define UERE_M 5.0f    /* a typical error for each unit of HDOP */
#define PRETEND_M 3.0f

static bool pretending;
static double pretend_lat, pretend_lon;
static float pretend_course;
static int64_t pretend_walked_ms = -1000000; /* when it last walked: moving while that's recent */
static bool walks_itself;

static double rad(double d)
{
    return d * M_PI / 180.0;
}

double position_metres(double lat1, double lon1, double lat2, double lon2)
{
    double x = rad(lon2 - lon1) * cos(rad((lat1 + lat2) / 2)), y = rad(lat2 - lat1);
    return sqrt(x * x + y * y) * EARTH_M;
}

double position_bearing(double lat1, double lon1, double lat2, double lon2)
{
    double x = rad(lon2 - lon1) * cos(rad((lat1 + lat2) / 2)), y = rad(lat2 - lat1);
    double b = atan2(x, y) * 180.0 / M_PI;
    return b < 0 ? b + 360 : b;
}

position_t position_now(void)
{
    if (pretending) {
        position_t p = {.known = true, .pretend = true, .lat = pretend_lat, .lon = pretend_lon,
                        .course = pretend_course, .accuracy = PRETEND_M};
        p.moving = esp_timer_get_time() / 1000 - pretend_walked_ms < 2000;
        return p;
    }
    gnss_state_t g = gnss_state();
    position_t p = {.known = g.fix, .lat = g.lat, .lon = g.lon, .course = g.course,
                    .accuracy = g.hdop > 0 ? g.hdop * UERE_M : 99};
    p.moving = g.fix && g.speed_kmh >= MOVING_KMH;
    return p;
}

void position_pretend(double lat, double lon)
{
    pretending = true;
    pretend_lat = lat, pretend_lon = lon;
    pretend_walked_ms = -1000000;
}

void position_pretend_off(void)
{
    pretending = false;
    walks_itself = false;
}

void position_pretend_walking(bool on)
{
    walks_itself = on && pretending;
}

bool position_walks_itself(void)
{
    return pretending && walks_itself;
}

void position_walk_toward(double lat, double lon, double metres)
{
    if (!pretending) return;
    double d = position_metres(pretend_lat, pretend_lon, lat, lon);
    if (d < 0.5) return;
    double f = metres >= d ? 1.0 : metres / d;
    pretend_course = (float)position_bearing(pretend_lat, pretend_lon, lat, lon);
    pretend_lat += (lat - pretend_lat) * f;
    pretend_lon += (lon - pretend_lon) * f;
    pretend_walked_ms = esp_timer_get_time() / 1000;
}
