import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInRight,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import type { ScreeningAssessmentResponse, ScreeningCondition, ScreeningHistoryItem, ScreeningQuestion } from "../../lib/api";
import { RED_FLAG_ITEMS, hasResultRedFlags } from "../../lib/redFlagScreen";
import { Button } from "../Button";
import { GradientCard } from "../GradientCard";
import { Icon } from "../Icon";
import { motion } from "../motion";
import { PressableScale } from "../PressableScale";
import { useTheme } from "../theme";
import { getHeroGradient, getShadow, withAlpha } from "../ui-tokens";
import { CONDITIONS, RED_FLAG_ICONS, SCALE_OPTIONS, conditionLabel, conditionTint, questionIcon, riskStyle } from "./meta";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const STEPS = ["Safety", "Choose", "Answer"];

/* ─────────────────────────────── Step header ─────────────────────────────── */

/** "Step 2 of 3" with three segments, the title and a one-line hint. */
export function StepHeader({ step, title, subtitle }: { step: 1 | 2 | 3; title: string; subtitle?: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {STEPS.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: i < step ? colors.primary : colors.track }} />
            <Text
              maxFontSizeMultiplier={1.2}
              style={{ fontSize: 11.5, fontWeight: "700", letterSpacing: 0.4, color: i + 1 === step ? colors.primaryDark : colors.mutedText, fontFamily: fonts.body }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.3}
        style={{ marginTop: 18, fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.4, color: colors.foreground, fontFamily: fonts.heading }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 6, fontSize: 14.5, lineHeight: 21, color: colors.mutedText, fontFamily: fonts.body }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────────── Intro ────────────────────────────────── */

export function IntroView({ history, onStart }: { history: ScreeningHistoryItem[]; onStart: () => void }) {
  const { colors, fonts, isDark } = useTheme();
  const how = [
    { icon: "shield-checkmark-outline", title: "Quick safety check", body: "First, make sure nothing needs urgent care." },
    { icon: "list-outline", title: "8 short questions", body: "About one condition, in about 2 minutes." },
    { icon: "document-text-outline", title: "Your summary", body: "What it means, and notes to show your doctor." },
  ];
  return (
    <>
      <Animated.View entering={FadeInDown.duration(motion.duration.slow)}>
        <GradientCard colors={getHeroGradient(colors, isDark)} style={{ padding: 22, gap: 10 }}>
          <Icon set="mci" name="stethoscope" size={150} color="#fff" style={{ position: "absolute", right: -30, bottom: -36, opacity: 0.1 }} />
          <Text style={{ color: "#fff", opacity: 0.85, fontSize: 12, fontWeight: "800", letterSpacing: 1.3, textTransform: "uppercase", fontFamily: fonts.body }}>
            Symptom checker
          </Text>
          <Text maxFontSizeMultiplier={1.25} style={{ color: "#fff", fontSize: 25, lineHeight: 31, fontWeight: "800", letterSpacing: -0.6, fontFamily: fonts.heading }}>
            Understand what your body is telling you
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={{ color: "#fff", opacity: 0.9, fontSize: 14.5, lineHeight: 21, fontFamily: fonts.body }}>
            Check for common signs of PCOS, endometriosis, fibroids and thyroid problems. Private, and made to take to your doctor.
          </Text>
          <Button label="Start a check" iconRight="arrow-forward" variant="secondary" onPress={onStart} style={{ marginTop: 8 }} />
        </GradientCard>
      </Animated.View>

      <Text accessibilityRole="header" style={{ marginTop: 28, marginBottom: 12, fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
        How it works
      </Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", paddingHorizontal: 16, ...getShadow(colors, isDark) }}>
        {how.map((item, i) => (
          <View key={item.title} style={{ flexDirection: "row", gap: 14, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: colors.track, alignItems: "center" }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight }}>
              <Icon set="ion" name={item.icon as never} size={19} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                {`${i + 1}. ${item.title}`}
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, lineHeight: 18, marginTop: 2, color: colors.mutedText, fontFamily: fonts.body }}>
                {item.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {history.length > 0 ? (
        <>
          <Text accessibilityRole="header" style={{ marginTop: 28, marginBottom: 12, fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
            Your recent checks
          </Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", paddingHorizontal: 16, ...getShadow(colors, isDark) }}>
            {history.slice(0, 3).map((item, i) => {
              const risk = riskStyle(item.riskLevel, colors);
              return (
                <View key={item._id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: colors.track }}>
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                      {conditionLabel(item.condition)}
                    </Text>
                    <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, marginTop: 2, color: colors.mutedText, fontFamily: fonts.body }}>
                      {new Date(item.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: risk.bg }}>
                    <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 12.5, fontWeight: "800", color: risk.color, fontFamily: fonts.body }}>
                      {risk.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <PrivacyLine style={{ marginTop: 22 }} />
    </>
  );
}

export function PrivacyLine({ style }: { style?: object }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[{ flexDirection: "row", gap: 8, alignItems: "flex-start", paddingHorizontal: 4 }, style]}>
      <Icon set="ion" name="lock-closed-outline" size={14} color={colors.mutedText} style={{ marginTop: 2 }} />
      <Text maxFontSizeMultiplier={1.3} style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.mutedText, fontFamily: fonts.body }}>
        Private to you. For education, not a diagnosis: only a doctor can diagnose a condition.
      </Text>
    </View>
  );
}

/* ──────────────────────────────── Safety check ────────────────────────────── */

export function SafetyCheckView({
  picks,
  onToggle,
  onNone,
  onContinue,
}: {
  picks: string[];
  onToggle: (id: string) => void;
  onNone: () => void;
  onContinue: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const any = picks.length > 0;
  return (
    <Animated.View entering={FadeInRight.duration(motion.duration.base)}>
      <StepHeader
        step={1}
        title="First, a quick safety check"
        subtitle="Is any of this happening to you right now? These need a doctor rather than a questionnaire. Most people tick none."
      />
      <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", overflow: "hidden", ...getShadow(colors, isDark) }}>
        {RED_FLAG_ITEMS.map((item, i) => {
          const checked = picks.includes(item.id);
          return (
            <PressableScale
              key={item.id}
              scaleTo={0.99}
              onPress={() => onToggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={item.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: i ? 1 : 0,
                borderColor: colors.track,
                backgroundColor: checked ? withAlpha(colors.danger, isDark ? 0.18 : 0.08) : "transparent",
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: checked ? withAlpha(colors.danger, 0.15) : colors.surfaceSoft }}>
                <Icon set="mci" name={RED_FLAG_ICONS[item.id] ?? "alert-circle-outline"} size={18} color={checked ? colors.danger : colors.mutedText} />
              </View>
              <Text maxFontSizeMultiplier={1.3} style={{ flex: 1, fontSize: 14.5, lineHeight: 20, fontWeight: checked ? "700" : "500", color: colors.foreground, fontFamily: fonts.body }}>
                {item.label}
              </Text>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: checked ? colors.danger : colors.border,
                  backgroundColor: checked ? colors.danger : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {checked ? <Icon set="ion" name="checkmark" size={15} color="#fff" /> : null}
              </View>
            </PressableScale>
          );
        })}
      </View>

      <View style={{ marginTop: 20, gap: 10 }}>
        {any ? (
          <>
            <Button label="Continue" variant="danger" iconRight="arrow-forward" onPress={onContinue} fullWidth />
            <Button label="Clear my answers" variant="ghost" onPress={onNone} fullWidth />
          </>
        ) : (
          <Button label="None of these, continue" iconRight="arrow-forward" onPress={onNone} fullWidth />
        )}
      </View>
    </Animated.View>
  );
}

/* ─────────────────────────────── Condition picker ─────────────────────────── */

export function ConditionPicker({
  loadingId,
  onPick,
  compact,
}: {
  loadingId: ScreeningCondition | null;
  onPick: (id: ScreeningCondition) => void;
  compact: boolean;
}) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <Animated.View entering={FadeInRight.duration(motion.duration.base)}>
      <StepHeader step={2} title="What would you like to check?" subtitle="Pick the one that sounds most like you. You can check another afterwards." />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {CONDITIONS.map((item, i) => {
          const tint = conditionTint(item.tint, colors);
          const loading = loadingId === item.id;
          return (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(i * 60).duration(motion.duration.base)}
              style={{ width: compact ? "100%" : "47.5%", flexGrow: 1 }}
            >
              <PressableScale
                disabled={loadingId !== null}
                onPress={() => onPick(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}: ${item.signs}. 8 questions, about 2 minutes`}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 22,
                  borderCurve: "continuous",
                  padding: 16,
                  minHeight: compact ? undefined : 168,
                  opacity: loadingId && !loading ? 0.5 : 1,
                  ...getShadow(colors, isDark),
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: tint.bg }}>
                    <Icon set="mci" name={item.icon} size={22} color={tint.fg} />
                  </View>
                  {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon set="ion" name="arrow-forward" size={18} color={colors.mutedText} />}
                </View>
                <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 14, fontSize: 17, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  {item.label}
                </Text>
                <Text maxFontSizeMultiplier={1.3} numberOfLines={3} style={{ marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body, flexGrow: 1 }}>
                  {item.signs}
                </Text>
                <Text maxFontSizeMultiplier={1.2} style={{ marginTop: 10, fontSize: 12.5, fontWeight: "700", color: tint.fg, fontFamily: fonts.body }}>
                  8 questions · ~2 min
                </Text>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
      <PrivacyLine style={{ marginTop: 22 }} />
    </Animated.View>
  );
}

/* ─────────────────────────────────── Question ─────────────────────────────── */

export function QuestionView({
  condition,
  question,
  index,
  total,
  value,
  direction,
  onAnswer,
}: {
  condition: ScreeningCondition;
  question: ScreeningQuestion;
  index: number;
  total: number;
  value: number | boolean | undefined;
  direction: 1 | -1;
  onAnswer: (value: number | boolean) => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const isScale = question.type === "scale";
  const options: { key: string; label: string; hint?: string; value: number | boolean }[] = isScale
    ? SCALE_OPTIONS.map((o) => ({ key: String(o.value), label: o.label, hint: o.hint, value: o.value }))
    : [
        { key: "yes", label: "Yes", value: true },
        { key: "no", label: "No", value: false },
      ];

  return (
    <>
      <StepHeader step={3} title={conditionLabel(condition)} />
      {/* Progress through the questions */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 12.5, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", color: colors.primaryDark, fontFamily: fonts.body }}>
          {`Question ${index + 1} of ${total}`}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: "hidden", marginBottom: 18 }}>
        <View style={{ width: `${((index + 1) / total) * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
      </View>

      <Animated.View
        key={question.id}
        entering={(direction > 0 ? FadeInRight : FadeInDown).duration(motion.duration.base).easing(motion.easing.enter)}
        style={{ backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous", padding: 20, ...getShadow(colors, isDark) }}
      >
        <View style={{ width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight }}>
          <Icon set="mci" name={questionIcon(question.text)} size={22} color={colors.primaryDark} />
        </View>
        <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 14, fontSize: 19, lineHeight: 26, fontWeight: "800", letterSpacing: -0.2, color: colors.foreground, fontFamily: fonts.heading }}>
          {question.text}
        </Text>

        <View style={{ marginTop: 18, gap: 10, flexDirection: isScale ? "column" : "row" }}>
          {options.map((opt) => {
            const selected = value === opt.value;
            return (
              <PressableScale
                key={opt.key}
                scaleTo={0.98}
                onPress={() => onAnswer(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.hint ? `${opt.label}, ${opt.hint}` : opt.label}
                style={{
                  flex: isScale ? undefined : 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: isScale ? 13 : 16,
                  borderRadius: 16,
                  borderCurve: "continuous",
                  borderWidth: 1.5,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? withAlpha(colors.primary, isDark ? 0.2 : 0.08) : colors.surface,
                  justifyContent: isScale ? "flex-start" : "center",
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
                </View>
                <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15.5, fontWeight: selected ? "800" : "600", color: colors.foreground, fontFamily: fonts.body }}>
                  {opt.label}
                </Text>
                {opt.hint ? (
                  <Text maxFontSizeMultiplier={1.3} style={{ marginLeft: "auto", fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                    {opt.hint}
                  </Text>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      </Animated.View>
    </>
  );
}

/* ──────────────────────────────────── Result ──────────────────────────────── */

/** The 0–100 score as a ring that fills in when the result appears. */
function ScoreRing({ score }: { score: number }) {
  const { fonts } = useTheme();
  const reduceMotion = useReducedMotion();
  const size = 112;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(reduceMotion ? score / 100 : 0);
  useEffect(() => {
    p.value = reduceMotion ? score / 100 : withTiming(score / 100, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [score, reduceMotion, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={`Score ${score} out of 100`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#fff"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          animatedProps={props}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800", fontVariant: ["tabular-nums"], fontFamily: fonts.heading }}>{score}</Text>
        <Text style={{ color: "#fff", opacity: 0.8, fontSize: 11.5, fontWeight: "700", fontFamily: fonts.body }}>of 100</Text>
      </View>
    </View>
  );
}

function ResultSection({ icon, title, tint, children }: { icon: string; title: string; tint: string; children: React.ReactNode }) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", padding: 18, marginTop: 14, ...getShadow(colors, isDark) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Icon set="ion" name={icon as never} size={18} color={tint} />
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontSize: 15.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function ResultView({
  result,
  onBook,
  onShare,
  onRestart,
}: {
  result: ScreeningAssessmentResponse;
  onBook: () => void;
  onShare: () => void;
  onRestart: () => void;
}) {
  const { colors, fonts } = useTheme();
  const risk = riskStyle(result.riskLevel, colors);
  const flagged = hasResultRedFlags(result);
  const body = { fontSize: 14.5, lineHeight: 22, color: colors.foreground, fontFamily: fonts.body };
  return (
    <>
      <Animated.View entering={FadeInDown.duration(motion.duration.slow)}>
        <GradientCard colors={risk.gradient} style={{ padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <ScoreRing score={result.score} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: "#fff", opacity: 0.85, fontSize: 12, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", fontFamily: fonts.body }}>
                {conditionLabel(result.condition)}
              </Text>
              <Text maxFontSizeMultiplier={1.25} style={{ color: "#fff", fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 4, fontFamily: fonts.heading }}>
                {risk.headline}
              </Text>
              <View style={{ alignSelf: "flex-start", marginTop: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.2)" }}>
                <Text maxFontSizeMultiplier={1.2} style={{ color: "#fff", fontSize: 12.5, fontWeight: "800", fontFamily: fonts.body }}>
                  {risk.label}
                </Text>
              </View>
            </View>
          </View>
          <Text maxFontSizeMultiplier={1.3} style={{ color: "#fff", opacity: 0.92, fontSize: 14, lineHeight: 21, marginTop: 16, fontFamily: fonts.body }}>
            {risk.meaning}
          </Text>
        </GradientCard>
      </Animated.View>

      {flagged ? (
        <Animated.View entering={FadeInDown.delay(120).duration(motion.duration.base)}>
          <View style={{ marginTop: 14, borderRadius: 22, borderCurve: "continuous", padding: 18, backgroundColor: risk.bg, borderWidth: 1, borderColor: colors.danger }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Icon set="mci" name="stethoscope" size={20} color={colors.danger} />
              <Text maxFontSizeMultiplier={1.3} style={{ flex: 1, fontSize: 15.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                Some answers need a doctor
              </Text>
            </View>
            <Text maxFontSizeMultiplier={1.3} style={body}>
              Whatever your score, a few of your answers are worth getting checked soon. They&apos;re listed in your doctor notes below.
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {result.note ? (
        <ResultSection icon="information-circle-outline" title="Good to know" tint={colors.info}>
          <Text maxFontSizeMultiplier={1.3} style={body}>{result.note}</Text>
        </ResultSection>
      ) : null}

      <Animated.View entering={FadeInDown.delay(180).duration(motion.duration.base)}>
        <ResultSection icon="reader-outline" title="What your answers show" tint={colors.primary}>
          <Text maxFontSizeMultiplier={1.3} style={body}>{result.summary}</Text>
        </ResultSection>
        <ResultSection icon="clipboard-outline" title="Notes for your doctor" tint={colors.accentText}>
          <Text maxFontSizeMultiplier={1.3} style={body}>{result.doctorDiscussionSummary}</Text>
        </ResultSection>
      </Animated.View>

      <View style={{ marginTop: 22, gap: 10 }}>
        <Button
          label="Talk to a gynaecologist"
          icon="chatbubbles-outline"
          variant={flagged || result.riskLevel !== "low" ? "primary" : "secondary"}
          onPress={onBook}
          fullWidth
        />
        <Button label="Share notes with my doctor" icon="share-outline" variant="tonal" onPress={onShare} fullWidth />
        <Button label="Check another condition" variant="ghost" onPress={onRestart} fullWidth />
      </View>

      <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 18, fontSize: 13, lineHeight: 19, color: colors.mutedText, textAlign: "center", fontFamily: fonts.body }}>
        {result.disclaimer}
      </Text>
    </>
  );
}
