import { strFromU8 } from "fflate";
import type { DayEntry } from "./api";
import { readZip, ZipFormatError } from "./zipReader";

export { ZipPasswordError } from "./zipReader";

/**
 * Reads another period app's data export (Clue or Flo) on the phone and
 * turns it into Nura day logs for `cycleApi.importLogs`. The file never
 * leaves the phone; only the day logs are sent. Unit-tested in
 * lib/__tests__/cycleImport.test.ts.
 *
 * Formats understood:
 * - Clue (2023+): a .zip with `measurements.json`, a list of
 *   `{ type, date, value }` where value is `{ option }`, `[{ option }]` or a
 *   number.
 * - Clue (older): a `.cluedata` JSON, `{ data: [{ day, period, pain: [...] }] }`.
 * - Flo: a JSON (or .zip of one) with `operationalData.cycles` (period start
 *   and end dates) and `point_events_manual*` (`{ date, category, subcategory }`).
 *
 * Anything Nura has no place for (Clue's collection method, PMS, hair…) is
 * left out and listed in `unsupported`.
 */

export type ImportSource = "clue" | "flo";

export type ImportedDay = Pick<
  DayEntry,
  | "dateKey"
  | "flow"
  | "moods"
  | "energy"
  | "symptoms"
  | "isIntimate"
  | "weight"
  | "temperature"
  | "digestions"
  | "skins"
  | "discharge"
  | "exercise"
>;

export type ImportPreview = {
  source: ImportSource;
  /** Day logs, oldest first, nothing after `todayKey`. */
  days: ImportedDay[];
  periodDays: number;
  /** Separate periods found (flow days more than 2 days apart start a new one). */
  periods: number;
  firstDateKey: string | null;
  lastDateKey: string | null;
  /** Readable names of the categories that weren't imported. */
  unsupported: string[];
};

export class ImportFormatError extends Error {}

// Unzipped files over this are refused (a zip can expand a lot).
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;

type Effect = Partial<Omit<ImportedDay, "dateKey">>;
type Flow = NonNullable<DayEntry["flow"]>;

/** "Tender breasts", "tender-breasts", "TenderBreasts" → "tender_breasts". */
export function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const tag = (symptom: string): Effect => ({ symptoms: [symptom] });
const mood = (value: NonNullable<DayEntry["mood"]>): Effect => ({ moods: [value] });
const digestion = (value: "bloated" | "constipated" | "diarrhea" | "normal"): Effect => ({ digestions: [value] });
const intimate = (symptom: string): Effect => ({ symptoms: [symptom], isIntimate: true });

const FLOWS: Record<string, Flow> = {
  spotting: "spotting",
  light: "light",
  medium: "medium",
  moderate: "medium",
  heavy: "heavy",
  very_heavy: "heavy",
  super_heavy: "heavy",
};

// Options that mean the same thing in Clue and Flo, whatever category they
// sit in. Values are the tags and fields the day-log modal uses.
const OPTIONS: Record<string, Effect> = {
  // Physical symptoms
  cramps: tag("cramps"),
  menstrual_cramps: tag("cramps"),
  period_cramps: tag("cramps"),
  headache: tag("headache"),
  migraine: tag("headache"),
  tender_breasts: tag("tender-breasts"),
  breast_tenderness: tag("tender-breasts"),
  sensitive_breasts: tag("tender-breasts"),
  backache: tag("backache"),
  back_pain: tag("backache"),
  lower_back_pain: tag("backache"),
  fatigue: tag("fatigue"),
  tired: tag("fatigue"),
  insomnia: tag("insomnia"),
  abdominal_pain: tag("abdominal-pain"),
  stomach_pain: tag("abdominal-pain"),
  acne: tag("acne"),
  nausea: tag("nausea"),
  nauseated: tag("nausea"),
  vaginal_itching: tag("vaginal-itching"),
  itching: tag("vaginal-itching"),
  vaginal_dryness: tag("vaginal-dryness"),
  everything_is_fine: tag("everything-is-fine"),
  everything_fine: tag("everything-is-fine"),
  feel_good: tag("everything-is-fine"),
  blood_clots: tag("blood-clots"),
  clots: tag("blood-clots"),
  cravings: tag("cravings"),
  // Moods (the day-log modal's mood grid)
  happy: mood("happy"),
  calm: mood("calm"),
  energetic: { moods: ["energetic"], energy: "high" },
  energized: { moods: ["energetic"], energy: "high" },
  frisky: mood("frisky"),
  mood_swings: mood("moodSwings"),
  sensitive: mood("moodSwings"),
  emotional: mood("moodSwings"),
  irritated: mood("irritable"),
  irritable: mood("irritable"),
  angry: mood("irritable"),
  sad: mood("sad"),
  anxious: mood("anxious"),
  stressed: mood("anxious"),
  depressed: mood("depressed"),
  guilty: mood("guilty"),
  feeling_guilty: mood("guilty"),
  obsessive: mood("obsessive"),
  obsessive_thoughts: mood("obsessive"),
  low_energy: { moods: ["lowEnergy"], energy: "low" },
  exhausted: { moods: ["lowEnergy"], energy: "low" },
  apathetic: mood("apathetic"),
  indifferent: mood("apathetic"),
  unmotivated: mood("apathetic"),
  confused: mood("confused"),
  forgetful: mood("confused"),
  distracted: mood("confused"),
  self_critical: mood("selfCritical"),
  very_self_critical: mood("selfCritical"),
  high_energy: { energy: "high" },
  // Digestion and stool
  bloating: digestion("bloated"),
  bloated: digestion("bloated"),
  constipation: digestion("constipated"),
  constipated: digestion("constipated"),
  diarrhea: digestion("diarrhea"),
  diarrhoea: digestion("diarrhea"),
  normal_stool: digestion("normal"),
  // Sex and sex drive
  protected_sex: intimate("sex-protected"),
  unprotected_sex: intimate("sex-unprotected"),
  withdrawal_sex: intimate("sex-unprotected"),
  oral_sex: intimate("sex-oral"),
  anal_sex: intimate("sex-anal"),
  masturbation: tag("sex-masturbation"),
  sensual_touch: tag("sex-sensual-touch"),
  sex_toys: tag("sex-toys"),
  orgasm: tag("sex-orgasm"),
  high_sex_drive: tag("sex-drive-high"),
  natural_sex_drive: tag("sex-drive-natural"),
  low_sex_drive: tag("sex-drive-low"),
  didn_t_have_sex: tag("sex-none"),
  didnt_have_sex: tag("sex-none"),
  no_sex: tag("sex-none"),
  // Physical activity
  didn_t_exercise: { exercise: ["didnt-exercise"] },
  didnt_exercise: { exercise: ["didnt-exercise"] },
  yoga: { exercise: ["yoga"] },
  gym: { exercise: ["gym"] },
  fitness: { exercise: ["gym"] },
  strength_training: { exercise: ["gym"] },
  aerobics_and_dancing: { exercise: ["aerobics-dancing"] },
  aerobics: { exercise: ["aerobics-dancing"] },
  dancing: { exercise: ["aerobics-dancing"] },
  swimming: { exercise: ["swimming"] },
  team_sports: { exercise: ["team-sports"] },
  running: { exercise: ["running"] },
  cycling: { exercise: ["cycling"] },
  biking: { exercise: ["cycling"] },
};

const DISCHARGE: Record<string, Effect> = {
  no_discharge: { discharge: "none" },
  none: { discharge: "none" },
  dry: { discharge: "none" },
  sticky: { discharge: "sticky" },
  creamy: { discharge: "creamy" },
  watery: { discharge: "watery" },
  egg_white: { discharge: "egg-white" },
  spotting: tag("discharge-spotting"),
  unusual: tag("discharge-unusual"),
  atypical: tag("discharge-unusual"),
  clumpy_white: tag("discharge-clumpy-white"),
  gray: tag("discharge-gray"),
  grey: tag("discharge-gray"),
};

const SKIN: Record<string, Effect> = {
  good: { skins: ["clear"] },
  clear: { skins: ["clear"] },
  oily: { skins: ["oily"] },
  dry: { skins: ["dry"] },
  acne: { skins: ["acne"], symptoms: ["acne"] },
};

const STOOL: Record<string, Effect> = {
  great: digestion("normal"),
  normal: digestion("normal"),
  fine: digestion("normal"),
};

/** A pregnancy or ovulation test result from an option like "pregnancy_test_pos" or "Positive". */
function testEffect(category: string, option: string): Effect | null {
  const kind = /ovulation|lh/.test(category) || /ovulation|lh_test/.test(option) ? "ovulation" : /pregnan/.test(category + option) ? "pregnancy" : null;
  if (!kind) return null;
  const result = /faint/.test(option) ? "faint" : /pos/.test(option) ? "positive" : /neg/.test(option) ? "negative" : null;
  if (!result) return null;
  if (kind === "ovulation") return result === "faint" ? null : tag(`ovulation-test-${result}`);
  return tag(result === "faint" ? "pregnancy-faint-line" : `pregnancy-${result}`);
}

/**
 * What one logged option means for a Nura day, or null when Nura has no
 * place for it. `category` is Clue's measurement type or Flo's category.
 */
export function mapOption(categoryRaw: string, optionRaw: string): Effect | null {
  const category = normalizeKey(categoryRaw);
  const option = normalizeKey(optionRaw);

  if (/spotting/.test(category)) return { flow: "spotting" };
  if (/^(period|menstruation|menstrual_flow|flow|bleeding|period_intensity|period_flow)$/.test(category)) {
    return FLOWS[option] ? { flow: FLOWS[option] } : null;
  }
  if (/test/.test(category) || /_test_/.test(option)) return testEffect(category, option);
  if (/discharge|fluid|cervical/.test(category)) return DISCHARGE[option] ?? null;
  if (category === "skin") return SKIN[option] ?? null;
  if (/^(stool|poop)$/.test(category)) return STOOL[option] ?? OPTIONS[option] ?? null;
  if (/craving/.test(category)) return tag("cravings");
  if (category === "pain" && option === "ovulation") return null;
  return OPTIONS[option] ?? null;
}

const CATEGORY_LABELS: Record<string, string> = {
  collection_method: "Period products",
  ovulation_pain: "Ovulation pain",
  pms: "PMS",
  mind: "Mind",
  hair: "Hair",
  social: "Social",
  party: "Party",
  ailment: "Ailments",
  medication: "Medication",
  meds: "Medication",
  pill: "Pill",
  appointment: "Appointments",
  sleep: "Sleep",
  tags: "Tags",
  notes: "Notes",
};

const labelFor = (category: string) =>
  CATEGORY_LABELS[normalizeKey(category)] ??
  normalizeKey(category).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The YYYY-MM-DD at the start of a date string ("2026-10-29", "2026-10-29 00:00:00", "2026-10-29T00:00:00Z"). */
function dayKeyOf(value: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1] ? null : match[1];
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const FLOW_RANK: Record<Flow, number> = { none: 0, spotting: 1, light: 2, medium: 3, heavy: 4 };

/** Collects effects per day, then turns them into the preview. */
class DayCollector {
  private days = new Map<string, ImportedDay>();
  private skipped = new Set<string>();

  constructor(private todayKey: string) {}

  apply(dateKey: string | null, effect: Effect | null, categoryForSkip?: string) {
    if (!dateKey || dateKey > this.todayKey) return;
    if (!effect) {
      if (categoryForSkip) this.skipped.add(labelFor(categoryForSkip));
      return;
    }
    const day = this.days.get(dateKey) ?? { dateKey };
    if (effect.flow && FLOW_RANK[effect.flow] > FLOW_RANK[day.flow ?? "none"]) day.flow = effect.flow;
    for (const key of ["symptoms", "moods", "digestions", "skins", "exercise"] as const) {
      const values = effect[key] as string[] | undefined;
      if (values?.length) (day as unknown as Record<string, string[]>)[key] = Array.from(new Set([...((day[key] as string[]) ?? []), ...values]));
    }
    if (effect.energy && !day.energy) day.energy = effect.energy;
    if (effect.discharge && !day.discharge) day.discharge = effect.discharge;
    if (effect.isIntimate) day.isIntimate = true;
    if (effect.weight !== undefined) day.weight = effect.weight;
    if (effect.temperature !== undefined) day.temperature = effect.temperature;
    this.days.set(dateKey, day);
  }

  /** A period from start to end (inclusive): days without a logged flow get `fallback`. */
  applyPeriod(startKey: string | null, endKey: string | null, fallback: Flow) {
    if (!startKey) return;
    const end = endKey && endKey >= startKey ? endKey : startKey;
    // A period over 15 days is a broken record, not a period.
    for (let key = startKey, i = 0; key <= end && i < 15; key = addDays(key, 1), i++) {
      if (!this.days.get(key)?.flow) this.apply(key, { flow: fallback });
    }
  }

  preview(source: ImportSource): ImportPreview {
    const days = [...this.days.values()]
      .filter((day) => Object.keys(day).length > 1)
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
    const flowDays = days.filter((day) => day.flow && day.flow !== "none" && day.flow !== "spotting").map((day) => day.dateKey);
    let periods = 0;
    let last: string | null = null;
    for (const key of flowDays) {
      if (!last || key > addDays(last, 3)) periods += 1;
      last = key;
    }
    return {
      source,
      days,
      periodDays: flowDays.length,
      periods,
      firstDateKey: days[0]?.dateKey ?? null,
      lastDateKey: days[days.length - 1]?.dateKey ?? null,
      unsupported: [...this.skipped].sort(),
    };
  }
}

/** Options out of a Clue value: `{ option }`, `[{ option }]`, `"light"`, `["cramps"]`. */
function optionsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => (item && typeof item === "object" ? ((item as Record<string, unknown>).option ?? (item as Record<string, unknown>).value) : item))
    .filter((item): item is string => typeof item === "string" && item.length > 0);
}

function numberOf(value: unknown): number | null {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).value ?? (value as Record<string, unknown>).amount : value;
  const num = typeof raw === "string" ? Number(raw) : raw;
  return typeof num === "number" && Number.isFinite(num) ? num : null;
}

/** BBT in °C (a value over 45 is read as °F). */
function temperatureEffect(value: unknown): Effect | null {
  const num = numberOf(value);
  if (num === null) return null;
  const celsius = num > 45 ? Math.round(((num - 32) * 5) / 9 * 100) / 100 : num;
  return celsius >= 30 && celsius <= 45 ? { temperature: celsius } : null;
}

function weightEffect(value: unknown): Effect | null {
  const num = numberOf(value);
  return num !== null && num > 0 && num < 500 ? { weight: num } : null;
}

function applyMeasurement(days: DayCollector, dateKey: string | null, type: string, value: unknown) {
  const category = normalizeKey(type);
  if (/^(bbt|temperature|basal_body_temperature)$/.test(category)) return days.apply(dateKey, temperatureEffect(value), type);
  if (category === "weight") return days.apply(dateKey, weightEffect(value), type);
  const options = optionsOf(value);
  if (options.length === 0) return days.apply(dateKey, null, type);
  for (const option of options) {
    const skippedAs = category === "pain" && normalizeKey(option) === "ovulation" ? "ovulation_pain" : type;
    days.apply(dateKey, mapOption(type, option), skippedAs);
  }
}

/** Clue's current export: `measurements.json`. */
export function parseClueMeasurements(data: unknown, todayKey: string): ImportPreview {
  if (!Array.isArray(data)) throw new ImportFormatError("This Clue file has no measurements.");
  const days = new DayCollector(todayKey);
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const { type, date, value } = entry as Record<string, unknown>;
    if (typeof type !== "string") continue;
    applyMeasurement(days, dayKeyOf(date), type, value);
  }
  return days.preview("clue");
}

/** Clue's older `.cluedata` export: `{ data: [{ day, period, pain: [...] }] }`. */
export function parseClueLegacy(data: { data: unknown[] }, todayKey: string): ImportPreview {
  const days = new DayCollector(todayKey);
  for (const entry of data.data) {
    if (!entry || typeof entry !== "object") continue;
    const { day, ...fields } = entry as Record<string, unknown>;
    const dateKey = dayKeyOf(day);
    for (const [type, value] of Object.entries(fields)) applyMeasurement(days, dateKey, type, value);
  }
  return days.preview("clue");
}

/** Flo's export: period start/end dates plus logged events. */
export function parseFlo(data: Record<string, unknown>, todayKey: string): ImportPreview {
  const root = (data.operationalData as Record<string, unknown> | undefined) ?? data;
  const days = new DayCollector(todayKey);

  for (const [key, list] of Object.entries(root)) {
    if (!key.startsWith("point_events") || !Array.isArray(list)) continue;
    for (const event of list) {
      if (!event || typeof event !== "object") continue;
      const e = event as Record<string, unknown>;
      const dateKey = dayKeyOf(e.date ?? e.day ?? e.event_date);
      const category = String(e.category ?? e.type ?? "");
      const option = e.subcategory ?? e.value ?? e.name;
      if (/temperature|bbt/i.test(category)) days.apply(dateKey, temperatureEffect(option ?? e.amount), category);
      else if (/weight/i.test(category)) days.apply(dateKey, weightEffect(option ?? e.amount), category);
      else if (typeof option === "string") days.apply(dateKey, mapOption(category, option) ?? mapOption("", option), category || option);
    }
  }

  // Period ranges go last, so a logged intensity wins over the fallback.
  const cycles = Array.isArray(root.cycles) ? root.cycles : [];
  for (const cycle of cycles) {
    if (!cycle || typeof cycle !== "object") continue;
    const c = cycle as Record<string, unknown>;
    days.applyPeriod(dayKeyOf(c.period_start_date ?? c.periodStartDate ?? c.start_date), dayKeyOf(c.period_end_date ?? c.periodEndDate ?? c.end_date), "medium");
  }
  return days.preview("flo");
}

/** Which export a parsed JSON is, or null. */
function parseJson(data: unknown, todayKey: string, fileName: string): ImportPreview | null {
  if (Array.isArray(data)) {
    const looksLikeClue = data.some((e) => e && typeof e === "object" && "type" in e && "date" in e);
    return looksLikeClue || /measurements/i.test(fileName) ? parseClueMeasurements(data, todayKey) : null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.data) && obj.data.some((e) => e && typeof e === "object" && "day" in e)) {
    return parseClueLegacy(obj as { data: unknown[] }, todayKey);
  }
  const root = (obj.operationalData as Record<string, unknown> | undefined) ?? obj;
  if (root && typeof root === "object" && (Array.isArray(root.cycles) || Object.keys(root).some((k) => k.startsWith("point_events")))) {
    return parseFlo(obj, todayKey);
  }
  return null;
}

function parseText(text: string, todayKey: string, fileName: string): ImportPreview | null {
  try {
    return parseJson(JSON.parse(text.replace(/^﻿/, "")), todayKey, fileName);
  } catch (err) {
    if (err instanceof ImportFormatError) throw err;
    return null;
  }
}

/**
 * Reads a picked file (a Clue/Flo .zip, Clue's measurements.json or
 * .cluedata, or Flo's .json). Clue locks its zip with a password, shown
 * in Clue when the data is requested: without it (or with a wrong one)
 * this throws ZipPasswordError. Throws ImportFormatError when the file
 * isn't an export.
 */
export function parseImportFile(bytes: Uint8Array, fileName: string, todayKey: string, password?: string): ImportPreview {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  let preview: ImportPreview | null = null;

  if (isZip) {
    let total = 0;
    let files: Record<string, Uint8Array>;
    try {
      files = readZip(
        bytes,
        (file) => {
          if (!/\.(json|cluedata|txt)$/i.test(file.name) || /(^|\/)__MACOSX\//.test(file.name)) return false;
          total += file.size;
          return total <= MAX_UNZIPPED_BYTES;
        },
        password,
      );
    } catch (err) {
      // A ZipPasswordError goes up as is: the screen asks for the password.
      if (err instanceof ZipFormatError) throw new ImportFormatError("This zip file couldn't be opened.");
      throw err;
    }
    // Clue's measurements first, then any other file that looks like an export.
    const names = Object.keys(files).sort((a, b) => Number(/measurements/i.test(b)) - Number(/measurements/i.test(a)));
    for (const name of names) {
      preview = parseText(strFromU8(files[name]), todayKey, name);
      if (preview) break;
    }
  } else {
    preview = parseText(strFromU8(bytes), todayKey, fileName);
  }

  if (!preview) {
    throw new ImportFormatError("This doesn't look like a Clue or Flo data export. Pick the .zip or .json file the app sent you.");
  }
  if (preview.days.length === 0) {
    throw new ImportFormatError("There's nothing in this file Nura can import yet.");
  }
  return preview;
}

/** Day logs in groups of `size`, so a long history goes up in a few small requests. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
