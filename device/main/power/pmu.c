#include "pmu.h"
#include "board.h"
#include "freertos/FreeRTOS.h"

#define ADDR 0x34
#define REG_STATUS1 0x00     /* bit 5: USB good; bit 3: battery present */
#define REG_STATUS2 0x01     /* bits 7:5: 001 charging; bit 3: USB in (inverted) */
#define REG_ADC_ENABLE 0x30  /* bit 0 battery, 2 USB, 3 system, 4 die temperature */
#define REG_BATTERY_MV 0x34  /* 13 bits, high then low */
#define REG_USB_MV 0x38      /* 14 bits */
#define REG_SYSTEM_MV 0x3A   /* 14 bits */
#define REG_TEMP 0x3C        /* 14 bits */
#define REG_BATTERY_DETECT 0x68
#define REG_PERCENT 0xA4

static i2c_master_dev_handle_t dev;
static pmu_state_t state;
static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;

static uint16_t read14(uint8_t reg, uint8_t mask)
{
    uint8_t b[2] = {0};
    if (board_reg_read(dev, reg, b, 2) != ESP_OK) return 0;
    return (uint16_t)((b[0] & mask) << 8 | b[1]);
}

bool pmu_init(void)
{
    dev = board_i2c_device(ADDR, 400000);
    if (!dev) return false;
    uint8_t adc = 0, det = 0;
    if (board_reg_read(dev, REG_ADC_ENABLE, &adc, 1) != ESP_OK) return false;
    /* Measure the battery, USB and system rails and the die temperature. */
    board_reg_write(dev, REG_ADC_ENABLE, adc | 0x1D);
    board_reg_read(dev, REG_BATTERY_DETECT, &det, 1);
    board_reg_write(dev, REG_BATTERY_DETECT, det | 0x01);
    pmu_poll();
    return true;
}

void pmu_poll(void)
{
    if (!dev) return;
    board_bus_lock();
    pmu_state_t s = {0};
    uint8_t st1 = 0, st2 = 0, pct = 0;
    s.ok = board_reg_read(dev, REG_STATUS1, &st1, 1) == ESP_OK && board_reg_read(dev, REG_STATUS2, &st2, 1) == ESP_OK;
    if (s.ok) {
        s.usb = (st1 & 0x20) && !(st2 & 0x08);
        s.battery = st1 & 0x08;
        s.charging = (st2 >> 5) == 0x01;
        s.battery_mv = s.battery ? read14(REG_BATTERY_MV, 0x1F) : 0;
        s.usb_mv = s.usb ? read14(REG_USB_MV, 0x3F) : 0;
        s.system_mv = read14(REG_SYSTEM_MV, 0x3F);
        s.temp_c = 22.0f + (7274 - (int)read14(REG_TEMP, 0x3F)) / 20.0f;
        s.percent = s.battery && board_reg_read(dev, REG_PERCENT, &pct, 1) == ESP_OK ? pct : -1;
    }
    board_bus_unlock();
    portENTER_CRITICAL(&lock);
    state = s;
    portEXIT_CRITICAL(&lock);
}

pmu_state_t pmu_state(void)
{
    portENTER_CRITICAL(&lock);
    pmu_state_t s = state;
    portEXIT_CRITICAL(&lock);
    return s;
}
