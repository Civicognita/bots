/**
 * BOTS Integration Auto-Detection
 *
 * Probes the project environment and returns the appropriate integration:
 *   1. Tynn — .claude/settings.local.json or .mcp.json has "tynn" in mcpServers
 *   2. NoOp — Not detected (standalone mode)
 *
 * Also provides getStatePath() for path resolution based on active integration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectIntegration, getIntegration, setIntegration } from '../project-integration.js';
import { TynnIntegration } from './tynn.js';

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if the project has Tynn MCP configured.
 * Looks for "tynn" in:
 *   1. .mcp.json — mcpServers.tynn (standard MCP config)
 *   2. .claude/settings.local.json — enabledMcpjsonServers or mcpServers
 */
function hasTynnMcp(cwd: string): boolean {
  // Check .mcp.json first (standard MCP configuration)
  const mcpJsonPath = path.join(cwd, '.mcp.json');
  try {
    const content = fs.readFileSync(mcpJsonPath, 'utf-8');
    const mcpConfig = JSON.parse(content);
    if (mcpConfig.mcpServers && typeof mcpConfig.mcpServers === 'object') {
      if (Object.keys(mcpConfig.mcpServers).some(k => k.toLowerCase().includes('tynn'))) {
        return true;
      }
    }
  } catch {
    // .mcp.json not found or invalid — continue to settings check
  }

  // Check .claude/settings.local.json
  const settingsPath = path.join(cwd, '.claude', 'settings.local.json');
  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    // Check enabledMcpjsonServers array for tynn
    if (Array.isArray(settings.enabledMcpjsonServers)) {
      return settings.enabledMcpjsonServers.some(
        (s: string) => s.toLowerCase().includes('tynn')
      );
    }
    // Check mcpServers object for tynn key
    if (settings.mcpServers && typeof settings.mcpServers === 'object') {
      return Object.keys(settings.mcpServers).some(
        k => k.toLowerCase().includes('tynn')
      );
    }
    return false;
  } catch {
    return false;
  }
}

export type DetectedIntegration = 'tynn' | 'noop';

/**
 * Detect which integration to use based on project environment.
 *
 * Priority: Tynn > NoOp
 */
export function detectIntegration(cwd?: string): { type: DetectedIntegration; integration: ProjectIntegration } {
  const dir = cwd || process.cwd();

  if (hasTynnMcp(dir)) {
    return { type: 'tynn', integration: new TynnIntegration() };
  }

  return { type: 'noop', integration: getIntegration() };
}

/**
 * Run detection and set the integration singleton.
 * Returns the detected type for logging/display.
 */
export function autoDetectAndSet(cwd?: string): DetectedIntegration {
  const { type, integration } = detectIntegration(cwd);
  if (type !== 'noop') {
    setIntegration(integration);
  }
  return type;
}

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Resolve a state file path based on the active integration.
 * Default: .bots/state/<filename>
 */
export function getStatePath(filename: string): string {
  return path.join(process.cwd(), '.bots', 'state', filename);
}
