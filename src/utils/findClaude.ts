import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';

/** Validates that the given path exists and is the Claude CLI.
 *  Returns an error message string if invalid, or undefined if valid. */
export function validateClaudePath(claudePath: string): string | undefined {
  try {
    fs.statSync(claudePath);
  } catch {
    return `Invalid Claude path: ${claudePath} does not exist.`;
  }

  /*
    WARNING: this relies on the output of claude --version containing the word "claude" somewhere
    This seems to be a fairly safe assumption, but if claude ever rebrands this might be a problem
  */
  try {
    const result = execSync(`"${claudePath}" --version`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    if (!result.toLowerCase().includes('claude')) {
      return `Invalid Claude path: ${claudePath} does not appear to be Claude CLI. Update the path, then restart the extension.`;
    }
  } catch {
    return `Invalid Claude path: Failed to run ${claudePath}. Update the path, then restart the extension.`;
  }

  try {
    const { stdout } = spawnSync(claudePath, ['auth', 'status', '--json'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const authStatus = JSON.parse(stdout);
    if (!authStatus.loggedIn) {
      return 'Not logged in to Claude. Run "claude auth login" in your terminal, then restart the extension.';
    }
  } catch {
    return 'Unable to check Claude authentication status. Update the Claude path then restart the extension.';
  }

  return undefined;
}

export function findClaudePath(): string | undefined {
  const config = vscode.workspace.getConfiguration('blueprint');
  const configuredPath = config.get<string>('claudePath');
  if (configuredPath) {
    return configuredPath;
  }

  try {
    const command = process.platform === 'win32' ? 'where claude' : 'which claude';
    const result = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const path = result.trim().split('\n')[0];
    if (path) {
      return path;
    }
  } catch {
    // claude not found in PATH
  }

  return undefined;
}
