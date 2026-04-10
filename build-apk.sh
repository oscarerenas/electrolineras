#!/bin/bash
set -e

export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/build-tools/34.0.0:$PATH

echo "📦 Sincronizando web assets con Capacitor..."
npx cap sync

echo "🔨 Compilando APK firmada..."
cd android && ./gradlew assembleRelease --quiet 2>&1 | grep -v "^e: .*expected version"
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "❌ Build fallido." && exit 1
fi

APK="app/build/outputs/apk/release/app-release.apk"
SIZE=$(du -h "$APK" | cut -f1)
echo "✅ APK generada: $APK ($SIZE)"

if adb devices | grep -q "device$"; then
  read -rp "📱 Pixel conectado. ¿Instalar ahora? [s/N] " answer
  if [[ "$answer" =~ ^[sS]$ ]]; then
    adb install -r "$APK"
    echo "🚀 Instalada en el dispositivo."
  fi
else
  echo "💡 Para instalar: adb install android/$APK"
fi
