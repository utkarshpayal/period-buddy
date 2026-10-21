import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StatusBar, Text, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SkeletonCardList } from "../../components/Skeleton";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { shareWithAppLink } from "../../lib/share";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  isFeatureLockedError,
  screeningApi,
  type ScreeningAssessmentResponse,
  type ScreeningCondition,
  type ScreeningQuestion,
  getFriendlyErrorMessage,
} from "../../lib/api";
import { EMERGENCY_NUMBER, soonRedFlags, triageRedFlags } from "../../lib/redFlagScreen";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { useContentWidth } from "../../lib/layout";
import { haptics } from "../../lib/haptics";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { showErrorToast } from "../../lib/toast";
import { motion } from "../../components/motion";
import {
  ConditionPicker,
  IntroView,
  QuestionView,
  ResultView,
  SafetyCheckView,
} from "../../components/symptom-checker/SymptomCheckerViews";
import { conditionLabel, riskStyle } from "../../components/symptom-checker/meta";

// "intro" explains the check; "prescreen" (the red-flag safety check) always
// comes before any questionnaire; "urgent" is the get-care card it leads to.
type Step = "intro" | "prescreen" | "urgent" | "pick" | "questions" | "results";

type AssessmentResult = ScreeningAssessmentResponse;

// After an answer, wait this long (so the choice is seen) before moving on.
const AUTO_ADVANCE_MS = 320;

export default function SymptomCheckerScreen() {
  useSecureScreen("symptom-checker");
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const softTints = getSoftTints(colors);
  const compact = useContentWidth() < 360;
  const gutter = compact ? 16 : 24;

  const [step, setStep] = useState<Step>("intro");
  const [redFlagPicks, setRedFlagPicks] = useState<string[]>([]);
  const [condition, setCondition] = useState<ScreeningCondition | null>(null);
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Record<string, number | boolean>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const {
    hasAccess,
    isLoading: subscriptionLoading,
    refresh: refreshSubscriptionAccess,
  } = useSubscriptionAccess();
  // Whole-screen gate — don't even let the user land on the checker if they
  // can't use it at all, instead of gating just the pick/submit actions.
  const locked = !subscriptionLoading && !hasAccess("symptom_checker");

  // Past checks for the intro. Quiet: none (or a failure) just hides the list.
  const { data: history, reload: reloadHistory } = useAsyncLoad(() => screeningApi.getHistory(), [], {});

  useEffect(() => {
    if (locked) setPaywallVisible(true);
  }, [locked]);
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);
  // Each step starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  async function loadCondition(pick: ScreeningCondition) {
    setCondition(pick);
    setLoadingQuestions(true);
    setAnswers({});
    setQuestionIndex(0);
    try {
      const data = await screeningApi.getQuestions(pick);
      setQuestions(data.questions ?? []);
      setStep("questions");
    } catch (err) {
      showErrorToast(getFriendlyErrorMessage(err));
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function handlePickCondition(pick: ScreeningCondition) {
    // Gated upfront (before the questionnaire) rather than at submit time —
    // no point answering a dozen questions only to hit a paywall at the end.
    if (!hasAccess("symptom_checker")) {
      setPaywallVisible(true);
      return;
    }
    await loadCondition(pick);
  }

  // Answering moves on by itself (after a beat), except on the last question,
  // which waits for "See my results".
  function handleAnswer(question: ScreeningQuestion, value: number | boolean) {
    haptics.select();
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (questionIndex < questions.length - 1) {
      advanceTimer.current = setTimeout(() => {
        setDirection(1);
        setQuestionIndex((i) => Math.min(i + 1, questions.length - 1));
      }, AUTO_ADVANCE_MS);
    }
  }

  async function handleNext() {
    if (questionIndex < questions.length - 1) {
      setDirection(1);
      setQuestionIndex((i) => i + 1);
      return;
    }
    if (!condition) return;
    setSubmitting(true);
    try {
      const assessment = await screeningApi.submitAssessment(condition, answers);
      setResult(assessment);
      setStep("results");
      haptics.success();
      reloadHistory();
    } catch (err) {
      if (isFeatureLockedError(err)) {
        setPaywallVisible(true);
      } else {
        showErrorToast(getFriendlyErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackQuestion() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (questionIndex > 0) {
      setDirection(-1);
      setQuestionIndex((i) => i - 1);
    } else setStep("pick");
  }

  function handleRestart() {
    setStep("pick");
    setCondition(null);
    setQuestions([]);
    setAnswers({});
    setQuestionIndex(0);
    setResult(null);
  }

  async function handleShare() {
    if (!result) return;
    const message = [
      `Symptom Checker Summary — ${conditionLabel(result.condition)}`,
      `Result: ${riskStyle(result.riskLevel, colors).label} (score ${result.score} of 100)`,
      "",
      result.doctorDiscussionSummary,
      "",
      result.disclaimer,
    ].join("\n");
    try {
      // Results themselves aren't a re-openable screen (no per-assessment
      // detail route), but the link still opens the app straight to the
      // symptom checker instead of just its Play Store/App Store listing —
      // consistent with how posts/blogs/invites share.
      await shareWithAppLink(message, "symptom-checker");
    } catch {
      // user cancelled share sheet — nothing to do
    }
  }

  const currentQuestion = questions[questionIndex];
  const isLastQuestion = questionIndex === questions.length - 1;
  const canProceed = currentQuestion ? answers[currentQuestion.id] !== undefined : false;
  const triage = triageRedFlags(redFlagPicks);
  const soon = soonRedFlags(redFlagPicks);

  // Wait on the subscription check before rendering — otherwise the checker
  // can flash for a frame before `locked` flips true and swaps in the paywall.
  if (subscriptionLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Symptom Checker" />
        <SkeletonCardList count={4} style={{ paddingTop: 16 }} />
      </SafeAreaView>
    );
  }

  function goBack() {
    if (step === "intro") router.back();
    else if (step === "prescreen") setStep("intro");
    else if (step === "urgent" || step === "pick") setStep("prescreen");
    else if (step === "results") handleRestart();
    else handleBackQuestion();
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Symptom Checker" onBack={goBack} />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: insets.bottom + (step === "questions" ? 120 : 48) }}
        >
          {locked ? (
            <LockedFeatureCard
              title="Symptom Checker"
              description="Check for signs of PCOS, endometriosis and more."
              onPress={() => setPaywallVisible(true)}
            />
          ) : null}

          {!locked && step === "intro" && <IntroView history={history ?? []} onStart={() => setStep("prescreen")} />}

          {!locked && step === "prescreen" && (
            <SafetyCheckView
              picks={redFlagPicks}
              onToggle={(id) => {
                haptics.select();
                setRedFlagPicks((prev) => (prev.includes(id) ? prev.filter((pick) => pick !== id) : [...prev, id]));
              }}
              onNone={() => {
                if (redFlagPicks.length > 0) {
                  setRedFlagPicks([]);
                  return;
                }
                setStep("pick");
              }}
              onContinue={() => setStep("urgent")}
            />
          )}

          {!locked && step === "urgent" && (
            <Animated.View entering={FadeInRight.duration(motion.duration.base)}>
              {triage === "emergency" ? (
                <View style={{ borderRadius: 24, borderCurve: "continuous", padding: 20, marginBottom: 16, backgroundColor: softTints.danger, borderWidth: 1, borderColor: colors.danger }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger, marginBottom: 14 }}>
                    <Icon set="mci" name="alert" size={26} color="#fff" />
                  </View>
                  <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontSize: 21, lineHeight: 27, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                    Please get medical care now
                  </Text>
                  <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 8, fontSize: 14.5, lineHeight: 22, color: colors.foreground, fontFamily: fonts.body }}>
                    {`What you ticked can be a sign of something serious. Call ${EMERGENCY_NUMBER} or go to the nearest hospital emergency department now. Don't wait to see if it passes.`}
                  </Text>
                  <Button
                    label={`Call ${EMERGENCY_NUMBER}`}
                    icon="call"
                    variant="danger"
                    size="lg"
                    onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => {})}
                    accessibilityLabel={`Call ${EMERGENCY_NUMBER}`}
                    fullWidth
                    style={{ marginTop: 16 }}
                  />
                </View>
              ) : null}

              {soon.length > 0 ? (
                <View style={{ borderRadius: 24, borderCurve: "continuous", padding: 20, marginBottom: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warning, ...getShadow(colors, isDark) }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <Icon set="mci" name="stethoscope" size={22} color={colors.warning} />
                    <Text maxFontSizeMultiplier={1.3} style={{ flex: 1, fontSize: 17, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                      See a gynaecologist soon
                    </Text>
                  </View>
                  <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14.5, lineHeight: 22, color: colors.foreground, fontFamily: fonts.body }}>
                    {`${soon.map((item) => item.label).join(" and ")} isn't usually an emergency, but it isn't normal either. Please book a check-up in the next few days, even if it's light or has stopped.`}
                  </Text>
                  <Button label="Talk to a gynaecologist" icon="chatbubbles-outline" onPress={() => router.push("/(app)/consultation" as never)} fullWidth style={{ marginTop: 16 }} />
                </View>
              ) : null}

              <View style={{ gap: 10 }}>
                {triage === "soon" ? <Button label="Continue to the symptom checker" variant="secondary" onPress={() => setStep("pick")} fullWidth /> : null}
                <Button label="Change my answers" variant="ghost" onPress={() => setStep("prescreen")} fullWidth />
              </View>
            </Animated.View>
          )}

          {!locked && step === "pick" && (
            <ConditionPicker compact={compact} loadingId={loadingQuestions ? condition : null} onPick={handlePickCondition} />
          )}

          {!locked && step === "questions" && currentQuestion && condition && (
            <QuestionView
              condition={condition}
              question={currentQuestion}
              index={questionIndex}
              total={questions.length}
              value={answers[currentQuestion.id]}
              direction={direction}
              onAnswer={(value) => handleAnswer(currentQuestion, value)}
            />
          )}

          {!locked && step === "results" && result && (
            <ResultView
              result={result}
              onBook={() => router.push("/(app)/consultation" as never)}
              onShare={handleShare}
              onRestart={handleRestart}
            />
          )}
        </ScrollView>

        {/* Questions: Back and Next/See results pinned at the bottom. */}
        {!locked && step === "questions" && currentQuestion ? (
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              paddingHorizontal: gutter,
              paddingTop: 12,
              paddingBottom: insets.bottom + 12,
              borderTopWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <Button label="Back" icon="arrow-back" variant="neutral" onPress={handleBackQuestion} style={{ paddingHorizontal: 18 }} />
            <Button
              label={isLastQuestion ? "See my results" : "Next"}
              iconRight={isLastQuestion ? undefined : "arrow-forward"}
              onPress={handleNext}
              disabled={!canProceed}
              loading={submitting}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
      </SafeAreaView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="symptom_checker"
        onUnlocked={() => {
          refreshSubscriptionAccess();
          // Go straight to loadCondition (skips the hasAccess() re-check) —
          // the hook's cached summary won't reflect the purchase yet even
          // though refresh() is in flight, so re-checking here would bounce
          // straight back to the paywall.
          if (condition) loadCondition(condition);
        }}
      />
    </>
  );
}
