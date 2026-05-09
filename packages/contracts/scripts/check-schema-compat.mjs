import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = path.join(root, "schema", "generated");
const baselineDir = path.join(root, "schema", "baseline");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function typeList(schema) {
  if (!schema || typeof schema !== "object") {
    return [];
  }
  if (typeof schema.type === "string") {
    return [schema.type];
  }
  if (Array.isArray(schema.type)) {
    return schema.type.map((x) => String(x));
  }
  return [];
}

function checkSubset(oldList, newList, pathLabel, failures) {
  for (const item of oldList) {
    if (!newList.includes(item)) {
      failures.push(`${pathLabel}: missing required value "${item}"`);
    }
  }
}

function isObjectLike(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function compareSchema(oldSchema, newSchema, pathLabel, failures) {
  const oldTypes = typeList(oldSchema);
  const newTypes = typeList(newSchema);
  if (oldTypes.length > 0 && newTypes.length > 0) {
    checkSubset(oldTypes, newTypes, `${pathLabel}.type`, failures);
  }

  if (Array.isArray(oldSchema?.enum)) {
    if (!Array.isArray(newSchema?.enum)) {
      failures.push(`${pathLabel}.enum: enum removed`);
    } else {
      checkSubset(oldSchema.enum.map(String), newSchema.enum.map(String), `${pathLabel}.enum`, failures);
    }
  }

  const oldRequired = Array.isArray(oldSchema?.required) ? oldSchema.required.map(String) : [];
  const newRequired = Array.isArray(newSchema?.required) ? newSchema.required.map(String) : [];
  checkSubset(oldRequired, newRequired, `${pathLabel}.required`, failures);

  if (isObjectLike(oldSchema?.properties)) {
    if (!isObjectLike(newSchema?.properties)) {
      failures.push(`${pathLabel}.properties: object properties removed`);
      return;
    }
    for (const key of Object.keys(oldSchema.properties)) {
      if (!(key in newSchema.properties)) {
        failures.push(`${pathLabel}.properties.${key}: property removed`);
        continue;
      }
      compareSchema(oldSchema.properties[key], newSchema.properties[key], `${pathLabel}.properties.${key}`, failures);
    }
  }

  if (isObjectLike(oldSchema?.items) && isObjectLike(newSchema?.items)) {
    compareSchema(oldSchema.items, newSchema.items, `${pathLabel}.items`, failures);
  }
}

async function ensureDir(dir) {
  try {
    await fs.access(dir);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await ensureDir(generatedDir))) {
    throw new Error(`generated schema directory not found: ${generatedDir}`);
  }
  if (!(await ensureDir(baselineDir))) {
    throw new Error(`baseline schema directory not found: ${baselineDir}`);
  }

  const baselineFiles = await listJsonFiles(baselineDir);
  const generatedFiles = await listJsonFiles(generatedDir);
  const missingGenerated = baselineFiles.filter((name) => !generatedFiles.includes(name));
  if (missingGenerated.length > 0) {
    throw new Error(`generated schema missing files: ${missingGenerated.join(", ")}`);
  }

  const failures = [];
  for (const fileName of baselineFiles) {
    const oldSchema = await readJson(path.join(baselineDir, fileName));
    const newSchema = await readJson(path.join(generatedDir, fileName));
    compareSchema(oldSchema, newSchema, fileName, failures);
  }

  if (failures.length > 0) {
    const lines = failures.map((line) => `- ${line}`).join("\n");
    throw new Error(`schema compatibility check failed:\n${lines}`);
  }
  console.log("[contracts] schema compatibility check passed");
}

main().catch((error) => {
  console.error(`[contracts] schema compatibility failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
