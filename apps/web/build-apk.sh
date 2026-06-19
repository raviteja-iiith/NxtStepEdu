#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  NxtStepEdu APK Build Script
#  Run from: apps/web/
#  Usage:
#    ./build-apk.sh            # debug APK (for testing)
#    ./build-apk.sh release    # release APK (for distribution)
# ═══════════════════════════════════════════════════════════════

set -e

MODE=${1:-debug}
echo "▶  Building NxtStepEdu APK — mode: $MODE"

echo ""
echo "1️⃣  Building Next.js static export..."
npm run build

echo ""
echo "2️⃣  Syncing with Capacitor..."
npx cap sync android

echo ""
echo "3️⃣  Building Android APK ($MODE)..."
cd android

if [ "$MODE" = "release" ]; then
  ./gradlew assembleRelease
  APK_PATH="app/build/outputs/apk/release/app-release-unsigned.apk"
  echo ""
  echo "⚠️  Release APK built (unsigned). Sign it before distributing:"
  echo "   apksigner sign --ks your-keystore.jks --out app-release.apk $APK_PATH"
else
  ./gradlew assembleDebug
  APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
  echo ""
  echo "✅ Debug APK ready: android/$APK_PATH"
  echo "   Install on device: adb install $APK_PATH"
fi

cd ..
echo ""
echo "🎉 Done!"
