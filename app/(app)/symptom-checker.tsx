import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SkeletonCardList } from "../../components/Skeleton";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { shareWithAppLink } from "../../lib/share";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  isFeatureLockedError,
  screeningApi,
  type ScreeningAssessmentResponse,
  type ScreeningCondition,
  type ScreeningQuestion,
} from "../../lib/api";

type Step = "pick" | "questions" | "results";

const CONDITIONS: { id: ScreeningCondition; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; desc: string }[] = [
  { id: "pcos", label: "PCOS", icon: "chart-donut", desc: "Irregular cycles, hormonal signs" },
  { id: "endometriosis", label: "Endometriosis", icon: "flower-outline", desc: "Pelvic pain patterns" },
  { id: "fibroid", label: "Fibroids", icon: "circle-multiple-outline", desc: "Heavy flow, pressure symptoms" },
  { id: "thyroid", label: "Thyroid", icon: "waveform", desc: "Energy, weight, mood signs" },
];

const SCALE_LABELS = ["None", "Mild", "Moderate", "Severe"];

// Severity ramp icons for the 0–3 scale options — a filling circle that reads
// at a glance without relying on color alone.
const SCALE_ICONS: (keyof typeof MaterialCommunityIcons.glyphMap)[] = [
  "circle-outline",
  "circle-slice-2",
  "circle-slice-5",
  "circle-slice-8",
];

// Picks a relevant icon for a screening question by keyword, so each question
// carries a small visual cue instead of being a wall of text.
function getQuestionIcon(text: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const t = text.toLowerCase();
  if (/(pain|cramp|ache|pelvic)/.test(t)) return "lightning-bolt";
  if (/(bleed|flow|period|spotting|menstru)/.test(t)) return "water";
  if (/(weight|gain|loss)/.test(t)) return "scale-bathroom";
  if (/(hair|hirsut)/.test(t)) return "content-cut";
  if (/(acne|skin|oily)/.test(t)) return "face-woman-shimmer";
  if (/(mood|anxi|depress|irritab|stress)/.test(t)) return "emoticon-sad-outline";
  if (/(tired|fatigue|energy|exhaust)/.test(t)) return "battery-low";
  if (/(sleep|insomnia)/.test(t)) return "sleep";
  if (/(cycle|irregular|late|missed)/.test(t)) return "calendar-sync";
  if (/(bloat|gas|digest|bowel|constip)/.test(t)) return "stomach";
  if (/(cold|hot|temperature|sweat|heat)/.test(t)) return "thermometer";
  if (/(heart|palpitat|pulse)/.test(t)) return "heart-pulse";
  return "help-circle-outline";
}

export default function SymptomCheckerScreen() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);

  const RISK_META: Record<string, { color: string; bg: string; label: string }> = {
    low: { color: colors.success, bg: softTints.emerald, label: "Low risk" },
    moderate: { color: colors.warning, bg: softTints.amber, label: "Elevated risk" },
    high: { color: colors.danger, bg: softTints.danger, label: "Talk to a doctor" },
  };

  const [step, setStep] = useState<Step>("pick");
  const [condition, setCondition] = useState<ScreeningCondition | null>(null);
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | boolean>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreeningAssessmentResponse | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const {
    hasAccess,
    isLoading: subscriptionLoading,
    refresh: refreshSubscriptionAccess,
  } = useSubscriptionAccess();
  // Whole-screen gate — don't even let the user land on the condition
  // picker if they can't use the checker at all, instead of gating just the
  // pick/submit actions.
  const locked = !subscriptionLoading && !hasAccess("symptom_checker");

  useEffect(() => {
    if (locked) setPaywallVisible(true);
  }, [locked]);

  async function loadCondition(pick: ScreeningCondition) {
    setCondition(pick);
    setError(null);
    setLoadingQuestions(true);
    setAnswers({});
    setQuestionIndex(0);
    try {
      const data = await screeningApi.getQuestions(pick);
      setQuestions(data.questions ?? []);
      setStep("questions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questions");
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

  function handleAnswer(question: ScreeningQuestion, value: number | boolean) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  }

  async function handleNext() {
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((i) => i + 1);
      return;
    }
    if (!condition) return;
    setSubmitting(true);
    setError(null);
    try {
      const assessment = await screeningApi.submitAssessment(condition, answers);
      setResult(assessment);
      setStep("results");
    } catch (err) {
      if (isFeatureLockedError(err)) {
        setPaywallVisible(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to submit assessment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackQuestion() {
    if (questionIndex > 0) setQuestionIndex((i) => i - 1);
    else setStep("pick");
  }

  function handleRestart() {
    setStep("pick");
    setCondition(null);
    setQuestions([]);
    setAnswers({});
    setQuestionIndex(0);
    setResult(null);
    setError(null);
  }

  async function handleShare() {
    if (!result) return;
    const conditionLabel = CONDITIONS.find((c) => c.id === result.condition)?.label ?? result.condition;
    const message = [
      `Symptom Checker Summary — ${conditionLabel}`,
      `Risk level: ${RISK_META[result.riskLevel]?.label ?? result.riskLevel} (score ${result.score})`,
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
  const canProceed = currentQuestion ? answers[currentQuestion.id] !== undefined : false;

  // Wait on the subscription check before rendering the condition picker —
  // otherwise it can flash for a frame before `locked` flips true and swaps
  // it for the paywall.
  if (subscriptionLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Symptom Checker" />
        <SkeletonCardList count={4} style={{ paddingTop: 16 }} />
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader
          title="Symptom Checker"
          onBack={() => (step === "pick" ? router.back() : handleBackQuestion())}
        />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="mx-6 mt-5">
            {locked ? (
              <LockedFeatureCard
                title="Symptom Checker"
                description="Unlock a short questionnaire that screens for PCOS, endometriosis, fibroids, and thyroid signs."
                onPress={() => setPaywallVisible(true)}
              />
            ) : null}

            {!locked && step === "pick" && (
              <>
                <Text className="text-sm font-semibold leading-5 mb-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                  Pick a condition to answer a short set of questions. This is an educational screening tool, not a
                  diagnosis.
                </Text>
                {error ? (
                  <Text className="text-xs font-semibold mb-3" style={{ color: colors.danger, fontFamily: fonts.body }}>
                    {error}
                  </Text>
                ) : null}
                <View style={{ gap: 12 }}>
                  {CONDITIONS.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      disabled={loadingQuestions}
                      onPress={() => handlePickCondition(item.id)}
                      activeOpacity={0.75}
                      className="flex-row items-center border p-4"
                      style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, ...getShadow(colors, isDark) }}
                    >
                      <View className="w-11 h-11 rounded-xl items-center justify-center mr-3.5" style={{ backgroundColor: softTints.pink }}>
                        <MaterialCommunityIcons name={item.icon} size={20} color={colors.primary} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                          {item.label}
                        </Text>
                        <Text className="text-xs mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                          {item.desc}
                        </Text>
                      </View>
                      {loadingQuestions && condition === item.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Feather name="chevron-right" size={16} color={colors.mutedText} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {!locked && step === "questions" && currentQuestion && (
              <>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[11px] font-black uppercase tracking-widest" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                    Question {questionIndex + 1} of {questions.length}
                  </Text>
                </View>
                <View className="h-1.5 rounded-full overflow-hidden mb-6" style={{ backgroundColor: colors.surfaceSoft }}>
                  <View
                    style={{
                      width: `${((questionIndex + 1) / questions.length) * 100}%`,
                      height: "100%",
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>

                <View
                  className="border p-6 mb-6"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, ...getShadow(colors, isDark) }}
                >
                  <View className="flex-row items-start gap-3 mb-5">
                    <View
                      className="items-center justify-center rounded-2xl"
                      style={{ width: 40, height: 40, backgroundColor: softTints.pink }}
                    >
                      <MaterialCommunityIcons
                        name={getQuestionIcon(currentQuestion.text)}
                        size={20}
                        color={colors.primary}
                      />
                    </View>
                    <Text
                      className="flex-1 text-base font-bold leading-6"
                      style={{ color: colors.foreground, fontFamily: fonts.heading }}
                    >
                      {currentQuestion.text}
                    </Text>
                  </View>

                  {currentQuestion.type === "yesno" ? (
                    <View className="flex-row gap-3">
                      {[
                        { label: "No", value: false, icon: "close-circle-outline" as const },
                        { label: "Yes", value: true, icon: "check-circle-outline" as const },
                      ].map((opt) => {
                        const selected = answers[currentQuestion.id] === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.label}
                            onPress={() => handleAnswer(currentQuestion, opt.value)}
                            activeOpacity={0.8}
                            className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border"
                            style={{
                              backgroundColor: selected ? colors.primary : colors.input,
                              borderColor: selected ? colors.primary : colors.border,
                            }}
                          >
                            <MaterialCommunityIcons
                              name={opt.icon}
                              size={18}
                              color={selected ? colors.buttonText : colors.mutedText}
                            />
                            <Text
                              className="text-sm font-black"
                              style={{ color: selected ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}
                            >
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View className="flex-row gap-2">
                      {SCALE_LABELS.map((label, value) => {
                        const selected = answers[currentQuestion.id] === value;
                        return (
                          <TouchableOpacity
                            key={label}
                            onPress={() => handleAnswer(currentQuestion, value)}
                            activeOpacity={0.8}
                            className="flex-1 items-center py-3 rounded-2xl border"
                            style={{
                              backgroundColor: selected ? colors.primary : colors.input,
                              borderColor: selected ? colors.primary : colors.border,
                            }}
                          >
                            <MaterialCommunityIcons
                              name={SCALE_ICONS[value]}
                              size={18}
                              color={selected ? colors.buttonText : colors.primary}
                            />
                            <Text
                              className="text-xs font-semibold mt-1"
                              style={{ color: selected ? colors.buttonText : colors.mutedText, fontFamily: fonts.body }}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>

                {error ? (
                  <Text className="text-xs font-semibold mb-3" style={{ color: colors.danger, fontFamily: fonts.body }}>
                    {error}
                  </Text>
                ) : null}

                <TouchableOpacity
                  disabled={!canProceed || submitting}
                  onPress={handleNext}
                  activeOpacity={0.85}
                  className="py-4 rounded-2xl items-center flex-row justify-center gap-2"
                  style={{ backgroundColor: canProceed ? colors.primary : colors.border }}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.buttonText} />
                  ) : (
                    <Text className="text-sm font-black" style={{ color: canProceed ? colors.buttonText : colors.mutedText, fontFamily: fonts.body }}>
                      {questionIndex < questions.length - 1 ? "Next" : "See results"}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {!locked && step === "results" && result && (
              <>
                {/* Progress header, matching mockup's "Screening complete" bar */}
                <Text className="text-[11px] font-bold mb-1.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                  Screening complete
                </Text>
                <View className="h-2 rounded-full overflow-hidden mb-6" style={{ backgroundColor: colors.border }}>
                  <View style={{ width: "100%", height: "100%", backgroundColor: colors.primary }} />
                </View>

                <Text className="text-base font-black mb-3" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                  Your results
                </Text>

                {/* Single-row result card, mirroring the mockup's condition/risk-pill list */}
                <View
                  className="border rounded-2xl px-4 py-3.5 flex-row items-center justify-between mb-5"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, ...getShadow(colors, isDark) }}
                >
                  <Text className="text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {CONDITIONS.find((c) => c.id === result.condition)?.label ?? result.condition}
                  </Text>
                  <View
                    className="rounded-full px-3 py-1.5"
                    style={{ backgroundColor: RISK_META[result.riskLevel]?.bg ?? colors.surfaceSoft }}
                  >
                    <Text
                      className="text-[11px] font-black"
                      style={{ color: RISK_META[result.riskLevel]?.color ?? colors.foreground, fontFamily: fonts.body }}
                    >
                      {RISK_META[result.riskLevel]?.label ?? result.riskLevel} · {result.score}
                    </Text>
                  </View>
                </View>

                <View
                  className="rounded-2xl px-4 py-3.5 mb-5"
                  style={{ backgroundColor: softTints.pink }}
                >
                  <Text className="text-xs font-semibold leading-5" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    This isn&apos;t a diagnosis — {result.disclaimer}
                  </Text>
                </View>

                <View
                  className="border p-5 mb-5"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, ...getShadow(colors, isDark) }}
                >
                  <Text className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                    Summary
                  </Text>
                  <Text className="text-[13px] leading-5 font-medium" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {result.summary}
                  </Text>
                </View>

                <View
                  className="border p-5 mb-8"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, ...getShadow(colors, isDark) }}
                >
                  <Text className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: colors.accentText, fontFamily: fonts.heading }}>
                    For your doctor visit
                  </Text>
                  <Text className="text-[13px] leading-5 font-medium" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {result.doctorDiscussionSummary}
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleShare}
                    activeOpacity={0.85}
                    className="py-4 rounded-2xl items-center flex-row justify-center gap-2"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Feather name="share" size={15} color={colors.buttonText} />
                    <Text className="text-sm font-black" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                      Save / share for doctor visit
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleRestart}
                    activeOpacity={0.85}
                    className="py-4 rounded-2xl items-center border"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      Check another condition
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </ScrollView>
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
