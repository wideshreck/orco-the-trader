import { echo } from './builtin/echo.js';
import { getTime } from './builtin/get-time.js';
import { buildSkillTool } from './builtin/skill.js';
import { register } from './registry.js';

let bootstrapped = false;

export function bootstrapTools(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(getTime);
  register(echo);
  const skillTool = buildSkillTool();
  if (skillTool) register(skillTool);
}

export {
  forgetAlwaysAllowed,
  isAlwaysAllowed,
  listAlwaysAllowed,
  setAlwaysAllowed,
} from './approvals.js';
export { defineTool } from './define.js';
export { buildAiSdkTools, get, listActive, listAll } from './registry.js';
export type {
  ApprovalDecision,
  ApprovalRequest,
  Approver,
  OrcoTool,
  Permission,
  StreamEvent,
  TokenUsage,
  ToolContext,
} from './types.js';
