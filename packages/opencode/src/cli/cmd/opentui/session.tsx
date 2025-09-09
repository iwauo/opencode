import { createEffect, createMemo, For, Match, Show, Switch } from "solid-js"
import { useRouteData } from "./context/route"
import { useSync } from "./context/sync"
import { SplitBorder } from "./component/border"
import { Theme } from "./context/theme"
import { bold, fg, ScrollBoxRenderable, SyntaxStyle } from "@opentui/core"
import { Prompt } from "./component/prompt"
import type {
  AssistantMessage,
  Part,
  ToolPart,
  UserMessage,
} from "@opencode-ai/sdk"
import type { TextPart } from "ai"
import { useLocal } from "./context/local"
import { Locale } from "../../../util/locale"
import { RGBA, hastToStyledText } from "@opentui/core"
import highlight from "tree-sitter-highlight"
import type { Tool } from "../../../tool/tool"

import type { ReadTool } from "../../../tool/read"
import type { WriteTool } from "../../../tool/write"
import { BashTool } from "../../../tool/bash"

export function Session() {
  const route = useRouteData("session")
  const sync = useSync()
  let scroll: ScrollBoxRenderable
  const session = createMemo(() => sync.session.get(route.sessionID)!)
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const todo = createMemo(() => sync.data.todo[route.sessionID] ?? [])
  createEffect(() => console.log(todo()))

  createEffect(() => sync.session.sync(route.sessionID))

  return (
    <box
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      flexGrow={1}
      maxHeight="100%"
    >
      <Show when={session()}>
        <box
          paddingLeft={1}
          paddingRight={1}
          {...SplitBorder}
          borderColor={Theme.backgroundElement}
        >
          <text>
            {bold(fg(Theme.accent)("#"))} {bold(session().title)}
          </text>
          <box flexDirection="row">
            <Switch>
              <Match when={session().share?.url}>
                <text fg={Theme.textMuted}>{session().share!.url}</text>
              </Match>
              <Match when={true}>
                <text>
                  /share {fg(Theme.textMuted)("to create a shareable link")}
                </text>
              </Match>
            </Switch>
          </box>
        </box>
        <scrollbox
          ref={(r: any) => {
            scroll = r
          }}
          scrollbarOptions={{ visible: false }}
          paddingTop={1}
          paddingBottom={1}
          contentOptions={{
            flexGrow: 1,
            gap: 1,
          }}
        >
          <For each={messages()}>
            {(message) => (
              <Switch>
                <Match when={message.role === "user"}>
                  <UserMessage
                    message={message as UserMessage}
                    parts={sync.data.part[message.id] ?? []}
                  />
                </Match>
                <Match when={message.role === "assistant"}>
                  <AssistantMessage
                    message={message as AssistantMessage}
                    parts={sync.data.part[message.id] ?? []}
                  />
                </Match>
              </Switch>
            )}
          </For>
        </scrollbox>
        <Show when={todo().length > 0}>
          <box paddingBottom={1}>
            <For each={todo()}>
              {(todo) => (
                <text
                  fg={
                    todo.status === "in_progress"
                      ? Theme.success
                      : Theme.textMuted
                  }
                >
                  [{todo.status === "completed" ? "✓" : " "}] {todo.content}
                </text>
              )}
            </For>
          </box>
        </Show>
        <box flexShrink={0}>
          <Prompt sessionID={route.sessionID} />
        </box>
      </Show>
    </box>
  )
}

function UserMessage(props: { message: UserMessage; parts: Part[] }) {
  const text = createMemo(
    () =>
      props.parts.flatMap((x) =>
        x.type === "text" && !x.synthetic ? [x] : [],
      )[0],
  )
  const sync = useSync()
  return (
    <box
      id={text()?.id}
      border={["left"]}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      backgroundColor={Theme.backgroundPanel}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={Theme.secondary}
    >
      <text>{text()?.text}</text>
      <text>
        {sync.data.config.username ?? "You"}{" "}
        {fg(Theme.textMuted)(
          "(" + Locale.time(props.message.time.created) + ")",
        )}
      </text>
    </box>
  )
}

function AssistantMessage(props: { message: AssistantMessage; parts: Part[] }) {
  return (
    <For
      each={props.parts.filter(
        (x) => !["step-start", "step-finish"].includes(x.type),
      )}
    >
      {(part) => (
        <box id={part.id}>
          <Switch>
            <Match when={part.type === "text"}>
              <TextPart part={part as TextPart} message={props.message} />
            </Match>
            <Match when={part.type === "tool"}>
              <ToolPart part={part as ToolPart} message={props.message} />
            </Match>
          </Switch>
        </box>
      )}
    </For>
  )
}

function TextPart(props: { part: TextPart; message: AssistantMessage }) {
  const sync = useSync()
  const agent = createMemo(
    () => sync.data.agent.find((x) => x.name === props.message.mode)!,
  )
  const local = useLocal()

  return (
    <box paddingLeft={3}>
      <text>{props.part.text.trim()}</text>
      <text>
        {fg(local.agent.color(agent().name))(Locale.titlecase(agent().name))}{" "}
        {fg(Theme.textMuted)(
          props.message.providerID + "/" + props.message.modelID,
        )}
      </text>
    </box>
  )
}

const PendingCopy: Record<string, string> = {
  task: "Delegating...",
  bash: "Writing command...",
  edit: "Preparing edit...",
  webfetch: "Fetching from the web...",
  glob: "Finding files...",
  grep: "Searching content...",
  list: "Listing directory...",
  read: "Reading file...",
  write: "Preparing write...",
  todowrite: "Planning...",
  patch: "Preparing patch...",
  default: "Working...",
}

function ToolPart(props: { part: ToolPart; message: AssistantMessage }) {
  const toolProps = createMemo(
    (): ToolProps<any> => ({
      input: "input" in props.part.state ? props.part.state.input : ({} as any),
      metadata:
        "metadata" in props.part.state
          ? props.part.state.metadata
          : ({} as any),
      output:
        "output" in props.part.state ? props.part.state.output : undefined,
    }),
  )

  return (
    <box {...SplitBorder} borderColor={Theme.backgroundPanel}>
      <box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        backgroundColor={Theme.backgroundPanel}
        gap={1}
      >
        <Switch>
          <Match when={props.part.state.status === "pending"}>
            {PendingCopy[props.part.tool] ?? PendingCopy["default"]}
          </Match>
          <Match when={true}>
            <Switch>
              <Match when={props.part.tool === "bash"}>
                <BashToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "read"}>
                <ReadToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "write"}>
                <WriteToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "glob"}>
                <GlobToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "grep"}>
                <GrepToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "list"}>
                <ListToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "task"}>
                <TaskToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "webfetch"}>
                <WebFetchToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "edit"}>
                <EditToolPart {...(toolProps() as any)} />
              </Match>
              <Match when={props.part.tool === "patch"}>
                <PatchToolPart {...(toolProps() as any)} />
              </Match>
            </Switch>
          </Match>
        </Switch>
      </box>
    </box>
  )
}

type ToolProps<T extends Tool.Info> = {
  input: Tool.InferParameters<T>
  metadata: Tool.InferMetadata<T>
  output?: string
}

function BashToolPart(props: ToolProps<typeof BashTool>) {
  return (
    <>
      <text fg={Theme.textMuted}>Shell {props.input["description"]}</text>
      <box>
        <text>$ {props.input["command"]}</text>
        <text>{props.output?.trim()}</text>
      </box>
    </>
  )
}

const syntax = new SyntaxStyle({
  keyword: { fg: RGBA.fromHex(Theme.syntaxKeyword), bold: true },
  string: { fg: RGBA.fromHex(Theme.syntaxString) },
  comment: { fg: RGBA.fromHex(Theme.syntaxComment), italic: true },
  number: { fg: RGBA.fromHex(Theme.syntaxNumber) },
  function: { fg: RGBA.fromHex(Theme.syntaxFunction) },
  type: { fg: RGBA.fromHex(Theme.syntaxType) },
  operator: { fg: RGBA.fromHex(Theme.syntaxOperator) },
  variable: { fg: RGBA.fromHex(Theme.syntaxVariable) },
  bracket: { fg: RGBA.fromHex(Theme.syntaxPunctuation) },
  punctuation: { fg: RGBA.fromHex(Theme.syntaxPunctuation) },
  default: { fg: RGBA.fromHex(Theme.syntaxVariable) },
})

function ReadToolPart(props: ToolProps<typeof ReadTool>) {
  const hast = createMemo(() => {
    const text = props.metadata.preview
      ? highlight.highlightHast(props.metadata.preview, highlight.Language.TS)
      : ""
    const styled = hastToStyledText(text as any, syntax)
    return styled
  })
  return (
    <>
      <text fg={Theme.textMuted}>Read {props.input["filePath"]}</text>
      <box>
        <text>{hast()}</text>
      </box>
    </>
  )
}

function WriteToolPart(props: ToolProps<typeof WriteTool>) {
  const hast = createMemo(() =>
    props.input.content
      ? highlight.highlightHast(props.input.content, highlight.Language.TS)
      : "",
  )
  return (
    <>
      <text fg={Theme.textMuted}>Wrote {props.input.filePath}</text>
      <box>
        <text>{hastToStyledText(hast() as any, syntax)}</text>
      </box>
    </>
  )
}

function GlobToolPart(props: ToolProps<Tool.Info>) {
  return (
    <>
      <text fg={Theme.textMuted}>Glob {(props.input as any).pattern}</text>
      <box>
        <text>{props.output?.trim()}</text>
      </box>
    </>
  )
}

function GrepToolPart(props: ToolProps<Tool.Info>) {
  return (
    <>
      <text fg={Theme.textMuted}>Grep {(props.input as any).pattern}</text>
      <box>
        <text>{props.output?.trim()}</text>
      </box>
    </>
  )
}

function ListToolPart(props: ToolProps<Tool.Info>) {
  return (
    <>
      <text fg={Theme.textMuted}>List {(props.input as any).path || "."}</text>
      <box>
        <text>{props.output?.trim()}</text>
      </box>
    </>
  )
}

function TaskToolPart(props: ToolProps<Tool.Info>) {
  return (
    <>
      <text fg={Theme.textMuted}>Task {(props.input as any).description}</text>
      <box>
        <text>{props.output?.trim()}</text>
      </box>
    </>
  )
}

function WebFetchToolPart(props: ToolProps<Tool.Info>) {
  return (
    <>
      <text fg={Theme.textMuted}>WebFetch {(props.input as any).url}</text>
      <box>
        <text>{props.output?.trim()}</text>
      </box>
    </>
  )
}

function EditToolPart(props: ToolProps<Tool.Info>) {
  return (
    <>
      <text fg={Theme.textMuted}>Edit {(props.input as any).filePath}</text>
      <box>
        <text>{(props.metadata as any).diff}</text>
        <text>{props.output?.trim()}</text>
      </box>
    </>
  )
}

function PatchToolPart(props: ToolProps<Tool.Info>) {
  return (
    <>
      <text fg={Theme.textMuted}>Patch</text>
      <box>
        <text>{props.output?.trim()}</text>
      </box>
    </>
  )
}
