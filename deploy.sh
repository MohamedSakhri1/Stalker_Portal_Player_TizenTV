#!/bin/bash

# Configuration
# Tizen Studio Paths - explicit to avoid path issues
TIZEN_CMD="C:/tizen-studio/tools/ide/bin/tizen.bat"
SDB_CMD="C:/tizen-studio/tools/sdb.exe"

APP_ID="abmB45mGZB.MacPlayer"
PKG_ID="abmB45mGZB"
WGT_NAME="MacPlayer.wgt"
PROJECT_PATH="."
CERT_PROFILE="GalaxyTV_2025" # Change this to your certificate profile name

# Setup Target
TARGET_DEVICE=""
USER_IP="$1"

echo "--- Checking for connected devices ---"
# Get list of devices (lines containing 'device')
# Format: "ID       device     Model"
TARGET_DEVICE=$("$SDB_CMD" devices | grep -P "\tdevice" | awk '{print $3}' | head -n 1)

if [ -z "$TARGET_DEVICE" ]; then
    if [ ! -z "$USER_IP" ]; then
        echo "No devices connected. Attempting to connect to $USER_IP..."
        "$SDB_CMD" connect "$USER_IP"
        sleep 2
        # Try again
        TARGET_DEVICE=$("$SDB_CMD" devices | grep -P "\tdevice" | awk '{print $3}' | head -n 1)
    fi
fi

if [ -z "$TARGET_DEVICE" ]; then
    echo "Error: No connected Tizen devices found."
    echo "Usage: ./deploy.sh [IP_ADDRESS]"
    echo "   Or ensure your TV is connected via 'sdb connect <IP>'"
    exit 1
fi

echo "Target Device Found: $TARGET_DEVICE"

echo "--- Cleaning ---"
rm -rf .buildResult

echo "--- Building Web App ---"
# Build the project
"$TIZEN_CMD" build-web -- "$PROJECT_PATH"
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "--- Packaging ---"
# Package into .buildResult directory
"$TIZEN_CMD" package -t wgt -s "$CERT_PROFILE" -- .buildResult
if [ $? -ne 0 ]; then
    echo "Packaging failed! Check if certificate profile '$CERT_PROFILE' exists."
    exit 1
fi

echo "--- Detecting Package ---"
# Find the generated .wgt file
WGT_FILE=$(ls .buildResult/*.wgt | head -n 1)
WGT_NAME=$(basename "$WGT_FILE")

if [ -z "$WGT_NAME" ]; then
    echo "Error: No .wgt file found in .buildResult"
    exit 1
fi
echo "Package found: $WGT_NAME"

echo "--- Installing on $TARGET_DEVICE ---"
# Install directly from the output directory
"$TIZEN_CMD" install -n "$WGT_NAME" -t "$TARGET_DEVICE" -- .buildResult

if [ $? -eq 0 ]; then
    echo "--- Running ---"
    "$TIZEN_CMD" run -p "$APP_ID" -t "$TARGET_DEVICE"
else
    echo "Installation failed."
    exit 1
fi

echo "Done."
