// Anggaran Rumah — static site builder.
//
// Assembles the whole site into a single self-contained index.html:
// the page skeleton (src/template.html) gets the stylesheet
// (src/styles.css) and the client app (src/app.js) inlined, and the
// client app gets the seed dataset (data/sample.json) injected after
// the data has been parsed and validated. Bad data fails the build
// loudly instead of shipping a broken page.
//
// Where the page lands:
//   - $MAKEFUN_OUTPUT_DIR/index.html when that variable is set
//     (the make.fun grader runs the entry that way, with the repo
//     mounted read-only, so nothing may be written into the repo);
//   - otherwise out/index.html next to this file, so a plain
//     `node main.ts` keeps working for a human reading the repo.
//
// No dependencies, no network, no clocks, no randomness: the same
// inputs always produce the same bytes.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? join(rootDir, "out");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`anggaran-rumah: ${message}`);
}

function readText(relativePath: string): string {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

// Replace the single occurrence of a placeholder token. Split/join is
// used instead of String.replace so that "$" sequences inside the
// injected CSS or JS are copied literally, never treated as patterns.
function fillOnce(text: string, token: string, value: string, where: string): string {
  const parts = text.split(token);
  if (parts.length !== 2) {
    fail(`${where}: expected exactly one ${token} placeholder, found ${parts.length - 1}`);
  }
  return parts.join(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function needString(obj: Record<string, unknown>, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) {
    fail(`${where}: "${key}" must be a non-empty string`);
  }
  return value;
}

function needAmount(obj: Record<string, unknown>, key: string, where: string): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${where}: "${key}" must be a finite number >= 0`);
  }
  return value;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function needMonthRow(
  row: Record<string, unknown>,
  where: string,
): { date: string; month: string } {
  const date = needString(row, "date", where);
  const month = needString(row, "month", where);
  if (!DATE_RE.test(date)) fail(`${where}: "date" must look like YYYY-MM-DD, got "${date}"`);
  if (!MONTH_RE.test(month)) fail(`${where}: "month" must look like YYYY-MM, got "${month}"`);
  if (!date.startsWith(month)) {
    fail(`${where}: "month" (${month}) does not match "date" (${date})`);
  }
  return { date, month };
}

function uniqueIds(rows: Record<string, unknown>[], where: string): Set<string> {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const id = needString(row, "id", `${where}[${index}]`);
    if (seen.has(id)) fail(`${where}: duplicate id "${id}"`);
    seen.add(id);
  });
  return seen;
}

function asRows(value: unknown, where: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${where}: must be a non-empty array`);
  }
  return value.map((row, index) => {
    if (!isRecord(row)) fail(`${where}[${index}]: must be an object`);
    return row;
  });
}

// ---------------------------------------------------------------------------
// Seed data: parse + validate
// ---------------------------------------------------------------------------

interface SeedData {
  categories: Record<string, unknown>[];
  goals: Record<string, unknown>[];
  household: Record<string, unknown>;
  income: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  months: string[];
}

function loadSeed(): SeedData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText("data/sample.json"));
  } catch (error) {
    fail(`data/sample.json is not valid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(parsed)) fail("data/sample.json: top level must be an object");

  if (!isRecord(parsed.household)) fail("household: must be an object");
  needString(parsed.household, "name", "household");
  needString(parsed.household, "city", "household");
  needString(parsed.household, "currency", "household");
  const members = parsed.household.members;
  if (typeof members !== "number" || !Number.isInteger(members) || members < 1) {
    fail('household: "members" must be a positive integer');
  }

  const categories = asRows(parsed.categories, "categories");
  const categoryIds = uniqueIds(categories, "categories");
  categories.forEach((category, index) => {
    const where = `categories[${index}]`;
    needString(category, "name", where);
    needString(category, "icon", where);
    needString(category, "color", where);
    needAmount(category, "budget", where);
  });

  const goals = asRows(parsed.goals, "goals");
  uniqueIds(goals, "goals");
  goals.forEach((goal, index) => {
    const where = `goals[${index}]`;
    needString(goal, "name", where);
    needString(goal, "icon", where);
    const target = needAmount(goal, "target", where);
    if (target <= 0) fail(`${where}: "target" must be greater than 0`);
    needAmount(goal, "saved", where);
    const deadline = needString(goal, "deadline", where);
    if (!DATE_RE.test(deadline)) {
      fail(`${where}: "deadline" must look like YYYY-MM-DD, got "${deadline}"`);
    }
  });

  const income = asRows(parsed.income, "income");
  uniqueIds(income, "income");
  const months = new Set<string>();
  income.forEach((row, index) => {
    const where = `income[${index}]`;
    if (needAmount(row, "amount", where) <= 0) {
      fail(`${where}: "amount" must be greater than 0`);
    }
    needString(row, "source", where);
    months.add(needMonthRow(row, where).month);
  });

  const transactions = asRows(parsed.transactions, "transactions");
  uniqueIds(transactions, "transactions");
  transactions.forEach((row, index) => {
    const where = `transactions[${index}]`;
    if (needAmount(row, "amount", where) <= 0) {
      fail(`${where}: "amount" must be greater than 0`);
    }
    const category = needString(row, "category", where);
    if (!categoryIds.has(category)) {
      fail(`${where}: unknown category "${category}"`);
    }
    const type = needString(row, "type", where);
    if (type !== "expense" && type !== "income") {
      fail(`${where}: "type" must be "expense" or "income", got "${type}"`);
    }
    needString(row, "note", where);
    months.add(needMonthRow(row, where).month);
  });

  return {
    categories,
    goals,
    household: parsed.household,
    income,
    transactions,
    // YYYY-MM strings sort chronologically as plain text, and a Set
    // keeps this independent of row order in the file.
    months: [...months].sort(),
  };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build(): void {
  const seed = loadSeed();
  const seedJson = JSON.stringify(seed);

  const appJs = fillOnce(
    readText("src/app.js"),
    "__SEED_JSON__",
    seedJson,
    "src/app.js",
  );
  const withApp = fillOnce(
    readText("src/template.html"),
    "__APP_JS__",
    appJs,
    "src/template.html",
  );
  const page = fillOnce(withApp, "__STYLES__", readText("src/styles.css"), "src/template.html");

  // A surviving placeholder would ship a visibly broken page; refuse.
  for (const token of ["__STYLES__", "__APP_JS__", "__SEED_JSON__"]) {
    if (page.includes(token)) {
      fail(`build: placeholder ${token} survived assembly`);
    }
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "index.html"), page, "utf8");

  // One deterministic summary line: counts and size only, never a
  // path or a timestamp, so two runs log exactly the same thing.
  console.log(
    `anggaran-rumah: index.html ${Buffer.byteLength(page, "utf8")} bytes; ` +
      `${seed.categories.length} categories, ${seed.income.length} income rows, ` +
      `${seed.transactions.length} transactions, ${seed.goals.length} goals, ` +
      `${seed.months.length} months`,
  );
}

build();
