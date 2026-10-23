# The pocket guide: Berkeley Tours on the Waveshare ESP32-S3-Touch-AMOLED-1.75.
# Build with ESP-IDF v6.0.2: . ~/esp/esp-idf/export.sh && idf.py build
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
add_compile_options(-Wno-format)
project(pocket_guide)
