#!/bin/bash

echo "🔄 Restoring Normal Audio Settings..."
echo "===================================="

# Function to set audio output device
set_output_device() {
    local device_name="$1"
    osascript -e "
    tell application \"System Events\"
        tell process \"System Preferences\"
            activate
        end tell
    end tell
    
    delay 1
    
    tell application \"System Preferences\"
        set current pane to pane \"com.apple.preference.sound\"
        activate
    end tell
    " 2>/dev/null || true
}

echo "📱 Current audio devices:"
system_profiler SPAudioDataType | grep -A1 -B1 "AirPods\|BlackHole\|Default"

echo ""
echo "🔧 Quick Fix Options:"
echo "1. Go to System Settings > Sound > Output"
echo "2. Select your AirPods directly"
echo ""
echo "🗑️ To completely remove the Multi-Output Device:"
echo "1. Open Audio MIDI Setup"
echo "2. Right-click 'Oatmeal Audio Capture'"  
echo "3. Select 'Remove Selected Device'"
echo ""
echo "✅ Your audio will work normally once you switch the output device!"
echo "The AirPods themselves are never modified - only the routing preference."

# Try to get current output device
current_output=$(osascript -e "get volume settings" 2>/dev/null | grep -o "output volume:[0-9]*" || echo "Unable to detect current output")

echo ""
echo "💡 Current system audio: $current_output"
echo "If you have no sound, just change output device in System Settings > Sound"