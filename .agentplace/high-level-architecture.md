# Agent Template High-Level Architecture

An Agentplace agent is a full-stack TypeScript application consisting of a React frontend (`agent-dev-client`) and a Node.js backend (`agent-dev-server`). The application uses an LLM as its core, where the model dynamically renders UI components in response to user input.

Both client and server rely heavily on `agent-library` — a vendored library providing core agent functionality including content types, state management, tool system, and UI utilities.

---

## Core Concept

The agent operates on a **tool-calling paradigm**: the LLM receives user messages along with a set of available "tools" (UI components and system tools), and responds by invoking these tools with appropriate parameters. The frontend renders tool calls as React components.

The agent supports two communication channels:
- **WebSocket** (browser) — real-time content streaming, RPC commands, type-safe tRPC procedure calls, and live data invalidation signals via a single RpcPeer connection.
- **MCP** (programmatic clients) — Claude Code and other MCP clients connect via Streamable HTTP transport at `/mcp`. The agent is exposed as an MCP server with tools (`askAgent`, `getConversationHistory`, `getAgentInfo`, `createSession`). Content is adapted per channel: reasoning text is filtered, components are serialized to text, and the instruction is augmented with channel context.

---

## Directory Structure Overview

```
agent-dev-client/          # React frontend
├── src/
│   ├── app/
│   │   ├── App.tsx                    # Main app component with routing
│   │   ├── container.ts               # Dependency injection container
│   │   ├── main.tsx                   # React entry point, iframe transport setup
│   │   ├── agent/
│   │   │   ├── components/            # Custom agent UI components
│   │   │   └── shadcdn/               # shadcn/ui component library
│   │   ├── lib/
│   │   │   ├── trpc.ts               # tRPC proxy client (RpcPeer transport)
│   │   │   ├── agent-auth.ts           # Auth facade (preview/published modes)
│   │   │   ├── invalidation-registry.ts # Topic→callback map for live data updates
│   │   │   ├── components/            # Core UI components (Chat, Input, etc.)
│   │   │   ├── messaging/             # MobX state stores
│   │   │   ├── services/              # WebSocket transport, file I/O, logging
│   │   │   ├── hooks/                 # React hooks (useLiveQuery, useServices, etc.)
│   │   │   ├── contexts/              # React contexts
│   │   │   ├── errors/                # Error types
│   │   │   ├── utils/                 # Utility functions
│   │   │   ├── rpc/                   # RPC helpers
│   │   │   └── types/                 # TypeScript type definitions
│   │   └── styles/                    # Theme CSS files
│   ├── lib/
│   │   └── agent-library.ts           # Re-exports from vendored agent-library
├── vendor/                            # Vendored packages (package root, not under src/)
│   ├── agent-library/                 # Browser-safe agent-library subset (UI, types, streaming only)
│   └── agentplace-transport/          # RpcPeer + transport adapters (see below)

agent-dev-server/          # Node.js backend
├── src/
│   ├── app.ts                         # Server bootstrap
│   ├── server.ts                      # Lifecycle shell: HTTP, WebSocket, tRPC wiring
│   ├── container.ts                   # Dependency injection container
│   ├── settings.ts                    # Environment configuration
│   ├── types.ts                       # Shared type definitions
│   ├── instruction.md                 # Default agent instruction prompt
│   ├── http/
│   │   ├── request-handler.ts         # HTTP router — iterates Route[] array
│   │   ├── static-files.ts           # Production SPA serving
│   │   ├── middleware/
│   │   │   ├── compose.ts            # Handler/Middleware types + compose()
│   │   │   ├── cors.middleware.ts    # CORS headers
│   │   │   └── compression.middleware.ts # Response compression
│   │   └── routes/
│   │       ├── route.ts              # Route interface (matches + handler)
│   │       ├── health.route.ts       # Health check
│   │       ├── conversation-history.route.ts # Conversation history JSON
│   │       ├── mcp.route.ts          # MCP server (Streamable HTTP transport)
│   │       ├── oauth-metadata.route.ts # OAuth protected resource metadata (RFC 9470)
│   │       ├── send-message.route.ts # Fire-and-forget HTTP messaging
│   │       ├── session-snapshot.route.ts # Session state snapshot
│   │       ├── import-session.route.ts # Session state restore
│   │       └── parse-json-body.ts    # JSON body parsing utility
│   ├── trpc/
│   │   ├── init.ts                    # tRPC context, base procedures, callerFactory
│   │   ├── router.ts                  # Root AppRouter (platform + builder routers)
│   │   ├── routers/
│   │   │   └── platform.router.ts     # Platform procedures (settings, transcribe, etc.)
│   │   └── middleware/
│   │       └── action-logging.ts      # Auto-logs mutations + auto-invalidates topics
│   ├── ws/
│   │   ├── websocket-handler.ts       # WebSocket + RpcPeer handler (incl. tRPC dispatch)
│   │   ├── session-manager.ts         # Session lifecycle with TTL expiry
│   │   ├── agent-session.ts           # Per-session state (clients, content, history)
│   │   └── message-processor.ts       # Message handling and content streaming
│   ├── bl/
│   │   ├── action-log/                # ActionLog class and formatting
│   │   ├── agent/                     # Agent orchestration and model providers
│   │   ├── messaging/
│   │   │   ├── messaging.service.ts   # Core LLM message processing
│   │   │   ├── prompts.ts             # System prompt construction
│   │   │   ├── tool-registry.factory.ts # Tool registry creation
│   │   │   ├── model-catalog.ts       # Available models catalog
│   │   │   ├── skills-loader.ts       # Loads .agent/skills/ markdown files
│   │   │   └── defaults.ts            # Default model configuration
│   │   └── tools/                     # Tool implementations (filesystem, MCP, etc.)
│   ├── sdk/                           # Session ID utilities
│   ├── context/                       # RequestContext, context storage
│   ├── util/                          # Shared utilities (consume-content-stream, logger, jwt, etc.)
│   ├── services/                      # Storage, audio, instruction, tracing, CDN upload
│   ├── errors/                        # Error types
├── vendor/                            # Vendored packages (package root, not under src/)
│   └── agent-library/                 # Full agent-library vendored copy
```

---

## Frontend Architecture (`agent-dev-client`)

### Entry Point and Initialization

| File | Description |
|------|-------------|
| `src/app/main.tsx` | React entry point. First initializes `messageDispatcher` (runs before React), then `AgentAuth`, builds container, renders `<App />`. Sets up EventSource for hot reload. Initializes iframe transport (`RpcPeer`) for admin-client communication. |
| `src/app/App.tsx` | Root component. Sets up React Router with routes: `/` (ChatRenderer), `/agent/:configurationId/:type` (ChatPreviewRenderer). Imports `registerComponents.tsx`. |
| `src/app/container.ts` | Composition root. Creates MobX stores (`MessagesStore`, `StatusStore`, `MemoryStore`, `SettingsStore`), services (`LoggerService`, `FileReadingService`, `FileUploadService`), connects WebSocket, loads settings via tRPC, wires cross-store reactions. See "Startup Sequence" below. |

### State Management (MobX + tRPC)

MobX stores are the single source of truth for client state. Stores call tRPC for server communication. Components observe stores — they never call tRPC directly.

| Store | Purpose | Data Source |
|-------|---------|-------------|
| `MessagesStore` | Conversation state, message sending, audio transcription | WebSocket content stream + tRPC mutations |
| `SettingsStore` | Agent configuration (model, agentId) | tRPC query at startup |
| `StatusStore` | Activity indicator ("Thinking...", "Calling X tool...") | WebSocket content stream |
| `NotificationStore` | Toast notifications | In-app events |
| `MemoryStore` | Agent memory persistence | `localStorage` (initialized after settings) |

Cross-store coordination uses MobX `reaction()` in `container.ts`. Neither store imports the other.

### Live Data Updates

Builder-generated components use `useLiveQuery(topic, queryFn)` for server data that should auto-refresh. When a tRPC mutation succeeds, `loggedProcedure` calls `ctx.invalidate(topic)` which pushes a `data.invalidate` notification over the WebSocket. The client-side `InvalidationRegistry` routes the notification to all `useLiveQuery` hooks subscribed to that topic, triggering a refetch.

| File | Description |
|------|-------------|
| `src/app/lib/invalidation-registry.ts` | `InvalidationRegistry` singleton. In-memory map of `topic → Set<callback>`. `subscribe()` returns unsubscribe function. `notify(topic)` fires callbacks for one topic. `notifyAll()` fires all (used on reconnect). |
| `src/app/lib/hooks/useLiveQuery.ts` | `useLiveQuery(topic, queryFn, deps?)` hook. Fetches on mount, subscribes to `InvalidationRegistry` for auto-refetch. Returns `{ data, isLoading, error, refetch }`. Uses `useState`/`useEffect` internally. |

### tRPC Client

| File | Description |
|------|-------------|
| `src/app/lib/trpc.ts` | Creates a `tRPCProxyClient` typed to the server's `AppRouter`. Uses a custom `rpcPeerLink` that sends procedure calls via `rpcPeer.ask()` over the WebSocket. Exports `setRpcPeer()` for the WebSocket client to bind/unbind the transport. Calls made before the WebSocket connects queue automatically and resolve once the peer is available. |

### Transport

| File | Description |
|------|-------------|
| `src/app/lib/services/websocket-manager.ts` | `wsManager` singleton. Manages WebSocket connection lifecycle, content distribution, message sending. |
| `src/app/lib/services/websocket-client.ts` | `WebSocketClient` class. Low-level WebSocket client with RpcPeer-based protocol, reconnection, content streaming. Calls `setRpcPeer()` on connect/disconnect to wire tRPC transport. Registers component configs with server on connect. Routes `data.invalidate` notifications to `InvalidationRegistry`. Fires `notifyAll()` on reconnect to refetch stale data. |
| `src/app/lib/agent-auth.ts` | `AgentAuth` facade. Manages auth strategy (preview vs published mode), session token, agent session ID. Used for WebSocket auth and file uploads — not for tRPC. |

### agentplace-transport (vendored)

The `vendor/agentplace-transport/` package provides the RpcPeer protocol and multiple transport adapters:

| Adapter | Description |
|---------|-------------|
| `IframeParentAdapter` | For the host/parent window side of iframe communication (dashboard ↔ agent). |
| `IframeChildAdapter` | For the client/child side inside the iframe. |
| `WebSocketAdapter` | WebSocket transport with auto-reconnection for browser clients. |
| `BrowserWebSocketWrapperAdapter` | Wraps an existing browser WebSocket instance. |
| `WebSocketServerAdapter` | Node.js server-side WebSocket adapter. |

The package also defines application-level message types (`application-types/agent-communication.ts`): `AgentMessageSend`, `AgentMessageQuery`, `AgentHealthPing`, `AgentReload`, and their response types.

### Component Registry

| File | Description |
|------|-------------|
| `src/app/lib/components/registry.ts` | `ComponentRegistry` singleton. Stores component configs and React components. Exports `registerComponent()` decorator. Configs are sent to server on WebSocket connect. |
| `src/app/agent/components/registerComponents.tsx` | Import file that triggers registration of all custom components. |
| `src/app/agent/components/*.tsx` | Custom UI components. Each uses `registerComponent(config)`. Components become directly callable tools on the server. |

### Chat UI

| File | Description |
|------|-------------|
| `Chat.tsx` | Main chat container. Orchestrates message sending via `MessagesStore`, renders `ChatView`. |
| `ChatView.tsx` | Renders the conversation. Maps grouped messages to visual components. |
| `Message.tsx` | Renders individual messages. Text → `TextInCardInline`, components → `ComponentRenderer`. |
| `ComponentRenderer.tsx` | Dynamically renders agent components by name using the component registry. |
| `ConversationInput.tsx` | User text input with send button and file attachments. |
| `AgentInput.tsx` | Advanced input component with voice mode support. |

---

## Backend Architecture (`agent-dev-server`)

### Entry Point and Server

| File | Description |
|------|-------------|
| `src/app.ts` | Imports and starts the server. |
| `src/server.ts` | `Server` class. Thin lifecycle shell: creates `http.createServer`, builds the tRPC `appRouter` once at startup, initializes `SessionManager`, hands `appRouter` + `storageFactory` to `createWebSocketHandler`, sets up graceful shutdown. Adding routes or procedures never touches this file. |
| `src/container.ts` | `DependencyContainer` singleton. Initializes: `Settings`, `OpenAIAudioService`, `ModelProviderService`, `AgentFactory`, `AgentStorageFactoryService`, `LangfuseService` (tracing). Exposes `createMessagingService()` and `createInstructionService()` factory methods. |
| `src/settings.ts` | `Settings` class. Loads environment variables, provides `getSecret()` and `getBooleanSecret()` accessors. |

### HTTP Layer

A raw `node:http` server with a composed middleware pipeline. No Express. HTTP is used for routes that don't fit WebSocket (health probes, external callers, MCP protocol).

All routes implement the `Route` interface (`matches(method, url)` + `handler`). The request handler iterates a `Route[]` array — adding a new route means creating a file in `routes/` and appending one line to the array. No dispatch logic to modify.

| File | Description |
|------|-------------|
| `src/http/request-handler.ts` | `createRequestHandler(deps)` — factory returning a `(req, res)` handler. Applies middleware pipeline, iterates `Route[]` for dispatch. |
| `src/http/routes/route.ts` | `Route` interface: `{ matches(method, url): boolean; handler: Handler }`. |
| `src/http/middleware/compose.ts` | `Handler`/`Middleware` types and `compose()` utility for chaining middleware right-to-left. |
| `src/http/middleware/cors.middleware.ts` | CORS headers. Handles OPTIONS preflight. Exposes `mcp-session-id` for MCP clients. |
| `src/http/middleware/compression.middleware.ts` | Response compression via `compression` npm package. |
| `src/http/routes/health.route.ts` | Health check at `/health` and `/api/health`. Used by load balancers and agent-control-server. |
| `src/http/routes/conversation-history.route.ts` | Conversation history JSON. Called by agent-control-server (no WebSocket client). |
| `src/http/routes/mcp.route.ts` | MCP server route. Exposes the agent as an MCP server via Streamable HTTP transport. See "MCP Layer" below. |
| `src/http/routes/oauth-metadata.route.ts` | OAuth Protected Resource Metadata (RFC 9470). Points MCP clients to the platform's authorization server. |
| `src/http/routes/send-message.route.ts` | HTTP POST `/api/send-message`. Fire-and-forget messaging API. Accepts `{session_id?, message}`, returns 202 with `{sessionKey, responseId, accepted}`. Processes in background. |
| `src/http/routes/session-snapshot.route.ts` | HTTP GET `/api/session-snapshot?session_id=...`. Returns session state: `{sessionKey, conversationHistory, storedContents, snapshotTimestamp}`. |
| `src/http/routes/import-session.route.ts` | HTTP POST `/api/import-session`. Restores session state from `{session_id, conversationHistory, storedContents?}`. Broadcasts `session.imported` event. |
| `src/http/routes/parse-json-body.ts` | Utility — parses HTTP request body as JSON with 20 MB size limit. Used by send-message and import-session routes. |
| `src/http/static-files.ts` | Production SPA serving with MIME types and `index.html` fallback. |

### tRPC Layer

Type-safe procedure calls invoked over WebSocket via `createCallerFactory`. No HTTP tRPC endpoint.

| File | Description |
|------|-------------|
| `src/trpc/init.ts` | tRPC initialization. Defines `TRPCContext` (storage, actionLog, sessionKey, invalidate). Exports `createRouter`, `publicProcedure`, `createCallerFactory`, and transport-agnostic `createTRPCContext()`. `invalidate(topic)` pushes a `data.invalidate` notification to all session clients via `session.broadcast()`. |
| `src/trpc/router.ts` | Root `appRouter`. Merges platform router with builder-generated routers. Exports `AppRouter` type used by the client for end-to-end type inference. |
| `src/trpc/routers/platform.router.ts` | Platform procedures: `health`, `settings`, `instruction`, `conversationHistory`, `transcribe`, `textToVoice`. |
| `src/trpc/middleware/action-logging.ts` | `loggedProcedure` middleware. Auto-logs mutations to the session's ActionLog and auto-invalidates the router's topic via `ctx.invalidate()`. Builders return `{ logSummary }` for logging and optionally `{ invalidateTopics }` to override/suppress invalidation. Internal fields are stripped from the response. |

### WebSocket Layer

All real-time communication uses RpcPeer over a single WebSocket at `/ws`. The handler dispatches by `method` field in incoming messages.

| File | Description |
|------|-------------|
| `src/ws/websocket-handler.ts` | `createWebSocketHandler()`. Manages WebSocket server. Routes RPC messages: `message.send`, `message.abort`, `content.resume`, `session.info`, `components.register`, and `trpc` (procedure calls via caller factory). |
| `src/ws/session-manager.ts` | `SessionManager`. Manages `AgentSession` instances with TTL-based expiry. `getOrCreate()`, periodic cleanup, stats. |
| `src/ws/agent-session.ts` | `AgentSession`. Per-session state: connected clients, content ring buffer, conversation history, message queue, component configs, action log. |
| `src/ws/message-processor.ts` | `MessageProcessor`. Processes `message.send` requests. Creates `MessagingService`, streams `AgentContent` to session clients. Handles queued messages. |

### MCP Layer

The agent is accessible as an MCP server at `/mcp` via `@modelcontextprotocol/sdk` Streamable HTTP transport. MCP clients (Claude Code, Cursor, etc.) connect using standard MCP protocol with OAuth 2.0 authentication.

| Tool | Purpose |
|------|---------|
| `askAgent` | Send a message to the agent and get a response. Uses the same `MessagingService.sendMessage()` pipeline as WebSocket. |
| `getConversationHistory` | Retrieve conversation history for a session. |
| `getAgentInfo` | Return agent metadata (configId, instruction preview). |
| `createSession` | Create a new conversation session, returns session ID. |

**Channel-aware content adaptation** — the MCP route adapts the agent's output for text-only clients:
- **Instruction augmentation**: A `[Channel: MCP]` suffix is appended to the system instruction, telling the agent to respond in plain text only.
- **Reasoning filtering**: `TextContent` with `isReasoning: true` (chain-of-thought) is excluded from the MCP tool result (still stored in session for history continuity).
- **Component serialization**: `ComponentContent` is serialized to a text description (`[Component: Name]\n{props}`) since MCP clients cannot render React components.

Each MCP session gets its own `StreamableHTTPServerTransport` instance, tracked by session ID in a `Map`. The `askAgent` tool is request-response — it accumulates the full response from the `AgentContent` stream before returning.

### Messaging Layer (Server-side LLM Processing)

| File | Description |
|------|-------------|
| `src/bl/messaging/messaging.service.ts` | `MessagingService` class. Core message processing. Uses `AgentFactory.create()` to instantiate agents. Configures agent with `ToolRegistry`, processors, middlewares. Returns `AgentContent` stream. |
| `src/bl/messaging/prompts.ts` | `createRealtimePrompt()` builds system prompt with instruction, rendered messages, memories, and rules. |
| `src/bl/messaging/tool-registry.factory.ts` | `ToolRegistryFactory`. Creates `ToolRegistry` with all tools: filesystem, voice, memory, web search (Anthropic, xAI, xAI X), image generation (NanoBanana), MCP tools. Dynamically creates `ComponentToolModel` from client-registered configs. |
| `src/bl/messaging/model-catalog.ts` | `MODEL_CATALOG` mapping model IDs to provider info (GPT, Claude, Grok, Gemini). |
| `src/bl/messaging/skills-loader.ts` | Loads markdown skill files from `.agent/skills/` directory. Parses YAML frontmatter (name, description, autoload). Auto-loaded skills are included in the system prompt; others listed for on-demand use. |
| `src/util/consume-content-stream.ts` | Shared async `AgentContent` stream consumer used by both WebSocket `MessageProcessor` and HTTP `send-message` route. Handles dedup of `StateUpdate` events, broadcasts to clients, stores content. |

### Action Log

| File | Description |
|------|-------------|
| `src/bl/action-log/action-log.ts` | `ActionLog` class. Append-only log of user-facing mutations per session. Flushed into model context before each agent turn. |
| `src/bl/action-log/format-action-log-block.ts` | Renders action log entries as XML for model context. |

### Tool System

| File | Description |
|------|-------------|
| `src/bl/tools/tool.registry.ts` | `ToolRegistry`. Extends agent-library's `ToolRegistry` with batch registration. |
| `src/bl/tools/impl/` | Tool implementations: `FilesystemTool`, `PlayVoiceAssistanceTool`, `PersistToMemoryBankTool`, `WebSearchToolModel`, `NanoBananaToolModel` (Gemini 2.5 Flash image gen via OpenRouter + CDN upload), `AnthropicWebSearchTool` (provider-native), `XaiWebSearchTool`, `XaiXSearchTool` (X/Twitter search), `RetrievePreviewMessagesTool`, MCP tools. |
| `src/bl/tools/mcp-server.registry.ts` | `MCPServerRegistry`. Loads MCP server configs from `.agent/mcp.json`. |

UI component tools are dynamically created from client-registered component configs using `ComponentToolModel`. The agent calls these tools by name (e.g., `Image({ src: '...' })`), and the server returns `ComponentContent` for client rendering.

### Storage and Services

| File | Description |
|------|-------------|
| `src/services/agent-storage-factory.service.ts` | `AgentStorageFactoryService`. Factory for `AgentStorage` instances with `AgentPlaceApiAdapter` (API) and `LocalFileSystemAdapter` (`.agent/` directory). |
| `src/services/llm/openai-audio.ts` | `OpenAIAudioService`. Speech-to-text and text-to-speech via OpenAI gateway. |
| `src/services/instruction.service.ts` | Reads the agent's instruction prompt file. |
| `src/services/langfuse.ts` | `LangfuseService`. Tracing/telemetry client wrapper. Provides `trace()`, `span()`, `generation()`, `flush()`. Configured in container's `configureTracing()`. |
| `src/services/public-cdn-upload.service.ts` | `PublicCdnUploadService`. Uploads buffers to platform storage API, returns public CDN URLs. Used by `NanoBananaToolModel`. |
| `src/services/event-bus.ts` | `EventBus`. Node `EventEmitter` wrapper for internal event pub/sub. |
| `src/sdk/session-id.ts` | Session ID generation and extraction from request headers. |

---

## Data Flow

### Message Flow (WebSocket)

```
1. User types message in ConversationInput
   ↓
2. Chat.handleSendMessage() → MessagesStore.sendMessage()
   ↓
3. MessagesStore calls wsManager.sendMessage()
   ↓
4. WebSocketClient sends RpcPeer 'message.send' to /ws
   ↓
5. WebSocketHandler routes to MessageProcessor.handleMessageSend()
   ↓
6. MessageProcessor creates MessagingService, broadcasts user message as content (server echo)
   ↓
7. MessagingService.sendMessage():
   - Builds prompt with createRealtimePrompt()
   - Creates ToolRegistry via ToolRegistryFactory
   - Creates Agent via AgentFactory.create()
   ↓
8. Agent.runHandle() starts tool loop via ToolLoopAgentRunner
   ↓
9. Agent streams AgentContent (text, components, tools)
   ↓
10. MessageProcessor broadcasts each AgentContent to session clients via RpcPeer.notify()
    Stores final states in content ring buffer
   ↓
11. WebSocketClient receives 'content' notifications
   ↓
12. wsManager distributes to content handlers → MessagesStore.processContent()
   ↓
13. MessagesStore updates AgentConversation → MobX observers trigger re-render
   ↓
14. ChatView renders messages:
    - ComponentContent → ComponentRenderer (registry lookup)
    - TextContent → TextInCardInline (markdown)
```

### Message Flow (MCP)

```
1. MCP client sends JSON-RPC tools/call to POST /mcp
   (Authorization: Bearer <jwt>, Mcp-Session-Id: <id>)
   ↓
2. StreamableHTTPServerTransport dispatches to McpServer
   ↓
3. askAgent tool handler:
   - sessionManager.getOrCreate(sessionKey, { userId, configId })
   - Augments instruction with [Channel: MCP] suffix
   - container.createMessagingService()
   - messagingService.sendMessage({ configId, message, instruction, conversationHistory })
   ↓
4. Agent streams AgentContent (same pipeline as WebSocket)
   ↓
5. MCP route consumes stream with channel adaptation:
   - TextContent (isReasoning: true) → skipped
   - TextContent (isReasoning: false) → accumulated
   - ComponentContent → serialized to text fallback
   - ToolContent (StateUpdate) → updates session history
   ↓
6. Accumulated text returned as MCP tool result
   ← {"jsonrpc": "2.0", "result": {"content": [{"type": "text", "text": "..."}]}}
```

### tRPC Call Flow (over WebSocket)

```
1. MobX store calls trpc.platform.settings.query()
   ↓
2. rpcPeerLink sends via rpcPeer.ask({ method: 'trpc', path: 'platform.settings', type: 'query' })
   ↓
3. WebSocket handler case 'trpc':
   - Creates TRPCContext from session (sessionKey, actionLog, storageFactory)
   - createCallerFactory(appRouter)(ctx)
   - Traverses caller by path → invokes procedure
   ↓
4. Result returned as RpcPeer RES packet → resolves client-side Promise
```

### Live Data Update Flow

```
1. Component mounts with useLiveQuery('drafts', () => trpc.drafts.list.query())
   → queryFn called → tRPC over WS → server computes view → response
   → Component renders with data
   ↓
2. User triggers mutation: trpc.drafts.create.mutate({ title })
   → tRPC over WS → server executes mutation
   ↓
3. loggedProcedure middleware (post-success):
   → Logs to ActionLog
   → Calls ctx.invalidate('drafts') (router name)
   → session.broadcast({ method: 'data.invalidate', params: { topic: 'drafts' } })
   ↓
4. WebSocketClient receives 'data.invalidate' notification
   → invalidationRegistry.notify('drafts')
   ↓
5. useLiveQuery callback fires → re-calls queryFn
   → tRPC over WS → server recomputes view → fresh data
   → Component re-renders
```

On WebSocket reconnect, `invalidationRegistry.notifyAll()` fires to refetch all mounted queries (data may have changed while disconnected).

### Component Registration Flow

```
1. App.tsx imports registerComponents.tsx → each component calls registerComponent(config)
   ↓
2. ComponentRegistry stores config and React component by name
   ↓
3. WebSocketClient connects → sends 'components.register' with all configs
   ↓
4. AgentSession stores configs for dynamic tool creation
   ↓
5. On message, ToolRegistryFactory creates ComponentToolModel for each config
   ↓
6. Agent calls component tool by name → returns ComponentContent
   ↓
7. Client renders via ComponentRenderer using registry lookup
```

### Session Lifecycle

```
1. Client connects to /ws with agent_session_id (gateway cookie/bearer handles auth)
   ↓
2. WebSocketHandler extracts session identity from gateway-injected headers
   ↓
3. SessionManager.getOrCreate() returns or creates AgentSession
   ↓
4. RpcPeer created → setRpcPeer() enables tRPC transport
   ↓
5. Client registers components, tRPC calls become available
   ↓
6. AgentSession tracks: clients, content ring buffer, conversation history, component configs
   ↓
7. On reconnect, content.resume returns stored content entries for rehydration
   ↓
8. SessionManager periodically cleans up expired sessions
```

### Startup Sequence

```
0. messageDispatcher.initialize() — runs first, before React imports
1. AgentAuth.init()             — resolve auth strategy (preview vs published)
2. buildContainer()
   2a. Create MobX stores     — observables initialized with defaults
   2b. Create services         — LoggerService, FileReadingService, FileUploadService
   2c. Wire cross-store deps   — reaction() subscriptions
   2d. wsManager.connect()     — WebSocket connects, setRpcPeer() called
   2e. settingsStore.load()    — tRPC query over WebSocket, store updated
3. root.render(<App />)        — React tree mounts, observers subscribe
4. useChatRehydration effect   — initializeSession(), content stream begins
```

---

## Agent Library (`agent-library`)

The vendored `agent-library` provides core functionality used by both client and server.

### Core Classes

| Export | Description |
|--------|-------------|
| `Agent` | Main agent class. Manages state, runs tool loops. |
| `AgentState` | Holds conversation history, turn requests, custom app state. |
| `AgentFactory` | Factory for creating Agent instances with configured runner, presenter, policies. |
| `ToolLoopAgentRunner` | Default runner. Executes tool loop until stop condition. |
| `DefaultPresenter` | Converts kernel events to AgentContent stream. |

### Content Types

| Export | Description |
|--------|-------------|
| `ContentType` | Enum: `Text`, `Audio`, `Tool`, `Component`. |
| `AgentContent` | Base content type with `messageId`, `type`. |
| `TextContent` | Text content with `content` string, optional `role`. |
| `ComponentContent` | Component with `componentName`, `props`, optional `streaming` state. |
| `ToolContent` | Tool result with `tool` info and `content` output. |

### Tool System

| Export | Description |
|--------|-------------|
| `ToolModel` | Base class for tools. Defines `execute()`, `getName()`, `getDescription()`, `getParameters()`. |
| `ToolRegistry` | Manages tool registration and lookup. |
| `ComponentToolModel` | Tool that renders UI components from registered configs. |

### Policies & Processors

| Export | Description |
|--------|-------------|
| `defaultPolicies` | Default stop, retry, checkpoint, turn policies. |
| `SystemPromptProcessor` | Injects system prompt into turns. |
| `TurnInputProcessor` | Processes turn input with user query. |
| `CacheStrategyMiddleware` | Applies prompt caching strategies per provider. |

### Storage System

| Export | Description |
|--------|-------------|
| `AgentStorage` | Multi-adapter storage with caching. |
| `AgentPlaceApiAdapter` | API-based storage adapter. |
| `LocalFileSystemAdapter` | Local filesystem adapter. |

---

## Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS v4, MobX, React Router, shadcn/ui, framer-motion, recharts, react-markdown
- **Backend**: Node.js (`node:http`), TypeScript, tRPC v11, AI SDK v6, Zod, `@modelcontextprotocol/sdk`, Langfuse (tracing), ws, sirv
- **File Processing**: mammoth (docx), pdf-parse, read-excel-file
- **Transport**: WebSocket with RpcPeer protocol (browser), MCP Streamable HTTP (programmatic clients)
- **Type Safety**: tRPC — end-to-end types from server router to client proxy, zero codegen
- **Agent Runtime**: agent-library (vendored), ToolLoopAgentRunner
- **Build**: ESBuild (client and server)
- **Model Provider**: Agentplace gateway (AI SDK compatible)
- **Storage**: AgentStorage with AgentPlaceApiAdapter, LocalFileSystemAdapter
