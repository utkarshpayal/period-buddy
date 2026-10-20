import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { AppLockCover } from "./AppLockScreen";
import { motion } from "./motion";
import { useTheme } from "./theme";

type Props = {
  visible: boolean;
  /**
   * The person asked to close it (backdrop tap, swipe down, Android back).
   * Usually sets `visible` to false. If `visible` stays true (e.g. a
   * "discard changes?" prompt), the sheet springs back up.
   */
  onClose: () => void;
  /** Runs once the sheet has fully left the screen. */
  onDismissed?: () => void;
  /**
   * Slide the sheet away before calling `onClose` (default). Turn off when
   * `onClose` may ask a question first, so the sheet stays behind the prompt.
   */
  animateOutBeforeClose?: boolean;
  /** Lift the sheet above the keyboard (padding on iOS; Android's Modal window resizes itself). */
  avoidKeyboard?: boolean;
  androidKeyboardBehavior?: "height" | "padding";
  keyboardVerticalOffset?: number;
  /** Sheet container style: padding, maxHeight, height, background override. */
  style?: StyleProp<ViewStyle>;
  backdropLabel?: string;
  /**
   * Drawn above the sheet in the same Modal window, e.g. `<AppModalHost inline />`
   * so alerts opened from the sheet show on top of it. The app-lock cover is
   * always added after it.
   */
  overlay?: React.ReactNode;
  children: React.ReactNode;
};

const SWIPE_CLOSE_FRACTION = 0.25;
const SWIPE_CLOSE_VELOCITY = 900;

/**
 * The one bottom sheet: the backdrop fades while the sheet springs up from
 * the bottom, and the grab handle drags it down to close. Use it for any
 * partial-height sheet over a dimmed screen (not full-screen pageSheet modals).
 * The sheet's top corners, background and grab handle come from here; put
 * padding and height limits in `style`, safe-area bottom padding in children.
 */
export function BottomSheet({
  visible,
  onClose,
  onDismissed,
  animateOutBeforeClose = true,
  avoidKeyboard,
  androidKeyboardBehavior,
  keyboardVerticalOffset,
  style,
  backdropLabel = "Close",
  overlay,
  children,
}: Props) {
  const { colors, isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const sheetHeight = useSharedValue(windowHeight);
  const translateY = useSharedValue(windowHeight);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Both a gesture close and the owner flipping `visible` lead here; dismiss once per opening.
  const dismissedRef = useRef(!visible);

  const springIn = useCallback(() => {
    translateY.value = withSpring(0, motion.spring);
  }, [translateY]);

  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  // Hide the (already off-screen) Modal. iOS can't present another modal
  // until this one has finished dismissing, so there `onDismissed` waits for
  // the Modal's own onDismiss; elsewhere it runs straight away.
  const finishDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setMounted(false);
    if (Platform.OS !== "ios") onDismissedRef.current?.();
  }, []);

  const slideOut = useCallback(
    (then: () => void) => {
      translateY.value = withTiming(
        sheetHeight.value,
        { duration: motion.duration.slow * 0.75, easing: motion.easing.exit },
        (finished) => {
          if (finished) runOnJS(then)();
        },
      );
    },
    [sheetHeight, translateY],
  );

  useEffect(() => {
    if (visible) {
      dismissedRef.current = false;
      setMounted(true);
      translateY.value = sheetHeight.value;
      springIn();
    } else if (mounted && !dismissedRef.current) {
      slideOut(finishDismiss);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on visibility changes only
  }, [visible]);

  // Ask the owner to close; spring back if it decided to stay open.
  const requestClose = useCallback(() => {
    const afterClose = () =>
      setTimeout(() => {
        if (visibleRef.current) springIn();
        else finishDismiss();
      }, 0);
    if (animateOutBeforeClose) {
      slideOut(() => {
        onClose();
        afterClose();
      });
    } else {
      onClose();
      setTimeout(() => {
        if (visibleRef.current) springIn();
      }, 0);
    }
  }, [animateOutBeforeClose, finishDismiss, onClose, slideOut, springIn]);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      // Down follows the finger; up resists a little so it feels attached.
      translateY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.15;
    })
    .onEnd((e) => {
      const shouldClose =
        translateY.value > sheetHeight.value * SWIPE_CLOSE_FRACTION || e.velocityY > SWIPE_CLOSE_VELOCITY;
      if (shouldClose) runOnJS(requestClose)();
      else translateY.value = withSpring(0, motion.spring);
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, sheetHeight.value], [1, 0], "clamp"),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(translateY.value, -24) }],
  }));

  const sheet = (
    <Animated.View
      accessibilityViewIsModal
      onLayout={(e) => {
        sheetHeight.value = e.nativeEvent.layout.height;
      }}
      style={[
        {
          backgroundColor: colors.background,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          // Dark: a hairline lifts the sheet off the dimmed page.
          borderWidth: isDark ? 1 : 0,
          borderBottomWidth: 0,
          borderColor: colors.border,
          overflow: "hidden",
        },
        style,
        sheetStyle,
      ]}
    >
      <GestureDetector gesture={pan}>
        <View
          accessible={false}
          // Full width even when the sheet centres its content, so the whole top edge drags.
          style={{ alignSelf: "stretch", alignItems: "center", justifyContent: "center", height: 22, marginBottom: 2 }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>
      </GestureDetector>
      {children}
    </Animated.View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
      onDismiss={() => onDismissedRef.current?.()}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          enabled={Boolean(avoidKeyboard)}
          behavior={Platform.OS === "ios" ? "padding" : androidKeyboardBehavior}
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={backdropLabel}
              onPress={requestClose}
              style={{ flex: 1 }}
            />
          </Animated.View>
          {sheet}
        </KeyboardAvoidingView>
        {overlay}
        <AppLockCover />
      </GestureHandlerRootView>
    </Modal>
  );
}
