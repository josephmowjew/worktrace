import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rustCommandsPath = path.join(
  repoRoot,
  "src-tauri",
  "src",
  "interface",
  "commands",
  "mod.rs",
);
const tsApiDir = path.join(repoRoot, "src", "lib", "api");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function collectRustCommands() {
  const content = read(rustCommandsPath);
  const blockMatch = content.match(/generate_handler!\[(?<body>[\s\S]*?)\]/m);
  if (!blockMatch?.groups?.body) {
    throw new Error("Could not find tauri::generate_handler! block in commands/mod.rs");
  }

  const names = new Set();
  const regex = /[a-z_][a-z0-9_]*::([a-z_][a-z0-9_]*)/g;
  let match;
  while ((match = regex.exec(blockMatch.groups.body)) !== null) {
    names.add(match[1]);
  }
  return names;
}

function collectTsCommands() {
  const names = new Set();
  const files = fs
    .readdirSync(tsApiDir)
    .filter((file) => file.endsWith(".ts") && file !== "client.ts" && file !== "queryKeys.ts");

  const regex = /callCommand(?:<[^>]+>)?\(\s*"([a-z_][a-z0-9_]*)"/g;
  for (const file of files) {
    const content = read(path.join(tsApiDir, file));
    let match;
    while ((match = regex.exec(content)) !== null) {
      names.add(match[1]);
    }
  }
  return names;
}

function diff(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}

const rustCommands = collectRustCommands();
const tsCommands = collectTsCommands();
const rustOnly = diff(rustCommands, tsCommands);
const tsOnly = diff(tsCommands, rustCommands);

if (rustOnly.length === 0 && tsOnly.length === 0) {
  console.log(`Command parity OK (${rustCommands.size} commands).`);
  process.exit(0);
}

console.error("Command parity mismatch detected.");
if (rustOnly.length > 0) {
  console.error(`Rust-only commands (${rustOnly.length}): ${rustOnly.join(", ")}`);
}
if (tsOnly.length > 0) {
  console.error(`TS-only commands (${tsOnly.length}): ${tsOnly.join(", ")}`);
}
process.exit(1);
