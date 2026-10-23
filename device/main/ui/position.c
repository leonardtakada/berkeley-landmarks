#include "position.h"
#include <math.h>
#include "gnss/gnss.h"

#define EARTH_M 6371000.0
#define MOVING_KMH 1.5 /* below a slow walk, the course is noise */

static bool pretending;
static double pretend_lat, pretend_lon;
static float pretend_course;
static bool pretend_moving;

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
                        .course = pretend_course, .moving = pretend_moving};
        pretend_moving = false; /* until it walks again */
        return p;
    }
    gnss_state_t g = gnss_state();
    position_t p = {.known = g.fix, .lat = g.lat, .lon = g.lon, .course = g.course};
    p.moving = g.fix && g.speed_kmh >= MOVING_KMH;
    return p;
}

void position_pretend(double lat, double lon)
{
    pretending = true;
    pretend_lat = lat, pretend_lon = lon;
    pretend_moving = false;
}

void position_pretend_off(void)
{
    pretending = false;
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
    pretend_moving = true;
}
