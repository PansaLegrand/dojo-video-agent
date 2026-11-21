# Edit an existing local project from another agent

The local editor exposes an opt-in stdio MCP bridge. It uses the same document, native review, source-bound preview requests, revision guards and Undo history as the browser. The connected client owns its model usage; these tools do not start the editor's internal model or an ASR/generation job.

Start the local editor with external-agent access enabled:

```sh
DOJO_MCP=1 npm run dev -- --no-open
```

For clients that accept `mcpServers` JSON, configure the bridge as follows. Other clients can use the same command, arguments and environment in their MCP settings:

```json
{
  "mcpServers": {
    "dojo": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/dojo-video-agent", "run", "--silent", "mcp"],
      "env": { "DOJO_MCP_URL": "http://127.0.0.1:4310" }
    }
  }
}
```

Use `--silent`: stdout is reserved for MCP messages. The bridge uses the official [MCP TypeScript SDK stdio transport](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio), supports older MCP clients through the SDK, and only connects to a configured HTTP loopback origin. It does not register itself in your agent application or expose a commercial cloud endpoint. Use the actual configured editor port if it differs from 4310.

Open a local project and choose **Copy for Agent**. The control waits for pending manual edits to save, then copies the project ID, exact revision/hash, selection, Brand Kit and local editor URL. Paste that handoff with your instruction into the connected agent. Original media remains in its existing local storage; keep the editor open for preview/export requests.

## Available tools

- `dojo_list_projects`, `dojo_inspect_project`, `dojo_list_assets`
- `dojo_read_caption_cues`, `dojo_read_caption_track`, `dojo_search_transcript`
- `dojo_read_skill`, `dojo_inspect_graphics_schema`
- `dojo_prepare_svg_graphic`, `dojo_prepare_three_scene`, `dojo_prepare_blueprint_graphic`
- `dojo_review_edit`, `dojo_apply_edit`
- `dojo_request_preview`, `dojo_read_preview`, `dojo_read_output`, `dojo_request_export`

Reader arguments use `{projectId, args:{...}}`; `dojo_inspect_project` returns the exact snapshot, installed skill index and authoring guide. Follow reader pagination/coverage rather than treating a page as a complete project. `dojo_read_skill` includes supported reference pictures as MCP image content. Prepared graphics remain unapplied.

`dojo_review_edit` takes an instruction, complete native edit, explicit scope when appropriate, and 1–12 completion requirements. It saves an immutable candidate without changing the timeline. Its requirement schema is shared with the normal toolset, including `item_present` and `property` checks. For example:

```json
{
  "projectId": "<owned UUID>",
  "expectedRevision": 3,
  "documentHash": "sha256:<current hash>",
  "operationId": "unique-review-operation",
  "instruction": "Make the title coral, preserving its text",
  "edit": {
    "outcome": "proposal",
    "summary": "Coral title",
    "commands": [{
      "type": "set",
      "target": {"kind":"node","itemId":"title","nodeId":"title"},
      "path": ["style","color"],
      "value": "#F18F6D"
    }]
  },
  "requirements": [{"id":"title-remains","kind":"item_present","itemId":"title"}]
}
```

Use the returned `reviewId` with `dojo_request_preview`. Supply individual `frames` or `intervalFrames` plus `tileCount` inside `args`. The browser card still requires the user's exact image-analysis approval. A queued request is not a completed inspection; wait for the browser/user, then read its saved receipt. `dojo_apply_edit` takes `projectId`, `reviewId`, `expectedRevision`, `documentHash` and a unique `operationId`. Concurrent manual edits invalidate the reviewed basis: inspect and review again. Repeating the identical accepted review or already-applied candidate does not create a second edit.

Request an export intent through `dojo_request_export` with `args.destination` and `args.output`, then apply the candidate. The existing export card binds to the actual applied revision and performs the approved browser export. `dojo_read_output` reads the saved receipt; a local download is not a cloud publication.

## Verification boundary

The protocol tests exercise a real stdio client and the SDK wire contract. The local application browser proof covers Copy for Agent after an inspector edit, MCP review, browser preview consent and JPEG delivery, exact Apply, browser MP4 export/full decoding, and Undo preserving prior manual text. It uses synthetic provider configuration and verifies zero internal model/ASR calls. External client model quality is a separate qualification concern.
