import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import Pressable from "../PressableFeedback";
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInRight, ZoomIn } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { getFriendlyErrorMessage } from "../../lib/api";
import { requestNotificationPermissionAsync } from "../../lib/notifications";
import { secureGetItem, secureRemoveItem, secureSetItem } from "../../lib/secureStorage";
import {
  addDays,
  CYCLE_LENGTH_RANGE,
  currentCycleDay,
  estimateNextPeriod,
  EMPTY_DRAFT,
  GOAL_OPTIONS,
  onboardingDraftKey,
  parseDraft,
  PERIOD_LENGTH_RANGE,
  PERIOD_RANGE_OPTIONS,
  approximatePeriodStart,
  type OnboardingDraft,
  type TrackingGoal,
} from "../../lib/onboarding";
import { useTheme } from "../theme";
import { BirthdayInput } from "../BirthdayInput";
import { Chip, MonthCalendar, NumberStepper, OptionCard, PrimaryButton, ProgressBar, TextButton } from "./parts";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { Icon } from "../Icon";
import { motion } from "../motion";

export type OnboardingValues = {
  cycleLength: number;
  dateOfBirth: string;
  lastPeriodStartDate: string;
  periodLength: number;
  trackingGoal: TrackingGoal;
  trackingGoals: TrackingGoal[];
};

type OnboardingFlowProps = {
  userId?: string;
  firstName?: string;
  /** Saves the profile and cycle settings. Throws with a user-facing message on failure. */
  onSubmit: (values: OnboardingValues) => Promise<void>;
  /** Called from the finish screen once the user taps through. */
  onFinish: () => Promise<void> | void;
};

// Question order: purpose first (it frames the rest), then the cycle data
// predictions need, then the one profile field the backend requires. Phone
// and photo are intentionally not asked here (Profile → Edit profile).
const STEPS = ["goals", "lastPeriod", "periodLength", "cycleLength", "birthday"] as const;
type StepId = (typeof STEPS)[number] | "ready";

// The onboarding bonus the backend grants on first completion
// (PROFILE_COMPLETE_BONUS in authController.js).
const WELCOME_POINTS = 20;

export function OnboardingFlow({ userId, firstName, onSubmit, onFinish }: OnboardingFlowProps) {
  const { colors, fonts, isDark } = useTheme();
  // The footer sits on the keyboard, not on the home-indicator inset, while it is open.
  const insets = useSafeAreaInsets();
  const draftKey = onboardingDraftKey(userId);
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRanges, setShowRanges] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const today = useMemo(() => new Date(), []);
  const stepId: StepId = isDone ? "ready" : STEPS[draft.stepIndex];
  const name = firstName && firstName.trim() && firstName !== "Nura" ? firstName.trim() : "";

  // Resume where the user left off if the app was closed mid-setup.
  useEffect(() => {
    let cancelled = false;
    secureGetItem(draftKey)
      .then((raw) => {
        if (cancelled) return;
        const saved = parseDraft(raw, STEPS.length);
        setDraft(saved);
        setShowRanges(Boolean(saved.periodRange));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHasLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  useEffect(() => {
    if (!hasLoaded || isDone) return;
    secureSetItem(draftKey, JSON.stringify(draft)).catch(() => {});
  }, [draft, draftKey, hasLoaded, isDone]);

  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    setErrorMessage("");
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const onBirthdayChange = useCallback((dateOfBirth: string) => update({ dateOfBirth }), [update]);

  const goTo = useCallback((index: number) => {
    setErrorMessage("");
    setDirection(index > draft.stepIndex ? 1 : -1);
    setDraft((current) => ({ ...current, stepIndex: index }));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [draft.stepIndex]);

  const goBack = useCallback(() => {
    // Mid-save, swallow Back: returning false would let Android exit the app
    // while the profile is still being written.
    if (isSaving) return true;
    if (isDone || draft.stepIndex === 0) return false;
    goTo(draft.stepIndex - 1);
    return true;
  }, [draft.stepIndex, goTo, isDone, isSaving]);

  // Android hardware back steps backwards instead of leaving the app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => subscription.remove();
  }, [goBack]);

  async function submit() {
    const goals: TrackingGoal[] = draft.goals.length ? draft.goals : ["track_period"];
    const lastPeriodStartDate =
      draft.lastPeriodStartDate || approximatePeriodStart(draft.periodRange ?? "this_week", today);

    setIsSaving(true);
    setErrorMessage("");
    try {
      await onSubmit({
        cycleLength: draft.cycleLength,
        dateOfBirth: draft.dateOfBirth,
        lastPeriodStartDate,
        periodLength: draft.periodLength,
        trackingGoal: goals[0],
        trackingGoals: goals,
      });
      secureRemoveItem(draftKey).catch(() => {});
      setDraft((current) => ({ ...current, lastPeriodStartDate }));
      setDirection(1);
      setIsDone(true);
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function next() {
    if (draft.stepIndex < STEPS.length - 1) goTo(draft.stepIndex + 1);
    else submit();
  }

  async function finish() {
    setIsFinishing(true);
    setErrorMessage("");
    try {
      // The soft ask above explains why; the OS prompt follows. The push
      // token itself is uploaded by auth-context once setup is complete.
      await requestNotificationPermissionAsync().catch(() => null);
      await onFinish();
    } catch {
      setErrorMessage("We couldn't open the app just now. Please try again.");
    } finally {
      setIsFinishing(false);
    }
  }

  if (!hasLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  const canContinue =
    stepId === "lastPeriod" ? Boolean(draft.lastPeriodStartDate || draft.periodRange) :
    stepId === "birthday" ? Boolean(draft.dateOfBirth) :
    true;

  const entering = (direction > 0 ? FadeInRight : FadeInLeft).duration(260);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <View style={{ flex: 1 }}>

        {/* Top bar: back · progress · skip */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingTop: 8, height: 52 }}>
          {stepId !== "ready" && draft.stepIndex > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous question"
              hitSlop={8}
              onPress={goBack}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surface,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Icon set="ion" name="chevron-back" size={20} color={colors.foreground} />
            </Pressable>
          ) : (
            <View style={{ width: 38 }} />
          )}
          <ProgressBar progress={stepId === "ready" ? 1 : (draft.stepIndex + 1) / (STEPS.length + 1)} />
          <View style={{ width: 38 }} />
        </View>

        <KeyboardAwareScrollView
          bottomOffset={150}
          ref={scrollRef}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View key={stepId} entering={entering}>
            {stepId === "goals" ? (
              <>
                <StepTitle
                  title={name ? `Hi ${name}, what brings you to Nura?` : "What brings you to Nura?"}
                  subtitle="Pick all that apply."
                />
                <View style={{ gap: 10 }}>
                  {GOAL_OPTIONS.map((goal) => {
                    const selected = draft.goals.includes(goal.value);
                    return (
                      <OptionCard
                        key={goal.value}
                        icon={goal.icon}
                        label={goal.label}
                        hint={goal.hint}
                        multi
                        selected={selected}
                        onPress={() =>
                          update({
                            goals: selected ? draft.goals.filter((value) => value !== goal.value) : [...draft.goals, goal.value],
                          })
                        }
                      />
                    );
                  })}
                </View>
              </>
            ) : null}

            {stepId === "lastPeriod" ? (
              <>
                <StepTitle
                  title="When did your last period start?"
                />
                <MonthCalendar
                  selectedKey={draft.lastPeriodStartDate}
                  highlightLength={draft.periodLength}
                  minDate={addDays(today, -365)}
                  maxDate={today}
                  onSelect={(dateKey) => {
                    setShowRanges(false);
                    update({ lastPeriodStartDate: dateKey, periodRange: null });
                  }}
                />

                {showRanges ? (
                  <Animated.View entering={FadeInDown.duration(motion.duration.base)} style={{ marginTop: 20 }}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", fontFamily: fonts.body, marginBottom: 10 }}>
                      Roughly when was it?
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {PERIOD_RANGE_OPTIONS.map((range) => (
                        <Chip
                          key={range.value}
                          label={range.label}
                          selected={draft.periodRange === range.value}
                          onPress={() => update({ periodRange: range.value, lastPeriodStartDate: "" })}
                        />
                      ))}
                    </View>
                    <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, fontFamily: fonts.body, marginTop: 10 }}>
                      No problem, we&apos;ll refine it as you log.
                    </Text>
                  </Animated.View>
                ) : (
                  <View style={{ marginTop: 12 }}>
                    <TextButton label="I don't remember exactly" onPress={() => setShowRanges(true)} />
                  </View>
                )}
              </>
            ) : null}

            {stepId === "periodLength" ? (
              <>
                <StepTitle title="How many days does your period usually last?" />
                <View style={{ marginTop: 16 }}>
                  <NumberStepper
                    value={draft.periodLength}
                    min={PERIOD_LENGTH_RANGE.min}
                    max={PERIOD_LENGTH_RANGE.max}
                    unit={draft.periodLength === 1 ? "day" : "days"}
                    quickPicks={[3, 4, 5, 6, 7]}
                    onChange={(value) => update({ periodLength: value })}
                  />
                </View>
              </>
            ) : null}

            {stepId === "cycleLength" ? (
              <>
                <StepTitle
                  title="How long is your cycle?"
                />
                <View style={{ marginTop: 16 }}>
                  <NumberStepper
                    value={draft.cycleLength}
                    min={CYCLE_LENGTH_RANGE.min}
                    max={CYCLE_LENGTH_RANGE.max}
                    unit="days"
                    quickPicks={[26, 28, 30, 32, 35]}
                    onChange={(value) => update({ cycleLength: value })}
                  />
                </View>
              </>
            ) : null}

            {stepId === "birthday" ? (
              <>
                <StepTitle
                  title="When's your birthday?"
                />
                <BirthdayInput autoFocus value={draft.dateOfBirth} onChange={onBirthdayChange} />
              </>
            ) : null}

            {stepId === "ready" ? (
              <ReadyStep
                name={name}
                lastPeriodStartDate={draft.lastPeriodStartDate}
                cycleLength={draft.cycleLength}
                periodLength={draft.periodLength}
                isEstimate={Boolean(draft.periodRange)}
              />
            ) : null}
          </Animated.View>
        </KeyboardAwareScrollView>

        {/* Pinned footer */}
        {/* Rides on top of the keyboard while it is open. */}
        <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12, gap: 6 }}>
          {errorMessage ? (
            <Animated.View
              entering={FadeIn.duration(motion.duration.fast)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                padding: 12,
                borderRadius: 14, borderCurve: "continuous",
                backgroundColor: colors.dangerLight,
                marginBottom: 6,
              }}
            >
              <Icon set="ion" name="alert-circle" size={16} color={colors.danger} />
              <Text style={{ flex: 1, color: colors.danger, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>
                {errorMessage}
              </Text>
            </Animated.View>
          ) : null}

          {stepId === "ready" ? (
            <PrimaryButton label="Start tracking" loading={isFinishing} onPress={finish} />
          ) : (
            <PrimaryButton
              label={stepId === "birthday" ? (errorMessage ? "Try again" : "Finish") : "Continue"}
              icon={stepId === "birthday" ? "checkmark" : "arrow-forward"}
              disabled={!canContinue}
              loading={isSaving}
              onPress={next}
            />
          )}

          {/* Keeps the button in the same spot on every step. */}
          <View style={{ height: 36, justifyContent: "center" }}>
            {stepId === "periodLength" || stepId === "cycleLength" ? (
              <TextButton
                label="Not sure, use the average"
                onPress={() => {
                  update(stepId === "periodLength" ? { periodLength: EMPTY_DRAFT.periodLength } : { cycleLength: EMPTY_DRAFT.cycleLength });
                  next();
                }}
              />
            ) : null}
          </View>
        </View>
        </KeyboardStickyView>
      </View>
    </SafeAreaView>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ marginBottom: 24 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.foreground, fontSize: 27, lineHeight: 34, fontWeight: "800", letterSpacing: -0.7, fontFamily: fonts.heading }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.mutedText, fontSize: 15, lineHeight: 22, marginTop: 8, fontFamily: fonts.body }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

type ReadyStepProps = {
  name: string;
  lastPeriodStartDate: string;
  cycleLength: number;
  periodLength: number;
  isEstimate: boolean;
};

function ReadyStep({ name, lastPeriodStartDate, cycleLength, periodLength, isEstimate }: ReadyStepProps) {
  const { colors, fonts } = useTheme();
  const { date, daysAway } = estimateNextPeriod(lastPeriodStartDate, cycleLength);
  const cycleDay = currentCycleDay(lastPeriodStartDate, cycleLength);

  const size = 168;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, cycleDay / cycleLength);

  const nextLabel = date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" });
  const awayLabel = daysAway === 0 ? "Expected today" : daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`;

  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View entering={ZoomIn.duration(420)} style={{ width: size, height: size, marginTop: 4 }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.track} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.primary}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>CYCLE DAY</Text>
          <Text style={{ color: colors.foreground, fontSize: 44, lineHeight: 50, fontWeight: "800", fontFamily: fonts.heading }}>
            {cycleDay}
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(motion.duration.slow)} style={{ alignItems: "center", marginTop: 22 }}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.foreground, fontSize: 27, lineHeight: 34, fontWeight: "800", letterSpacing: -0.7, textAlign: "center", fontFamily: fonts.heading }}
        >
          {name ? `You're all set, ${name}` : "You're all set"}
        </Text>
        <Text style={{ color: colors.mutedText, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 6, fontFamily: fonts.body }}>
          Here&apos;s your first prediction. It gets sharper every time you log.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(220).duration(motion.duration.slow)} style={{ alignSelf: "stretch", marginTop: 24, gap: 12 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", padding: 18, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>
              {isEstimate ? "Next period (estimate)" : "Next period"}
            </Text>
            <View style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: colors.primaryDark, fontSize: 13, fontWeight: "800", fontFamily: fonts.body }}>{awayLabel}</Text>
            </View>
          </View>
          <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", marginTop: 6, fontFamily: fonts.heading }}>
            {nextLabel}
          </Text>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
            <Stat icon="water-outline" label={`${periodLength}-day period`} />
            <Stat icon="sync-outline" label={`${cycleLength}-day cycle`} />
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: colors.surface,
            borderRadius: 22, borderCurve: "continuous",
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryLight }}>
            <Icon set="ion" name="notifications-outline" size={19} color={colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "800", fontFamily: fonts.body }}>Gentle reminders</Text>
            <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 17, marginTop: 2, fontFamily: fonts.body }}>
              We&apos;ll give you a heads-up 2 days before your period starts.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
          <Icon set="ion" name="star" size={13} color={colors.gold} />
          <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>
            +{WELCOME_POINTS} care points for finishing setup
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

function Stat({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Icon set="ion" name={icon} size={14} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>{label}</Text>
    </View>
  );
}
