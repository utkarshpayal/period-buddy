import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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
  type ScreeningQuestion, getFriendlyErrorMessage } from "../../lib/api";
import {
  EMERGENCY_NUMBER,
  RED_FLAG_ITEMS,
  hasResultRedFlags,
  soonRedFlags,
  triageRedFlags,
} from "../../lib/redFlagScreen";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { showErrorToast } from "../../lib/toast";

// "prescreen" (the "Any of these right now?" red-flag checklist) comes before
// any questionnaire; "urgent" is the get-care card it leads to.
type Step = "prescreen" | "urgent" | "pick" | "questions" | "results";

type AssessmentResult = ScreeningAssessmentResponse;

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
  useSecureScreen("symptom-checker");
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);

  const RISK_META: Record<string, { color: string; bg: string; label: string }> = {
    low: { color: colors.success, bg: softTints.emerald, label: "Few signs" },
    moderate: { color: colors.warning, bg: softTints.amber, label: "Some signs" },
    high: { color: colors.danger, bg: softTints.danger, label: "Talk to a doctor" },
  };

  const [step, setStep] = useState<Step>("prescreen");
  const [redFlagPicks, setRedFlagPicks] = useState<string[]>([]);
  const [condition, setCondition] = useState<ScreeningCondition | null>(null);
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | boolean>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);
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

  function toggleRedFlag(id: string) {
    setRedFlagPicks((prev) => (prev.includes(id) ? prev.filter((pick) => pick !== id) : [...prev, id]));
  }

  function callEmergency() {
    Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => {});
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
    try {
      const assessment = await screeningApi.submitAssessment(condition, answers);
      setResult(assessment);
      setStep("results");
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
          onBack={() => {
            if (step === "prescreen" || step === "pick") router.back();
            else if (step === "urgent") setStep("prescreen");
            else handleBackQuestion();
          }}
        />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="mx-6 mt-5">
            {locked ? (
              <LockedFeatureCard
                title="Symptom Checker"
                description="Check for signs of PCOS, endometriosis and more."
                onPress={() => setPaywallVisible(true)}
              />
            ) : null}

            {!locked && step === "prescreen" && (
              <>
                <Text className="text-lg font-black mb-1" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                  Any of these right now?
                </Text>
                <Text className="text-[13px] font-semibold leading-5 mb-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                  Tick anything that&apos;s happening to you now. These need a doctor, not a questionnaire.
                </Text>
                <View style={{ gap: 10 }}>
                  {RED_FLAG_ITEMS.map((item) => {
                    const checked = redFlagPicks.includes(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => toggleRedFlag(item.id)}
                        activeOpacity={0.8}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        className="flex-row items-center border p-4"
                        style={{
                          backgroundColor: checked ? softTints.danger : colors.surface,
                          borderColor: checked ? colors.danger : colors.border,
                          borderRadius: 18, borderCurve: "continuous",
                        }}
                      >
                        <Icon set="mci"
                          name={checked ? "checkbox-marked" : "checkbox-blank-outline"}
                          size={22}
                          color={checked ? colors.danger : colors.mutedText}
                        />
                        <Text className="flex-1 ml-3 text-sm font-semibold leading-5" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ gap: 10, marginTop: 20 }}>
                  {redFlagPicks.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setStep("urgent")}
                      activeOpacity={0.85}
                      className="py-4 rounded-2xl items-center"
                      style={{ backgroundColor: colors.danger }}
                    >
                      <Text className="text-sm font-black" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
                        Continue
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => {
                      setRedFlagPicks([]);
                      setStep("pick");
                    }}
                    activeOpacity={0.85}
                    className="py-4 rounded-2xl items-center border"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      None of these
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {!locked && step === "urgent" && (
              <>
                {triageRedFlags(redFlagPicks) === "emergency" ? (
                  <View className="border p-5 mb-5" style={{ backgroundColor: softTints.danger, borderColor: colors.danger, borderRadius: 24, borderCurve: "continuous" }}>
                    <View className="flex-row items-center mb-2" style={{ gap: 10 }}>
                      <Icon set="mci" name="alert-circle" size={24} color={colors.danger} />
                      <Text className="flex-1 text-lg font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        Please get medical care now
                      </Text>
                    </View>
                    <Text className="text-sm leading-5 font-medium mb-4" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      What you ticked can be a sign of something serious. Call {EMERGENCY_NUMBER} or go to the nearest hospital
                      emergency department now. Don&apos;t wait to see if it passes.
                    </Text>
                    <TouchableOpacity
                      onPress={callEmergency}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${EMERGENCY_NUMBER}`}
                      className="py-4 rounded-2xl items-center flex-row justify-center gap-2"
                      style={{ backgroundColor: colors.danger }}
                    >
                      <Icon set="feather" name="phone" size={16} color="#FFFFFF" />
                      <Text className="text-base font-black" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
                        Call {EMERGENCY_NUMBER}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {soonRedFlags(redFlagPicks).length > 0 ? (
                  <View
                    className="border p-5 mb-5"
                    style={{ backgroundColor: colors.surface, borderColor: colors.warning, borderRadius: 24, borderCurve: "continuous", ...getShadow(colors, isDark) }}
                  >
                    <View className="flex-row items-center mb-2" style={{ gap: 10 }}>
                      <Icon set="mci" name="stethoscope" size={22} color={colors.warning} />
                      <Text className="flex-1 text-base font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        See a gynaecologist soon
                      </Text>
                    </View>
                    <Text className="text-sm leading-5 font-medium mb-4" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      {soonRedFlags(redFlagPicks)
                        .map((item) => item.label)
                        .join(" and ")}{" "}
                      isn&apos;t usually an emergency, but it isn&apos;t normal either. Please book a check-up in the next few days, even
                      if it&apos;s light or has stopped.
                    </Text>
                    <Button label="Talk to a gynaecologist" icon="chatbubbles-outline" onPress={() => router.push("/(app)/consultation" as any)} fullWidth />
                  </View>
                ) : null}

                <View style={{ gap: 10 }}>
                  {triageRedFlags(redFlagPicks) === "soon" ? (
                    <TouchableOpacity
                      onPress={() => setStep("pick")}
                      activeOpacity={0.85}
                      className="py-4 rounded-2xl items-center border"
                      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                    >
                      <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                        Continue to the symptom checker
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setStep("prescreen")}
                    activeOpacity={0.85}
                    className="py-3 items-center"
                  >
                    <Text className="text-[13px] font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      Change my answers
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {!locked && step === "pick" && (
              <>
                <Text className="text-sm font-semibold leading-5 mb-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                  Pick a condition and answer a few questions. For education, not diagnosis.
                </Text>
                <View style={{ gap: 12 }}>
                  {CONDITIONS.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      disabled={loadingQuestions}
                      onPress={() => handlePickCondition(item.id)}
                      activeOpacity={0.75}
                      className="flex-row items-center p-4"
                      style={{ backgroundColor: colors.surface, borderRadius: 20, borderCurve: "continuous", ...getShadow(colors, isDark) }}
                    >
                      <View className="w-11 h-11 rounded-xl items-center justify-center mr-3.5" style={{ backgroundColor: softTints.pink }}>
                        <Icon set="mci" name={item.icon} size={20} color={colors.primary} />
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
                        <Icon set="feather" name="chevron-right" size={16} color={colors.mutedText} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {!locked && step === "questions" && currentQuestion && (
              <>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[12px] font-black uppercase tracking-widest" style={{ color: colors.primary, fontFamily: fonts.heading }}>
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
                  className="p-6 mb-6"
                  style={{ backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous", ...getShadow(colors, isDark) }}
                >
                  <View className="flex-row items-start gap-3 mb-5">
                    <View
                      className="items-center justify-center rounded-2xl"
                      style={{ width: 40, height: 40, backgroundColor: softTints.pink }}
                    >
                      <Icon set="mci"
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

                  {/* The server sends "boolean" for yes/no questions (older builds
                      checked for "yesno" and showed the 0-3 scale instead). */}
                  {currentQuestion.type !== "scale" ? (
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
                            <Icon set="mci"
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
                            <Icon set="mci"
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


                <Button
                  label={questionIndex < questions.length - 1 ? "Next" : "See results"}
                  onPress={handleNext}
                  disabled={!canProceed}
                  loading={submitting}
                  fullWidth
                />
              </>
            )}

            {!locked && step === "results" && result && (
              <>
                {/* Progress header, matching mockup's "Screening complete" bar */}
                <Text className="text-xs font-bold mb-1.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
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
                  className="rounded-2xl px-4 py-3.5 flex-row items-center justify-between mb-5"
                  style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                >
                  <Text className="text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {CONDITIONS.find((c) => c.id === result.condition)?.label ?? result.condition}
                  </Text>
                  <View
                    className="rounded-full px-3 py-1.5"
                    style={{ backgroundColor: RISK_META[result.riskLevel]?.bg ?? colors.surfaceSoft }}
                  >
                    <Text
                      className="text-xs font-black"
                      style={{ color: RISK_META[result.riskLevel]?.color ?? colors.foreground, fontFamily: fonts.body }}
                    >
                      {RISK_META[result.riskLevel]?.label ?? result.riskLevel} · {result.score}
                    </Text>
                  </View>
                </View>

                {hasResultRedFlags(result) ? (
                  <View
                    className="border p-5 mb-5"
                    style={{ backgroundColor: softTints.danger, borderColor: colors.danger, borderRadius: 24, borderCurve: "continuous" }}
                  >
                    <View className="flex-row items-center mb-2" style={{ gap: 10 }}>
                      <Icon set="mci" name="stethoscope" size={22} color={colors.danger} />
                      <Text className="flex-1 text-base font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        Talk to a doctor about this
                      </Text>
                    </View>
                    <Text className="text-sm leading-5 font-medium mb-4" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      Some of your answers are worth getting checked soon, whatever your score. The list under &quot;For your doctor
                      visit&quot; shows which ones.
                    </Text>
                    <TouchableOpacity
                      onPress={() => router.push("/(app)/consultation" as any)}
                      activeOpacity={0.85}
                      className="py-3.5 rounded-2xl items-center"
                      style={{ backgroundColor: colors.danger }}
                    >
                      <Text className="text-sm font-black" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
                        Talk to a gynaecologist
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View
                  className="rounded-2xl px-4 py-3.5 mb-5"
                  style={{ backgroundColor: softTints.pink }}
                >
                  <Text className="text-xs font-semibold leading-5" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    This isn&apos;t a diagnosis — {result.disclaimer}
                  </Text>
                </View>

                <View
                  className="p-5 mb-5"
                  style={{ backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous", ...getShadow(colors, isDark) }}
                >
                  <Text className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                    Summary
                  </Text>
                  <Text className="text-[13px] leading-5 font-medium" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {result.summary}
                  </Text>
                </View>

                <View
                  className="p-5 mb-8"
                  style={{ backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous", ...getShadow(colors, isDark) }}
                >
                  <Text className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: colors.accentText, fontFamily: fonts.heading }}>
                    For your doctor visit
                  </Text>
                  <Text className="text-[13px] leading-5 font-medium" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {result.doctorDiscussionSummary}
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  <Button label="Save / share for doctor visit" icon="share-outline" onPress={handleShare} fullWidth />
                  <Button label="Check another condition" variant="secondary" onPress={handleRestart} fullWidth />
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
