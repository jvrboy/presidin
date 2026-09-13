// Skill registry — runtime glue for the Skills system used by the chat agent.
// Skills are declared in ./list.ts. The registry provides lookup, filtering by
// enabled state, and keyword-triggered selection.

import { SKILLS, type Skill, type SkillContext, type SkillResult } from "./list";
export type { Skill, SkillContext, SkillResult } from "./list";

const ENABLED_KEY = "diq.chat.skills.enabled.v1";

function readEnabledMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ENABLED_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export function enabledSkills(): Skill[] {
  const map = readEnabledMap();
  return SKILLS.filter((s) => map[s.id] ?? s.defaultEnabled !== false);
}

export function skillsByCategory(): Record<string, Skill[]> {
  return SKILLS.reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});
}

// Match skills whose keywords appear in the user message.
export function matchByKeyword(message: string): Skill[] {
  const m = message.toLowerCase();
  return enabledSkills().filter((s) => {
    if (s.trigger === "always") return true;
    if (s.trigger === "on-demand") return false;
    return (s.keywords || []).some((k) => m.includes(k.toLowerCase()));
  });
}

export async function runSkill(id: string, ctx: SkillContext): Promise<SkillResult> {
  const s = getSkill(id);
  if (!s) return { ok: false, error: `Unknown skill: ${id}` };
  if (!s.exec) {
    return {
      ok: false,
      error: `Skill ${id} has no executor. (Declaration-only — used as context hint for the agent.)`,
    };
  }
  try {
    return await s.exec(ctx);
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
