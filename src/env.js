import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function loadEnvFile(fileName = ".env") {
  const envPath = join(process.cwd(), fileName);
  if (!existsSync(envPath)) {
    return false;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (entry && process.env[entry.key] === undefined) {
      process.env[entry.key] = entry.value;
    }
  }

  return true;
}

loadEnvFile();
