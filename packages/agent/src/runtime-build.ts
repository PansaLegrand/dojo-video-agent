import * as currentKit from "../../agent-kit/src/index";
import * as retainedDerivedKit from "@dojo-video/agent-kit-v28";
import * as retainedV29Kit from "@dojo-video/agent-kit-v29";
import type { AgentProfile } from "../../agent-kit/src/index";
import { isLocalSkillPack } from "./local-skill-origin";

/** A persisted run freezes its kit build as well as its behavior profile. Old
 * local v14 records predate this field and belong to the public 0.2.8 build. */
export function savedAgentKitVersion(run: {
  agentProfile?: AgentProfile;
  agentKitVersion?: string;
}): string {
  const profile = run.agentProfile ?? "local-editor-v1";
  const version =
    run.agentKitVersion ??
    (profile === "local-editor-v14"
      ? "0.2.8"
      : currentKit.profileKitVersion(profile));
  selectAgentKit(profile, version);
  return version;
}
export function selectAgentKit(
  profile: AgentProfile = "local-editor-v1",
  version: string = currentKit.profileKitVersion(profile),
) {
  if (profile === "local-editor-v14" && version === "0.2.8")
    return retainedDerivedKit;
  if (profile === "local-editor-v14" && version === "0.2.9")
    return retainedV29Kit;
  if (version !== currentKit.profileKitVersion(profile))
    throw Error("The saved editing runtime build is unavailable.");
  return currentKit;
}
/** Skill packs added by this candidate must not alter older checkpoint inputs. */
export function skillsForSavedRun(
  run: {
    agentProfile?: AgentProfile;
    agentKitVersion?: string;
    skillSnapshot?: currentKit.Skill[];
  },
  loaded: currentKit.Skill[],
): currentKit.Skill[] {
  if (run.skillSnapshot)
    return run.skillSnapshot.map((skill) => structuredClone(skill));
  const version = savedAgentKitVersion(run);
  return version === "0.2.10"
    ? loaded
    : loaded.filter((skill) => !isLocalSkillPack(skill));
}
export function sourceRequirementValidation(
  profile: AgentProfile = "local-editor-v1",
  version: string = currentKit.profileKitVersion(profile),
): boolean {
  selectAgentKit(profile, version);
  return (
    currentKit.usesDerivedCaptionPlan(profile) &&
    !(profile === "local-editor-v14" && version === "0.2.8")
  );
}
