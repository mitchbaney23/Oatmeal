#!/bin/bash

echo "🎵 Safe Audio Setup for Oatmeal"
echo "==============================="
echo ""
echo "🛡️ SAFETY FIRST:"
echo "✓ This setup is completely reversible"
echo "✓ Your AirPods will not be modified"  
echo "✓ Run './restore_audio.sh' if anything goes wrong"
echo "✓ Or just change output device in System Settings > Sound"
echo ""

# Function to run AppleScript commands
run_applescript() {
    osascript -e "$1"
}

echo "📱 Step 1: Opening Audio MIDI Setup..."

# Open Audio MIDI Setup
open "/System/Applications/Utilities/Audio MIDI Setup.app"

echo ""
echo "🎧 Step 2: Setting up Multi-Output Device"
echo ""
echo "In Audio MIDI Setup, please follow these steps:"
echo ""
echo "1. Click the '+' button in the bottom-left corner"
echo "2. Select 'Create Multi-Output Device'"
echo "3. Name it 'Oatmeal Audio Capture'"
echo "4. Check BOTH:"
echo "   ✓ Your AirPods (so you can hear audio)"
echo "   ✓ BlackHole 16ch (so Oatmeal can record)"
echo "5. Make sure 'BlackHole 16ch' is checked as 'Drift Correction'"
echo "6. DON'T change system output yet - we'll test first!"
echo ""
echo "⚙️ Step 3: Safe Testing"
echo ""
echo "1. First, test that the Multi-Output Device works:"
echo "   - Go to System Settings > Sound > Output"  
echo "   - Temporarily select 'Oatmeal Audio Capture'"
echo "   - Play some music - you should hear it in AirPods"
echo "   - If it works, continue. If not, switch back to AirPods!"
echo ""
echo "2. Test Oatmeal recording with the new setup"
echo "3. If everything works, you can leave it set to 'Oatmeal Audio Capture'"
echo ""
echo "This will send audio to both your AirPods AND BlackHole,"
echo "allowing Oatmeal to record system audio while you still hear it!"
echo ""
echo "Press Enter when you've completed the setup..."
read -p ""

echo "✅ Audio routing setup complete!"
echo ""
echo "🚀 Now restart Oatmeal and test recording with your AirPods."
echo "You should now capture both your voice AND system audio!"