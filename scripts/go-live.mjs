import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const apiDir = resolve(repoRoot, "apps/api");
const productionConfigPath = resolve(apiDir, "wrangler.production.toml");
const isDryRun = process.argv.includes("--dry-run");

const config = readFileSync(productionConfigPath, "utf8");
const workerName = readRequiredMatch(config, /^name = "([^"]+)"$/m, "Worker name");
const databaseName = readRequiredMatch(config, /^database_name = "([^"]+)"$/m, "D1 database name");
const bucketName = readRequiredMatch(config, /^bucket_name = "([^"]+)"$/m, "R2 bucket name");

logStep(`Preparing Cloudflare deployment for ${workerName}`);
ensureWranglerAuth();

const databaseId = ensureD1Database(databaseName);
ensureConfigDatabaseId(databaseId);
ensureR2Bucket(bucketName);

if (isDryRun) {
  runCommand("npm", ["run", "deploy:dry-run", "--workspace", "@event-photo/api"], { cwd: repoRoot });
  process.exit(0);
}

runCommand("npm", ["run", "db:migrate:remote", "--workspace", "@event-photo/api"], { cwd: repoRoot });
deployWorker();

function ensureWranglerAuth() {
  const result = runCommand("npx", ["wrangler", "whoami", "--json"], {
    cwd: apiDir,
    allowFailure: true
  });

  if (result.status === 0) {
    return;
  }

  logStep("Cloudflare login required");
  runCommand("npx", ["wrangler", "login"], { cwd: apiDir });
}

function ensureD1Database(name) {
  const existing = findDatabaseByName(name);
  if (existing?.uuid) {
    logInfo(`Using existing D1 database ${name} (${existing.uuid})`);
    return existing.uuid;
  }

  logStep(`Creating D1 database ${name}`);
  runCommand("npx", ["wrangler", "d1", "create", name, "--location", "weur"], { cwd: apiDir });

  const created = findDatabaseByName(name);
  if (!created?.uuid) {
    throw new Error(`Could not resolve the D1 database ID for ${name} after creation.`);
  }

  logInfo(`Created D1 database ${name} (${created.uuid})`);
  return created.uuid;
}

function findDatabaseByName(name) {
  const result = runCommand("npx", ["wrangler", "d1", "list", "--json"], { cwd: apiDir });
  const databases = JSON.parse(result.stdout);

  if (!Array.isArray(databases)) {
    throw new Error("Unexpected response from `wrangler d1 list --json`.");
  }

  return databases.find((database) => database?.name === name) ?? null;
}

function ensureConfigDatabaseId(databaseId) {
  const currentConfig = readFileSync(productionConfigPath, "utf8");
  const existingDatabaseId = currentConfig.match(/^database_id = "([^"]+)"$/m)?.[1];

  if (!existingDatabaseId) {
    throw new Error("Could not find `database_id` in wrangler.production.toml.");
  }

  if (existingDatabaseId === databaseId) {
    logInfo(`wrangler.production.toml already points to D1 database ID ${databaseId}`);
    return;
  }

  const updatedConfig = currentConfig.replace(
    /^database_id = "([^"]+)"$/m,
    `database_id = "${databaseId}"`
  );

  writeFileSync(productionConfigPath, updatedConfig);
  logInfo(`Updated wrangler.production.toml with D1 database ID ${databaseId}`);
}

function ensureR2Bucket(name) {
  const result = runCommand("npx", ["wrangler", "r2", "bucket", "list"], {
    cwd: apiDir,
    allowFailure: true
  });

  if (isR2NotEnabledResult(result)) {
    throw new Error(
      "Cloudflare R2 is not enabled for this account yet. Enable R2 in the Cloudflare Dashboard first, then run `make live` again."
    );
  }

  if (result.status === 0 && result.stdout.includes(name)) {
    logInfo(`Using existing R2 bucket ${name}`);
    return;
  }

  logStep(`Creating R2 bucket ${name}`);
  const createResult = runCommand("npx", ["wrangler", "r2", "bucket", "create", name, "--location", "weur"], {
    cwd: apiDir,
    allowFailure: true
  });

  if (createResult.status === 0) {
    logInfo(`Created R2 bucket ${name}`);
    return;
  }

  if (isR2NotEnabledResult(createResult)) {
    throw new Error(
      "Cloudflare R2 is not enabled for this account yet. Enable R2 in the Cloudflare Dashboard first, then run `make live` again."
    );
  }

  if (createResult.stderr.includes("already exists") || createResult.stdout.includes("already exists")) {
    logInfo(`Using existing R2 bucket ${name}`);
    return;
  }

  throw new Error(createResult.stderr || createResult.stdout || `Could not create R2 bucket ${name}.`);
}

function deployWorker() {
  const result = runCommand("npm", ["run", "deploy", "--workspace", "@event-photo/api"], {
    cwd: repoRoot,
    allowFailure: true
  });

  if (result.status === 0) {
    return;
  }

  if (isWorkersSubdomainMissingResult(result)) {
    throw new Error(
      "Cloudflare Workers is not fully initialized for this account yet. Open the Workers section once in the Cloudflare Dashboard to create your workers.dev subdomain, then run `make live` again."
    );
  }

  throw new Error(result.stderr || result.stdout || "Worker deployment failed.");
}

function runCommand(command, args, options = {}) {
  const { cwd, allowFailure = false } = options;
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? "/tmp"
    },
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"]
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (!allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function readRequiredMatch(source, pattern, label) {
  const value = source.match(pattern)?.[1];
  if (!value) {
    throw new Error(`${label} is missing from wrangler.production.toml.`);
  }
  return value;
}

function isR2NotEnabledResult(result) {
  return `${result.stdout}\n${result.stderr}`.includes("[code: 10042]");
}

function isWorkersSubdomainMissingResult(result) {
  return `${result.stdout}\n${result.stderr}`.includes("[code: 10063]");
}

function logStep(message) {
  console.log(`\n==> ${message}`);
}

function logInfo(message) {
  console.log(`EventFrame: ${message}`);
}
