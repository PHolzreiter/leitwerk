# LeitWerk-Plugin für X-Plane 12 (Einsatz-App als Fenster, auch in VR)
#   cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release
# Ergebnis: build/LeitWerk/<win_x64|mac_x64|lin_x64>/LeitWerk.xpl
cmake_minimum_required(VERSION 3.16)
project(LeitWerkXPlane CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(LEITWERK_PLUGIN_VERSION "0.2.1" CACHE STRING "Version des Plugins")

set(SDK ${CMAKE_CURRENT_SOURCE_DIR}/sdk)
set(IMGUI ${CMAKE_CURRENT_SOURCE_DIR}/extern/imgui)

add_library(LeitWerk SHARED
  src/plugin.cpp src/ansicht.cpp src/karte.cpp src/netz.cpp src/wetter.cpp
  ${IMGUI}/imgui.cpp ${IMGUI}/imgui_draw.cpp ${IMGUI}/imgui_tables.cpp ${IMGUI}/imgui_widgets.cpp)

target_include_directories(LeitWerk PRIVATE src ${IMGUI} extern/stb ${SDK}/CHeaders/XPLM)
target_compile_definitions(LeitWerk PRIVATE XPLM200=1 XPLM210=1 XPLM300=1 XPLM301=1 XPLM302=1 XPLM303=1 XPLM400=1 XPLM410=1 XPLM411=1 XPLM420=1
  LEITWERK_PLUGIN_VERSION="${LEITWERK_PLUGIN_VERSION}" IMGUI_DISABLE_OBSOLETE_FUNCTIONS IMGUI_DISABLE_DEMO_WINDOWS)
set_target_properties(LeitWerk PROPERTIES PREFIX "" OUTPUT_NAME "LeitWerk" SUFFIX ".xpl")

if(WIN32)
  set(PLATTFORM win_x64)
  target_compile_definitions(LeitWerk PRIVATE IBM=1 _CRT_SECURE_NO_WARNINGS NOMINMAX)
  target_link_libraries(LeitWerk PRIVATE ${SDK}/Libraries/Win/XPLM_64.lib opengl32 ws2_32)
  if(MSVC)
    # statische Laufzeit: läuft ohne zusätzliche Visual-C++-Pakete
    set_property(TARGET LeitWerk PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded")
    target_compile_options(LeitWerk PRIVATE /utf-8 /W3)
  endif()
elseif(APPLE)
  set(PLATTFORM mac_x64)
  target_compile_definitions(LeitWerk PRIVATE APL=1 GL_SILENCE_DEPRECATION)
  target_compile_options(LeitWerk PRIVATE -fvisibility=hidden)
  find_library(OPENGL OpenGL)
  target_link_libraries(LeitWerk PRIVATE ${OPENGL} "-F${SDK}/Libraries/Mac" "-framework XPLM")
  set_target_properties(LeitWerk PROPERTIES OSX_ARCHITECTURES "x86_64;arm64")
else()
  set(PLATTFORM lin_x64)
  target_compile_definitions(LeitWerk PRIVATE LIN=1)
  target_compile_options(LeitWerk PRIVATE -fvisibility=hidden -fPIC)
  # X-Plane stellt die XPLM-Funktionen beim Laden bereit (keine Bibliothek zum Linken)
  find_package(OpenGL REQUIRED)
  find_package(Threads REQUIRED)
  target_link_libraries(LeitWerk PRIVATE OpenGL::GL Threads::Threads)
endif()

set_target_properties(LeitWerk PROPERTIES
  LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/LeitWerk/${PLATTFORM}
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/LeitWerk/${PLATTFORM}
  LIBRARY_OUTPUT_DIRECTORY_RELEASE ${CMAKE_BINARY_DIR}/LeitWerk/${PLATTFORM}
  RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_BINARY_DIR}/LeitWerk/${PLATTFORM})
