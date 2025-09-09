import {
  createEffect,
  createMemo,
  For,
  Match,
  Show,
  Switch,
  type Component,
} from "solid-js"
import { Dynamic } from "solid-js/web"
import path from "path"
import { useRouteData } from "./context/route"
import { useSync } from "./context/sync"
import { SplitBorder } from "./component/border"
import { Theme } from "./context/theme"
import { bold, fg } from "@opentui/core"
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
import type { Tool } from "../../../tool/tool"

import type { ReadTool } from "../../../tool/read"
import type { WriteTool } from "../../../tool/write"
import { BashTool } from "../../../tool/bash"
import type { GlobTool } from "../../../tool/glob"
import { Instance } from "../../../project/instance"
import { TodoWriteTool } from "../../../tool/todo"
import type { GrepTool } from "../../../tool/grep"
import type { ListTool } from "../../../tool/ls"
import type { EditTool } from "../../../tool/edit"
import type { PatchTool } from "../../../tool/patch"
import type { WebFetchTool } from "../../../tool/webfetch"
import type { TaskTool } from "../../../tool/task"

export function Session() {
  const route = useRouteData("session")
  const sync = useSync()
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
    <For each={props.parts}>
      {(part) => {
        const component = createMemo(
          () => PART_MAPPING[part.type as keyof typeof PART_MAPPING],
        )
        return (
          <Show when={component()}>
            <Dynamic
              component={component()}
              part={part as any}
              message={props.message}
            />
          </Show>
        )
      }}
    </For>
  )
}

const PART_MAPPING = {
  text: TextPart,
  tool: ToolPart,
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

// Pending messages moved to individual tool pending functions

function ToolPart(props: { part: ToolPart; message: AssistantMessage }) {
  props.part.state.status

  const component = createMemo(() => {
    if (props.part.state.status === "pending") {
      const pending = ToolRegistry.pending(props.part.tool)
      if (!pending) return
      return pending({})
    }

    const ready = ToolRegistry.ready(props.part.tool)
    if (!ready) return
    return ready({
      input: props.part.state.input,
      metadata: props.part.state.metadata,
      output:
        props.part.state.status === "completed"
          ? props.part.state.output
          : undefined,
    })
  })

  return (
    <Show when={component()}>
      <box {...SplitBorder} borderColor={Theme.backgroundPanel}>
        <box
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          backgroundColor={Theme.backgroundPanel}
          gap={1}
        >
          {component()}
        </box>
      </box>
    </Show>
  )
}

type ToolProps<T extends Tool.Info> = {
  input: Tool.InferParameters<T>
  metadata?: Tool.InferMetadata<T>
  output?: string
}

const ToolRegistry = (() => {
  const state: Record<string, ReturnType<typeof register>> = {}
  function register<T extends Tool.Info>(input: {
    name: string
    pending?: Component
    ready?: Component<ToolProps<T>>
  }) {
    state[input.name] = input
    return input
  }
  return {
    register,
    pending(name: string) {
      return state[name]?.pending
    },
    ready(name: string) {
      return state[name]?.ready
    },
  }
})()

ToolRegistry.register<typeof BashTool>({
  name: "bash",
  pending: () => "Writing command...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>Shell {props.input["description"]}</text>
        <box>
          <text>$ {props.input["command"]}</text>
          <text>{props.output?.trim()}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof ReadTool>({
  name: "read",
  pending: () => "Reading file...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>Read {props.input["filePath"]}</text>
        <box>
          <text>{props.metadata?.preview || ""}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof WriteTool>({
  name: "write",
  pending: () => "Preparing write...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>Wrote {props.input.filePath}</text>
        <box>
          <text>{props.input.content || ""}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof GlobTool>({
  name: "glob",
  pending: () => "Finding files...",
  ready(props) {
    const files = createMemo(() => {
      const result = props.output?.split("\n").filter((x) => x) ?? []
      return result
        .map((file) => path.relative(Instance.directory, file))
        .join("\n")
    })
    return (
      <>
        <text fg={Theme.textMuted}>Glob {(props.input as any).pattern}</text>
        <box>
          <text>{files()}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof GrepTool>({
  name: "grep",
  pending: () => "Searching content...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>Grep {(props.input as any).pattern}</text>
        <box>
          <text>{props.output?.trim()}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof ListTool>({
  name: "list",
  pending: () => "Listing directory...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>
          List {(props.input as any).path || "."}
        </text>
        <box>
          <text>{props.output?.trim()}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof TaskTool>({
  name: "task",
  pending: () => "Delegating...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>
          Task {(props.input as any).description}
        </text>
        <box>
          <text>{props.output?.trim()}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof WebFetchTool>({
  name: "webfetch",
  pending: () => "Fetching from the web...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>WebFetch {(props.input as any).url}</text>
        <box>
          <text>{props.output?.trim()}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof EditTool>({
  name: "edit",
  pending: () => "Preparing edit...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>Edit {(props.input as any).filePath}</text>
        <box>
          <text>{props.metadata?.diff || ""}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof PatchTool>({
  name: "patch",
  pending: () => "Preparing patch...",
  ready(props) {
    return (
      <>
        <text fg={Theme.textMuted}>Patch</text>
        <box>
          <text>{props.output?.trim()}</text>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof TodoWriteTool>({
  name: "todowrite",
  pending: () => "Planning...",
})
