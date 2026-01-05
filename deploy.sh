#!/bin/bash

# Configuration
APP_ID="abmB45mGZB.MacIPTVTest"
PKG_ID="abmB45mGZB"
WGT_NAME="MacIPTVTest.wgt"
PROJECT_PATH="."
CERT_PROFILE="GalaxyTV_2025" # Change this to your certificate profile name
TARGET_IP="192.168.3.17" # Change this or pass as argument
TARGET_DEVICE="UE55NU7100" # Typically sdb connects to one dev, but useful if multiple

# Use first argument as IP if provided
if [ ! -z "$1" ]; then
    TARGET_IP=$1
fi

echo "--- Cleaning ---"
rm -rf .build
rm -f $WGT_NAME

echo "--- Building Web App ---"
tizen build-web -- "$PROJECT_PATH"
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "--- Packaging ---"
# Assuming 'tizen' is in path. 'tizen package' creates the wgt
# -t wgt: type widget
# -s $CERT_PROFILE: security profile for signing
# -- .buildResult: input directory (default output of build-web)
tizen package -t wgt -s "$CERT_PROFILE" -- .buildResult
if [ $? -ne 0 ]; then
    echo "Packaging failed! Check if certificate profile '$CERT_PROFILE' exists."
    exit 1
fi

# Move the created wgt to root (tizen package outputs to current dir usually)
mv .buildResult/*.wgt $WGT_NAME

echo "--- Connecting to Device ($TARGET_IP) ---"
sdb connect $TARGET_IP

echo "--- Installing ---"
tizen install -n $WGT_NAME -t "$TARGET_DEVICE" -- .
# Simple install command if target is connected might just be:
# tizen install -n $WGT_NAME -t $(sdb devices | grep device | awk '{print $1}')

echo "--- Running ---"
tizen run -p $APP_ID -t "$TARGET_DEVICE"

echo "Done."
