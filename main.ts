/**
 * Anggaran Rumah — static site builder.
 *
 * Reads the authored sources (template, stylesheet, client app, seeded
 * sample data), validates the data, and writes the complete static site
 * into out/. No dependencies, no network, fully deterministic.
 *
 *   node main.ts        -> writes out/index.html
 *
 * Requires Node.js 22.18+ (native TypeScript type stripping).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, "out");

type Category = { id: string; name: string; icon: string; color: string; budget: number };
type Income = { id: string; month: string; date: string; source: string; amount: number };
type Transaction = { id: string; month: string; date: string; type: string; category: string; note: string; amount: number };
type Goal = { id: string; name: string; icon: string; target: number; saved: number; deadline: string };
type SampleData = {
  household: { name: string; city: string; currency: string; members: number };
  categories: Category[];
  income: Income[];
  transactions: Transaction[];
  goals: Goal[];
  months?: string[];
};

function fail(message: string): never {
  throw new Error("anggaran-rumah build failed: " + message);
}

function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validate(data: unknown): SampleData {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    fail("sample data must be a JSON object");
  }
  const d = data as Record<string, unknown>;

  if (typeof d.household !== "object" || d.household === null || Array.isArray(d.household)) {
    fail("household must be an object");
  }
  const household = d.household as Record<string, unknown>;
  if (!isNonEmptyString(household.name)) fail("household.name must be a non-empty string");
  if (!isNonEmptyString(household.city)) fail("household.city must be a non-empty string");
  if (household.currency !== "IDR") fail("household.currency must be IDR");
  if (!isPositiveInt(household.members)) fail("household.members must be a positive integer");

  if (!Array.isArray(d.categories) || d.categories.length === 0) {
    fail("categories must be a non-empty array");
  }
  const catIds = new Set<string>();
  for (const c of d.categories as unknown[]) {
    if (typeof c !== "object" || c === null || Array.isArray(c)) fail("each category must be an object");
    const cat = c as Record<string, unknown>;
    if (!isNonEmptyString(cat.id)) fail("category.id must be a non-empty string");
    if (catIds.has(cat.id as string)) fail("duplicate category id: " + String(cat.id));
    catIds.add(cat.id as string);
    if (!isNonEmptyString(cat.name)) fail("category " + String(cat.id) + " needs a name");
    if (!isNonEmptyString(cat.icon)) fail("category " + String(cat.id) + " needs an icon");
    if (typeof cat.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(cat.color)) {
      fail("category " + String(cat.id) + " needs a #rrggbb color");
    }
    if (!isPositiveInt(cat.budget)) fail("category " + String(cat.id) + " needs a positive integer budget");
  }

  if (!Array.isArray(d.income) || d.income.length === 0) fail("income must be a non-empty array");
  const incomeIds = new Set<string>();
  for (const x of d.income as unknown[]) {
    if (typeof x !== "object" || x === null || Array.isArray(x)) fail("each income entry must be an object");
    const inc = x as Record<string, unknown>;
    if (!isNonEmptyString(inc.id)) fail("income entry needs an id");
    if (incomeIds.has(inc.id as string)) fail("duplicate income id: " + String(inc.id));
    incomeIds.add(inc.id as string);
    if (!isMonth(inc.month)) fail("income " + String(inc.id) + " has a bad month");
    if (!isDate(inc.date)) fail("income " + String(inc.id) + " has a bad date");
    if (!String(inc.date).startsWith(String(inc.month))) {
      fail("income " + String(inc.id) + " date does not match its month");
    }
    if (!isNonEmptyString(inc.source)) fail("income " + String(inc.id) + " needs a source");
    if (!isPositiveInt(inc.amount)) fail("income " + String(inc.id) + " needs a positive integer amount");
  }

  if (!Array.isArray(d.transactions) || d.transactions.length === 0) {
    fail("transactions must be a non-empty array");
  }
  const txIds = new Set<string>();
  for (const t of d.transactions as unknown[]) {
    if (typeof t !== "object" || t === null || Array.isArray(t)) fail("each transaction must be an object");
    const tx = t as Record<string, unknown>;
    if (!isNonEmptyString(tx.id)) fail("transaction needs an id");
    if (txIds.has(tx.id as string)) fail("duplicate transaction id: " + String(tx.id));
    txIds.add(tx.id as string);
    if (!isMonth(tx.month)) fail("transaction " + String(tx.id) + " has a bad month");
    if (!isDate(tx.date)) fail("transaction " + String(tx.id) + " has a bad date");
    if (!String(tx.date).startsWith(String(tx.month))) {
      fail("transaction " + String(tx.id) + " date does not match its month");
    }
    if (tx.type !== "expense" && tx.type !== "income") {
      fail("transaction " + String(tx.id) + " type must be expense or income");
    }
    if (tx.type === "expense" && !catIds.has(String(tx.category))) {
      fail("transaction " + String(tx.id) + " references unknown category " + String(tx.category));
    }
    if (!isPositiveInt(tx.amount)) fail("transaction " + String(tx.id) + " needs a positive integer amount");
  }

  if (!Array.isArray(d.goals)) fail("goals must be an array");
  const goalIds = new Set<string>();
  for (const g of d.goals as unknown[]) {
    if (typeof g !== "object" || g === null || Array.isArray(g)) fail("each goal must be an object");
    const goal = g as Record<string, unknown>;
    if (!isNonEmptyString(goal.id)) fail("goal needs an id");
    if (goalIds.has(goal.id as string)) fail("duplicate goal id: " + String(goal.id));
    goalIds.add(goal.id as string);
    if (!isNonEmptyString(goal.name)) fail("goal " + String(goal.id) + " needs a name");
    if (!isPositiveInt(goal.target)) fail("goal " + String(goal.id) + " needs a positive integer target");
    if (typeof goal.saved !== "number" || !Number.isInteger(goal.saved) || goal.saved < 0) {
      fail("goal " + String(goal.id) + " needs a non-negative integer saved amount");
    }
    if (goal.saved > goal.target) fail("goal " + String(goal.id) + " saved exceeds target");
    if (goal.deadline !== undefined && !isDate(goal.deadline)) {
      fail("goal " + String(goal.id) + " has a bad deadline");
    }
  }

  const months = new Set<string>();
  for (const x of d.income as Income[]) months.add(x.month);
  for (const t of d.transactions as Transaction[]) months.add(t.month);
  if (months.size < 2) fail("sample data must span at least 2 months");

  const typed = data as SampleData;
  typed.months = [...months].sort();
  return typed;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main(): void {
  const rawData = read(path.join("data", "sample.json"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch (err) {
    fail("data/sample.json is not valid JSON: " + String(err));
  }
  const data = validate(parsed);

  const template = read(path.join("src", "template.html"));
  const styles = read(path.join("src", "styles.css"));
  const appJs = read(path.join("src", "app.js"));

  for (const [name, value] of [["__STYLES__", styles], ["__APP_JS__", appJs]] as const) {
    if (!template.includes(name)) fail("template is missing placeholder " + name);
    if (!value.trim()) fail(name.replace(/_/g, " ") + " source is empty");
  }
  if (!appJs.includes("__SEED_JSON__")) fail("src/app.js is missing the __SEED_JSON__ placeholder");

  const seedJson = JSON.stringify(data);
  const html = template
    .replace("__STYLES__", styles)
    .replace("__APP_JS__", appJs.replace("__SEED_JSON__", seedJson));

  if (html.includes("__STYLES__") || html.includes("__APP_JS__") || html.includes("__SEED_JSON__")) {
    fail("a placeholder survived into the output HTML");
  }
  if (/https?:\/\//.test(html.replace(/https:\/\/make\.fun\/bounty\/best-household-budget-site-20261126-1457/g, ""))) {
    fail("output HTML references an external URL (only the make.fun bounty link is allowed)");
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), html, "utf8");

  const bytes = Buffer.byteLength(html, "utf8");
  const monthsCount = data.months ? data.months.length : 0;
  console.log(
    "Anggaran Rumah built: out/index.html (" + bytes + " bytes, " +
    data.transactions.length + " transactions, " + data.income.length + " income rows, " +
    data.categories.length + " categories, " + data.goals.length + " goals, " +
    monthsCount + " months)",
  );
}

main();
