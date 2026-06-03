export interface StartHintBundle {
  configHint: Record<string, unknown>;
  binaryHint: Record<string, unknown>;
  npmDevHint: Record<string, unknown>;
  launcherSpec: string;
}

export interface StartPackageVersions {
  launcherVersion: string | null;
  selfVersion: string | null;
  alignedLauncherVersion: string | null;
}

export function tryReadPackageVersion(name: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const raw = require(`${name}/package.json`) as { version?: unknown };
    const v = String(raw?.version ?? "").trim();
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function resolveStartPackageVersions(): StartPackageVersions {
  const launcherVersion = tryReadPackageVersion("@ada-mcp/launcher");
  const selfVersion = tryReadPackageVersion("@ada-mcp/mcp-server");
  return {
    launcherVersion,
    selfVersion,
    alignedLauncherVersion: launcherVersion || selfVersion
  };
}

export function buildStartHints(input: { binaryCommand: string; cwd: string; alignedLauncherVersion: string | null }): StartHintBundle {
  const launcherSpec = input.alignedLauncherVersion
    ? `@ada-mcp/launcher@${input.alignedLauncherVersion}`
    : "@ada-mcp/launcher";

  const configHint = {
    mcpServers: {
      "ada-mcp": {
        command: "pnpm",
        args: ["dlx", launcherSpec]
      }
    }
  };
  const binaryHint = {
    mcpServers: {
      "ada-mcp": {
        command: input.binaryCommand,
        args: [],
        cwd: input.cwd,
        env: {
          ADA_PLAYWRIGHT_HEADLESS: "false",
          ADA_PLAYWRIGHT_BRING_TO_FRONT: "true",
          ADA_MCP_INSTALL_DEPS: "playwright",
          ADA_INSTALL_STRATEGY_TIMEOUT_MS: "120000",
          ADA_PLAYWRIGHT_INSTALL_TIMEOUT_MS: "3600000"
        }
      }
    }
  };
  const npmDevHint = {
    mcpServers: {
      "ada-mcp-dev": {
        command: "npm",
        args: ["run", "mcp:dev"]
      }
    }
  };
  return { configHint, binaryHint, npmDevHint, launcherSpec };
}
