// 本地化资源一致性校验（对应原版 Verify-LocalizationResources.ps1 的三条规则）：
// 1) 单语言内键不重复；2) 各语言键集合一致；3) 每键格式占位符集合一致。
import fs from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");
const FILES = ["zh-Hans.json", "en.json"];

function readKeys(file) {
  const text = fs.readFileSync(path.join(LOCALES_DIR, file), "utf8");
  const seen = new Set();
  const duplicates = [];
  for (const match of text.matchAll(/"([^"]+)"\s*:/g)) {
    if (seen.has(match[1])) {
      duplicates.push(match[1]);
    }
    seen.add(match[1]);
  }
  return { map: JSON.parse(text), duplicates };
}

function placeholdersOf(value) {
  return [...String(value).matchAll(/\{\d+\}/g)].map((m) => m[0]).sort().join(",");
}

const parsed = Object.fromEntries(FILES.map((file) => [file, readKeys(file)]));
let failed = false;

for (const [file, { duplicates }] of Object.entries(parsed)) {
  if (duplicates.length > 0) {
    console.error(`[${file}] duplicate keys: ${[...new Set(duplicates)].join(", ")}`);
    failed = true;
  }
}

const [base, ...others] = FILES;
const baseKeys = Object.keys(parsed[base].map);
for (const file of others) {
  const keys = Object.keys(parsed[file].map);
  const missing = baseKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !baseKeys.includes(key));
  if (missing.length > 0) {
    console.error(`[${file}] missing keys: ${missing.join(", ")}`);
    failed = true;
  }
  if (extra.length > 0) {
    console.error(`[${file}] extra keys: ${extra.join(", ")}`);
    failed = true;
  }
}

for (const key of baseKeys) {
  const expected = placeholdersOf(parsed[base].map[key]);
  for (const file of others) {
    const actual = placeholdersOf(parsed[file].map[key] ?? "");
    if (expected !== actual) {
      console.error(`[${file}] placeholder mismatch for ${key}: ${expected} vs ${actual}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log(`Localization resources are valid: ${baseKeys.length} keys in ${FILES.join(" and ")}.`);
