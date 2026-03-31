# Ollama LMStudio Bridge

A lightweight proxy that wraps **LMStudio** and serves its models through an **Ollama-compatible API**. Any tool that supports Ollama (Open WebUI, AnythingLLM, Continue.dev, etc.) can talk to LMStudio without any changes.

## How it works

```
Ollama client → :11434 (this bridge) → :1234/v1 (LMStudio)
```

This bridge translates all incoming Ollama API calls into OpenAI-compatible calls that LMStudio understands, then maps the responses back into the Ollama format.

## Supported Endpoints

| Ollama Endpoint | Mapped To (LMStudio) | Notes |
|---|---|---|
| `GET /api/tags` | `GET /v1/models` | List available models |
| `POST /api/chat` | `POST /v1/chat/completions` | Streaming & non-streaming |
| `POST /api/generate` | `POST /v1/completions` | Streaming & non-streaming |
| `POST /api/embed` | `POST /v1/embeddings` | Multi-input (new format) |
| `POST /api/embeddings` | `POST /v1/embeddings` | Single prompt (legacy format) |
| `GET /api/version` | Bridge version | Static semver string |
| `GET /api/ps` | `GET /v1/models` | Lists currently loaded models |
| `POST /api/show` | `GET /v1/models` | Shows details for a loaded model |

> **Note**: Model management endpoints (`pull`, `push`, `create`, `delete`, `copy`, `blobs`) return `501 Not Implemented`. LMStudio relies on its desktop application for downloading and managing physical model files, so these operations are structurally impossible via the API.

## Options Mapping

All standard Ollama `options` are mapped to their OpenAI equivalents:

| Ollama | OpenAI |
|---|---|
| `temperature` | `temperature` |
| `top_p` | `top_p` |
| `top_k` | `top_k` |
| `seed` | `seed` |
| `stop` | `stop` |
| `num_predict` | `max_tokens` |
| `presence_penalty` | `presence_penalty` |
| `frequency_penalty` | `frequency_penalty` |
| `repeat_penalty` | `frequency_penalty` (alias) |

## Prerequisites

- [LMStudio](https://lmstudio.ai/) running with a model loaded and the local server started
- [Bun](https://bun.sh/) installed

## Installation

**Method 1: Run directly with NPX / BunX (Recommended)**

If you have NPM or Bun installed, you don't need to install anything globally! Just run the CLI on the fly:

```bash
bunx olms
# or
npx olms
```

You can also pass CLI arguments directly to the bridge: `--port`, `--lmstudio-url`, or `--help`.

**Method 2: Standalone Binary (macOS/Linux)**

You can download a pre-compiled standalone binary using our auto-installer script:

```bash
curl -fsSL https://raw.githubusercontent.com/thodinh/olms/main/install.sh | bash
```

## Development

```bash
# Install dependencies
bun install

# Start the bridge (with hot-reload)
bun dev

# Compile a standalone binary
bun run build
# The binary will be exported to './dist/olms'
```

The bridge listens on **http://localhost:11434** by default.

## Configuration

Create a `.env` file in the project root (Bun loads it automatically):

```env
# URL of your LMStudio server (default: http://localhost:1234/v1)
LMSTUDIO_URL=http://localhost:1234/v1

# Port to listen on (default: 11434 — Ollama's default)
PORT=11434
```

## Running Tests

```bash
bun test
```

Tests use mocked `fetch` and run without needing LMStudio to be running.

## Manual Testing

```bash
# List models
curl http://localhost:11434/api/tags

# Chat (non-streaming)
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"your-model-id","messages":[{"role":"user","content":"Hello!"}],"stream":false}'

# Chat (streaming)
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"your-model-id","messages":[{"role":"user","content":"Hello!"}]}'

# Text completion (non-streaming)
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"your-model-id","prompt":"Once upon a time","stream":false}'

# Embeddings (new format)
curl -X POST http://localhost:11434/api/embed \
  -H "Content-Type: application/json" \
  -d '{"model":"your-embed-model","input":"Hello world"}'

# Embeddings (legacy format)
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"your-embed-model","prompt":"Hello world"}'
```
