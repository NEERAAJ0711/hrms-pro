## Flutter wrapper
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }
-keep class io.flutter.plugin.editing.** { *; }

## ML Kit
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_face.** { *; }

## Geolocator
-keep class com.baseflow.geolocator.** { *; }

## Image Picker
-keep class io.flutter.plugins.imagepicker.** { *; }

## Secure Storage
-keep class com.it_nomads.fluttersecurestorage.** { *; }

## Camera
-keep class io.flutter.plugins.camera.** { *; }

## ML Kit vision internals (used by face detection). ML Kit AARs ship their own
## consumer ProGuard rules, so we only pin the vision-face internals + odml here
## rather than blanket-keeping all of Google Play Services (which would block R8 shrink).
-keep class com.google.android.gms.internal.mlkit_vision_face.** { *; }
-keep class com.google.android.odml.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.mlkit.**

## Keep anything annotated with @Keep
-keep @androidx.annotation.Keep class * { *; }
-keepclasseswithmembers class * {
    @androidx.annotation.Keep <methods>;
}

## Kotlin metadata (prevents reflection-based breakage)
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**

## Suppress warnings for optional/desugar classes that R8 may not resolve
-dontwarn javax.annotation.**
-dontwarn org.checkerframework.**
-dontwarn org.jetbrains.annotations.**
