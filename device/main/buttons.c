#include "buttons.h"
#include <stdio.h>
#include "board.h"
#include "bsp/esp-bsp.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "ui.h"

/* The upper button: the TCA9554's input port, bit 4, high while pressed. */
#define EXPANDER_ADDR 0x20
#define EXPANDER_INPUT 0x00
#define PWR_BIT (1 << 4)

/* The lower button: BOOT, low while pressed. */
#define BOOT_GPIO GPIO_NUM_0

/*
 * Held this long, the lower button ends the walk (it asks first). The upper
 * isn't given a hold: held for a few seconds, the power manager switches the
 * board off, so a long press of it means nothing here and only a short one counts.
 */
#define HOLD_MS 1000
#define SHORT_MS 1000

static const char *TAG = "buttons";
static i2c_master_dev_handle_t expander;

typedef struct {
    bool down, held;
    int64_t since_ms;
} key_state_t;

static key_state_t upper, lower;

/* The last few presses, for the console ("buttons"), so the real buttons can be checked after the fact. */
#define LOGGED 8
static struct {
    button_t b;
    int64_t at_ms;
} logged[LOGGED];
static int logged_n;
static bool raw_pwr, raw_boot;

bool buttons_init(void)
{
    gpio_config_t io = {
        .pin_bit_mask = 1ULL << BOOT_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    gpio_config(&io);
    expander = board_i2c_device(EXPANDER_ADDR, 400000);
    return expander != NULL;
}

static void press(button_t b)
{
    static const char *names[] = {"upper", "lower", "lower held"};
    ESP_LOGI(TAG, "%s", names[b]);
    logged[logged_n % LOGGED].b = b;
    logged[logged_n % LOGGED].at_ms = esp_timer_get_time() / 1000;
    logged_n++;
    /* Never with the bus held: the display's touch read takes the bus inside the display lock. */
    bsp_display_lock((uint32_t)-1);
    ui_button(b);
    bsp_display_unlock();
}

/** Follows one key; returns what it did, if anything (-1 for nothing). */
static int follow(key_state_t *k, bool down, int64_t now, bool can_hold)
{
    int did = -1;
    if (down && !k->down) {
        k->since_ms = now;
        k->held = false;
    } else if (down && can_hold && !k->held && now - k->since_ms >= HOLD_MS) {
        k->held = true;
        did = BTN_LOWER_HELD;
    } else if (!down && k->down && !k->held && now - k->since_ms < SHORT_MS) {
        did = can_hold ? BTN_LOWER : BTN_UPPER;
    }
    k->down = down;
    return did;
}

void buttons_poll(void)
{
    int64_t now = esp_timer_get_time() / 1000;

    uint8_t port = 0;
    bool pwr = false;
    if (expander) {
        board_bus_lock();
        esp_err_t err = board_reg_read(expander, EXPANDER_INPUT, &port, 1);
        board_bus_unlock();
        pwr = err == ESP_OK && (port & PWR_BIT);
    }
    bool boot = gpio_get_level(BOOT_GPIO) == 0;
    raw_pwr = pwr, raw_boot = boot;

    int a = follow(&upper, pwr, now, false);
    int b = follow(&lower, boot, now, true);
    if (a >= 0) press((button_t)a);
    if (b >= 0) press((button_t)b);
}

void buttons_print(void)
{
    static const char *names[] = {"upper", "lower", "lower-held"};
    int64_t now = esp_timer_get_time() / 1000;
    printf("OK upper=%s lower=%s presses=%d", raw_pwr ? "down" : "up", raw_boot ? "down" : "up", logged_n);
    for (int i = LV_MAX(0, logged_n - LOGGED); i < logged_n; i++) {
        printf(" %s@-%llds", names[logged[i % LOGGED].b], (now - logged[i % LOGGED].at_ms) / 1000);
    }
    printf("\n");
}
