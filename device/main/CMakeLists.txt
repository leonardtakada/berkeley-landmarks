include(${CMAKE_CURRENT_LIST_DIR}/art/art_files.cmake)
file(GLOB FONT_SRCS ${CMAKE_CURRENT_LIST_DIR}/fonts/*.c)
file(GLOB UI_SRCS ${CMAKE_CURRENT_LIST_DIR}/ui/*.c)

idf_component_register(
    SRCS main.c console.c board.c hw.c buttons.c art/art.c ${FONT_SRCS} ${UI_SRCS}
         power/pmu.c heading/imu.c gnss/gnss.c storage/card.c audio/sound.c
    INCLUDE_DIRS . fonts art ui
    EMBED_FILES ${ART_FILES}
    REQUIRES esp_driver_usb_serial_jtag esp_driver_uart esp_timer mbedtls nvs_flash fatfs)

target_compile_definitions(${COMPONENT_LIB} PRIVATE LV_LVGL_H_INCLUDE_SIMPLE)
