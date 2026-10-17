import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const npmCli = process.env.npm_execpath;
const useWindowsShell = process.platform === "win32" && !npmCli;
const npmCommand = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const services = [
  { name: "Backend", directory: resolve(projectDirectory, "backend"), args: ["run", "dev"] },
  { name: "Frontend", directory: resolve(projectDirectory, "frontend"), args: ["run", "dev"] }
];

let stopping = false;
const children = [];

function stopAll(exitCode = 0) {
  if (stopping) return;

  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

for (const service of services) {
  const args = npmCli ? [npmCli, ...service.args] : service.args;
  const child = spawn(npmCommand, args, {
    cwd: service.directory,
    env: process.env,
    shell: useWindowsShell,
    stdio: "inherit"
  });
  children.push(child);

  child.on("error", error => {
    console.error(`${service.name} could not be started: ${error.message}`);
    stopAll(1);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`${service.name} stopped (${signal || `exit code ${code}`}); stopping the other service.`);
    stopAll(code || 1);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
