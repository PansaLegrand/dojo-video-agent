import type { Skill } from "./skills";

// Host-local provenance only. Do not add fields to Skill: retained checkpoints
// hash its serialized bytes, and new runs already persist plain skill snapshots.
const localPacks = new WeakSet<Skill>();

export function markLocalSkillPack(skill: Skill): Skill {
  localPacks.add(skill);
  return skill;
}

export function isLocalSkillPack(skill: Skill): boolean {
  return localPacks.has(skill);
}
