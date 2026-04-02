import { resolve, dirname } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";

const SERVICE_NAME = "olms";
const SERVICE_LABEL = "com.thodinh.olms";

function getExecCommand(): { bin: string; args: string[] } {
  const exec = process.execPath;
  const argv = process.argv;

  if (exec === argv[0] && !argv.some((a) => a.endsWith(".ts"))) {
    return { bin: resolve(exec), args: argv.slice(1).filter((a) => a !== "service" && a !== "install") };
  }

  const scriptFile = argv.find((a) => a.endsWith(".ts") || a.endsWith(".js"));
  const runtimeArgs = scriptFile ? [resolve(scriptFile)] : [];
  return { bin: resolve(exec), args: runtimeArgs };
}

function getServiceArgs(): string[] {
  const forward: string[] = [];
  const argv = process.argv;
  const flagsToForward = ["--port", "-p", "--lmstudio-url", "-u", "--ollama-version", "-v", "--log-dir", "--verbose"];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "service" || arg === "install" || arg === "uninstall" || arg === "start" || arg === "stop" || arg === "status") continue;
    if (flagsToForward.includes(arg)) {
      forward.push(arg);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        forward.push(argv[++i]);
      }
    }
  }
  return forward;
}

function macPlistPath(): string {
  return resolve(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
}

function macInstall() {
  const { bin, args } = getExecCommand();
  const serviceArgs = getServiceArgs();
  const allArgs = [...args, ...serviceArgs];

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
${allArgs.map((a) => `    <string>${a}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/${SERVICE_NAME}.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/${SERVICE_NAME}.stderr.log</string>
</dict>
</plist>`;

  const plistPath = macPlistPath();
  mkdirSync(dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, plist);
  console.log(`✅ Installed LaunchAgent → ${plistPath}`);
  console.log(`   Run: olms service start`);
}

function macUninstall() {
  const plistPath = macPlistPath();
  // Stop first if running
  try { Bun.spawnSync(["launchctl", "unload", plistPath]); } catch {}
  if (existsSync(plistPath)) {
    unlinkSync(plistPath);
    console.log(`✅ Removed LaunchAgent → ${plistPath}`);
  } else {
    console.log("⚠️  LaunchAgent not found (already uninstalled?)");
  }
}

function macStart() {
  const plistPath = macPlistPath();
  if (!existsSync(plistPath)) {
    console.error("❌ Service not installed. Run: olms service install");
    process.exit(1);
  }
  Bun.spawnSync(["launchctl", "load", plistPath]);
  console.log("✅ Service started");
}

function macStop() {
  const plistPath = macPlistPath();
  Bun.spawnSync(["launchctl", "unload", plistPath]);
  console.log("✅ Service stopped");
}

function macStatus() {
  const result = Bun.spawnSync(["launchctl", "list", SERVICE_LABEL]);
  const output = new TextDecoder().decode(result.stdout).trim();
  if (result.exitCode === 0 && output) {
    console.log(`✅ Service is registered\n${output}`);
  } else {
    console.log("⚠️  Service is not running");
  }
}

function linuxUnitPath(): string {
  return resolve(homedir(), ".config", "systemd", "user", `${SERVICE_NAME}.service`);
}

function linuxInstall() {
  const { bin, args } = getExecCommand();
  const serviceArgs = getServiceArgs();
  const execStart = [bin, ...args, ...serviceArgs].join(" ");

  const unit = `[Unit]
Description=OLMS — LMStudio to Ollama Bridge
After=network.target

[Service]
Type=simple
ExecStart=${execStart}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;

  const unitPath = linuxUnitPath();
  mkdirSync(dirname(unitPath), { recursive: true });
  writeFileSync(unitPath, unit);
  Bun.spawnSync(["systemctl", "--user", "daemon-reload"]);
  Bun.spawnSync(["systemctl", "--user", "enable", SERVICE_NAME]);
  console.log(`✅ Installed systemd user unit → ${unitPath}`);
  console.log(`   Run: olms service start`);
}

function linuxUninstall() {
  try { Bun.spawnSync(["systemctl", "--user", "stop", SERVICE_NAME]); } catch {}
  try { Bun.spawnSync(["systemctl", "--user", "disable", SERVICE_NAME]); } catch {}
  const unitPath = linuxUnitPath();
  if (existsSync(unitPath)) {
    unlinkSync(unitPath);
    Bun.spawnSync(["systemctl", "--user", "daemon-reload"]);
    console.log(`✅ Removed systemd unit → ${unitPath}`);
  } else {
    console.log("⚠️  Unit file not found (already uninstalled?)");
  }
}

function linuxStart() {
  Bun.spawnSync(["systemctl", "--user", "start", SERVICE_NAME]);
  console.log("✅ Service started");
}

function linuxStop() {
  Bun.spawnSync(["systemctl", "--user", "stop", SERVICE_NAME]);
  console.log("✅ Service stopped");
}

function linuxStatus() {
  const result = Bun.spawnSync(["systemctl", "--user", "status", SERVICE_NAME]);
  console.log(new TextDecoder().decode(result.stdout));
}

const WIN_REG_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

function windowsInstall() {
  const { bin, args } = getExecCommand();
  const serviceArgs = getServiceArgs();
  const cmd = [bin, ...args, ...serviceArgs].map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ");

  Bun.spawnSync(["reg", "add", WIN_REG_KEY, "/v", SERVICE_NAME, "/t", "REG_SZ", "/d", cmd, "/f"]);
  console.log(`✅ Added to Windows startup registry`);
  console.log(`   The bridge will start automatically on next login.`);
  console.log(`   To start now, run: olms service start`);
}

function windowsUninstall() {
  Bun.spawnSync(["reg", "delete", WIN_REG_KEY, "/v", SERVICE_NAME, "/f"]);
  console.log("✅ Removed from Windows startup registry");
}

function windowsStart() {
  const { bin, args } = getExecCommand();
  const serviceArgs = getServiceArgs();
  Bun.spawn([bin, ...args, ...serviceArgs], { stdio: ["ignore", "ignore", "ignore"] });
  console.log("✅ Service started in background");
}

function windowsStop() {
  Bun.spawnSync(["taskkill", "/IM", "olms.exe", "/F"]);
  console.log("✅ Service stopped");
}

function windowsStatus() {
  const result = Bun.spawnSync(["tasklist", "/FI", `IMAGENAME eq olms.exe`]);
  const output = new TextDecoder().decode(result.stdout);
  if (output.includes("olms.exe")) {
    console.log("✅ Service is running");
  } else {
    console.log("⚠️  Service is not running");
  }
}

type ServiceCommand = "install" | "uninstall" | "start" | "stop" | "status";

const COMMANDS: Record<string, Record<ServiceCommand, () => void>> = {
  darwin: { install: macInstall, uninstall: macUninstall, start: macStart, stop: macStop, status: macStatus },
  linux: { install: linuxInstall, uninstall: linuxUninstall, start: linuxStart, stop: linuxStop, status: linuxStatus },
  win32: { install: windowsInstall, uninstall: windowsUninstall, start: windowsStart, stop: windowsStop, status: windowsStatus },
};

export function handleServiceCommand(subcommand: string): void {
  const platform = process.platform;
  const handlers = COMMANDS[platform];

  if (!handlers) {
    console.error(`❌ Platform "${platform}" is not supported for service management.`);
    console.error(`   Supported: macOS (darwin), Linux, Windows (win32)`);
    process.exit(1);
  }

  const validCommands: ServiceCommand[] = ["install", "uninstall", "start", "stop", "status"];
  if (!validCommands.includes(subcommand as ServiceCommand)) {
    console.error(`❌ Unknown service command: "${subcommand}"`);
    console.error(`   Usage: olms service <install|uninstall|start|stop|status>`);
    process.exit(1);
  }

  handlers[subcommand as ServiceCommand]();
}
