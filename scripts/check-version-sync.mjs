import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const tauriConfig = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf-8"));
const cargoToml = fs.readFileSync("src-tauri/Cargo.toml", "utf-8");

const cargoMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
if (!cargoMatch) {
  throw new Error("Could not find version in src-tauri/Cargo.toml");
}

const versions = {
  package: packageJson.version,
  tauri: tauriConfig.version,
  cargo: cargoMatch[1],
};

const allEqual = versions.package === versions.tauri && versions.package === versions.cargo;
if (!allEqual) {
  console.error("Version mismatch:", versions);
  process.exit(1);
}

console.log(`Versions in sync: ${versions.package}`);
