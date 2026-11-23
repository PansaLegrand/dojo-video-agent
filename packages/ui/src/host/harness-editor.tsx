"use client";
import type { ComponentProps } from "react";
import Editor from "../components/editor/dojo-video-engine/dojo-video-engine-editor";
import { ExternalMediaImportPanel } from "./external-media-import-panel";
import { AgentHandoffButton } from "./agent-handoff-button";
import { MusicJobsPanel } from "./music-jobs-panel";
import { EditingWorkflowPanel } from "./editing-workflow-panel";
/** The product editor stays managed; local provider/job UI is composed at a host boundary. */
export default function HarnessEditor(props: ComponentProps<typeof Editor>) {
  return (
    <Editor
      {...props}
      renderProjectActions={context => <AgentHandoffButton {...context} />}
      renderAgentExtensions={(context) => (
        <>
          <ExternalMediaImportPanel projectId={context.projectId} controller={context.controller} />
          <EditingWorkflowPanel {...context} />
          <MusicJobsPanel
            projectId={context.projectId}
            controller={context.controller}
          />
        </>
      )}
    />
  );
}
