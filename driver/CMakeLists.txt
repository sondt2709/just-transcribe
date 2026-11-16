# "Just Transcribe Microphone" Audio Server Plug-in.
# Build with scripts/build-driver.sh; it produces JustTranscribeMic.driver.
cmake_minimum_required(VERSION 3.12.0)
project(JustTranscribeMic CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_OSX_ARCHITECTURES "arm64" CACHE STRING "")
set(CMAKE_OSX_DEPLOYMENT_TARGET "14.2" CACHE STRING "")

set(DRIVER_NAME "JustTranscribeMic")
# Bump on every driver change: the app compares this with the installed driver.
set(DRIVER_VERSION "1.0.0")
set(DRIVER_COPYRIGHT "Copyright (c) Just Transcribe authors")
set(DRIVER_IDENTIFIER "com.just-transcribe.mic")
set(DRIVER_UID "DAACA563-8A7F-4363-A088-167935780D71")
set(DRIVER_ENTRYPOINT "JustTranscribeMicEntryPoint")
set(LIBASPL_TAG "v3.1.2")

include(ExternalProject)
ExternalProject_Add(libASPL
  GIT_REPOSITORY https://github.com/gavv/libASPL.git
  GIT_TAG ${LIBASPL_TAG}
  GIT_SHALLOW TRUE
  BINARY_DIR ${CMAKE_CURRENT_BINARY_DIR}/libASPL-build
  INSTALL_DIR ${CMAKE_CURRENT_BINARY_DIR}/libASPL-prefix
  CMAKE_ARGS
    -DCMAKE_INSTALL_PREFIX=<INSTALL_DIR>
    -DCMAKE_OSX_ARCHITECTURES=${CMAKE_OSX_ARCHITECTURES}
    -DCMAKE_OSX_DEPLOYMENT_TARGET=${CMAKE_OSX_DEPLOYMENT_TARGET}
    -DBUILD_TESTING=OFF
  )

add_library(${DRIVER_NAME} MODULE Driver.cpp)
add_dependencies(${DRIVER_NAME} libASPL)
target_include_directories(${DRIVER_NAME} PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/libASPL-prefix/include)
target_link_libraries(${DRIVER_NAME} PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/libASPL-prefix/lib/libASPL.a)
find_library(LIB_CoreFoundation CoreFoundation REQUIRED)
target_link_libraries(${DRIVER_NAME} PRIVATE ${LIB_CoreFoundation})

set_target_properties(${DRIVER_NAME} PROPERTIES
  OUTPUT_NAME "${DRIVER_NAME}"
  BUNDLE true
  BUNDLE_EXTENSION "driver"
  PREFIX ""
  SUFFIX ""
  MACOSX_BUNDLE ON
  MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist.in"
  MACOSX_BUNDLE_BUNDLE_NAME "${DRIVER_NAME}"
  MACOSX_BUNDLE_BUNDLE_VERSION "${DRIVER_VERSION}"
  MACOSX_BUNDLE_COPYRIGHT "${DRIVER_COPYRIGHT}"
  MACOSX_BUNDLE_GUI_IDENTIFIER "${DRIVER_IDENTIFIER}"
  MACOSX_BUNDLE_SHORT_VERSION_STRING "${DRIVER_VERSION}"
  )
