# OpenCode Configuration for Agent Containers

This document describes how to configure OpenCode LLM providers and agents for use in crowd-mcp agent containers.

## Overview

Each spawned agent runs OpenCode in an isolated Docker container. OpenCode requires configuration for:

1. **LLM Providers** - Which AI services to use (Anthropic, OpenAI, OpenRouter, etc.)
2. **Agents** - Specialized AI personas with specific models and behaviors
3. **API Keys** - Authentication credentials for LLM providers

## Configuration Files

All configuration files are stored in the workspace directory:

```
workspace/
└── .crowd/
    └── opencode/
        ├── opencode.json      # Provider and agent configuration
        ├── .env              # API keys (gitignored)
        └── .env.local        # Local overrides (gitignored)
```

## Required Configuration

### Minimum Configuration

crowd-mcp **requires at least one LLM provider** to be configured. The server will fail to start if no providers are configured.

**Demo Mode Exception:** For testing and development, you can bypass this validation by setting `CROWD_DEMO_MODE=true`. See [Demo Mode](#demo-mode) below.

**Example minimal `opencode.json`:**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "npm": "@anthropic-ai/sdk",
      "name": "Anthropic",
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      },
      "models": {
        "claude-3-5-sonnet-20241022": {
          "name": "Claude 3.5 Sonnet"
        }
      }
    }
  }
}
```

**Corresponding `.env` file:**

```bash
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
```

## Provider Configuration

### Provider Structure

Each provider in `opencode.json` must include:

- `npm` - The npm package for the provider SDK
- `name` - Display name (optional)
- `options` - Provider-specific options (baseURL, apiKey, etc.)
- `models` - Map of available models

### Supported Providers

#### Anthropic (Claude)

```json
{
  "provider": {
    "anthropic": {
      "npm": "@anthropic-ai/sdk",
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      },
      "models": {
        "claude-3-5-sonnet-20241022": { "name": "Claude 3.5 Sonnet" },
        "claude-3-opus-20240229": { "name": "Claude 3 Opus" }
      }
    }
  }
}
```

#### OpenRouter (Multi-Provider Gateway)

```json
{
  "provider": {
    "openrouter": {
      "npm": "@openrouter/ai-sdk-provider",
      "options": {
        "apiKey": "{env:OPENROUTER_API_KEY}",
        "baseURL": "https://openrouter.ai/api/v1"
      },
      "models": {
        "anthropic/claude-3.5-sonnet": { "name": "Claude 3.5 Sonnet" },
        "openai/gpt-4": { "name": "GPT-4" }
      }
    }
  }
}
```

#### OpenAI

```json
{
  "provider": {
    "openai": {
      "npm": "@ai-sdk/openai",
      "options": {
        "apiKey": "{env:OPENAI_API_KEY}"
      },
      "models": {
        "gpt-4": { "name": "GPT-4" },
        "gpt-4-turbo": { "name": "GPT-4 Turbo" }
      }
    }
  }
}
```

#### Local Models (Ollama, LM Studio)

```json
{
  "provider": {
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:11434/v1"
      },
      "models": {
        "qwen2.5-coder:32b": {
          "name": "Qwen 2.5 Coder 32B",
          "reasoning": true,
          "tool_call": true
        }
      }
    }
  }
}
```

## Agent Configuration

### Agent Structure

Agents can be configured to use specific models and behaviors:

```json
{
  "agents": {
    "architect": {
      "model": "anthropic.claude-3-5-sonnet-20241022",
      "description": "System architecture and design specialist",
      "temperature": 0.3,
      "reasoningEffort": "high",
      "mode": "all",
      "tools": ["read", "write", "bash"]
    },
    "coder": {
      "model": "openrouter.anthropic/claude-3.5-sonnet",
      "description": "Code implementation specialist",
      "temperature": 0.7,
      "mode": "subagent"
    }
  }
}
```

### Agent Properties

- **`model`** (optional) - Which provider.model to use. Format: `provider.model-id`
  - If not specified, uses the global default model
  - Provider must exist in `provider` section
- **`description`** - What the agent does and when to use it
- **`temperature`** (0.0-1.0) - Controls creativity vs. determinism
- **`reasoningEffort`** - "low", "medium", "high" - For reasoning models
- **`mode`** - "primary", "subagent", or "all" - When agent is active
- **`tools`** - Array of tool names available to this agent

### Validation Rules

1. **Provider existence**: If an agent specifies a `model`, the provider referenced in that model **must exist** in the `provider` section
2. **Model format**: Agent model must use format `provider.model-id`
3. **Default provider**: The first provider in the config is used as default

**Example validation error:**

```
❌ OpenCode configuration validation failed:

  • Agent "coder" references non-existent provider "openai"
    Hint: Either add provider "openai" to the config or change the agent's model to use one of: anthropic, openrouter
```

## Environment Variables

### Loading Mechanism

API keys and secrets are loaded from:

1. `.crowd/opencode/.env` - Committed defaults (if any)
2. `.crowd/opencode/.env.local` - Local overrides (gitignored, higher priority)

Using dotenv syntax:

```bash
# .crowd/opencode/.env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxx
```

### Variable Substitution in Config

Use `{env:VARIABLE_NAME}` syntax in `opencode.json`:

```json
{
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

### Container Environment

All variables from `.env` and `.env.local` are passed to agent containers as environment variables.

## Default Provider

The **first provider** in the `provider` object is used as the default when:

- No specific model is configured for an agent
- OpenCode needs to select a model automatically

**Example:**

```json
{
  "provider": {
    "anthropic": { ... },  // ← This is the default
    "openai": { ... }
  }
}
```

## Configuration Examples

### Complete Example

See `.crowd/opencode/opencode.json.example` for a complete configuration example with multiple providers and agents.

### Minimal Setup (Single Provider)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "npm": "@anthropic-ai/sdk",
      "options": { "apiKey": "{env:ANTHROPIC_API_KEY}" },
      "models": {
        "claude-3-5-sonnet-20241022": { "name": "Claude 3.5 Sonnet" }
      }
    }
  }
}
```

### Multi-Provider with Agents

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "npm": "@anthropic-ai/sdk",
      "options": { "apiKey": "{env:ANTHROPIC_API_KEY}" },
      "models": {
        "claude-3-5-sonnet-20241022": { "name": "Claude 3.5 Sonnet" }
      }
    },
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": {
        "qwen2.5-coder:7b": { "name": "Qwen 2.5 Coder 7B (Fast)" }
      }
    }
  },
  "agents": {
    "architect": {
      "model": "anthropic.claude-3-5-sonnet-20241022",
      "description": "High-level architecture and design",
      "temperature": 0.3
    },
    "coder": {
      "model": "local.qwen2.5-coder:7b",
      "description": "Fast code implementation",
      "temperature": 0.7
    }
  }
}
```

## Validation at Startup

crowd-mcp validates the OpenCode configuration when the server starts:

1. ✅ Checks that `.crowd/opencode/opencode.json` exists
2. ✅ Verifies at least one provider is configured
3. ✅ Validates that all agent models reference existing providers
4. ❌ Fails with detailed error messages if validation fails

**Example startup output:**

```
✓ OpenCode configuration validated successfully
✓ HTTP server started successfully
  Web Dashboard: http://localhost:3000
  API Endpoint: http://localhost:3000/api/agents
crowd-mcp server running on stdio
```

## Demo Mode

For testing, development, or demo purposes, you can bypass the OpenCode provider validation by setting the `CROWD_DEMO_MODE` environment variable:

```bash
CROWD_DEMO_MODE=true npx crowd-mcp@latest
```

Or in your MCP client configuration:

```json
{
  "mcpServers": {
    "crowd-mcp": {
      "command": "npx",
      "args": ["-y", "crowd-mcp@latest"],
      "env": {
        "CROWD_DEMO_MODE": "true",
        "HTTP_PORT": "3000"
      }
    }
  }
}
```

### When to Use Demo Mode

✅ **Good use cases:**

- Testing the web dashboard without LLM providers
- Demonstrating the agent management UI
- Development and debugging of core features
- CI/CD pipeline tests that don't spawn actual agents

❌ **Not suitable for:**

- Production environments
- Actually spawning and running agents (they won't work without providers)
- Any scenario where agents need to execute tasks

### Demo Mode Behavior

When `CROWD_DEMO_MODE=true`:

- ⚠️ Server starts even without OpenCode configuration
- ⚠️ Server starts even with invalid provider configuration
- ⚠️ Warning message displayed on startup
- ✅ Web dashboard works normally
- ✅ Agent lifecycle management (spawn/list/stop) works
- ❌ Spawned agents won't be able to execute tasks (no LLM available)

**Startup message in demo mode:**

```
⚠️  OpenCode configuration validation skipped (CROWD_DEMO_MODE=true)
   Warning: Agents will not work without proper LLM provider configuration
✓ HTTP server started successfully
  Web Dashboard: http://localhost:3000
crowd-mcp server running on stdio
```

## Troubleshooting

### "No LLM providers configured"

**Problem**: No providers in `opencode.json`

**Solution**: Add at least one provider:

```json
{
  "provider": {
    "anthropic": {
      "npm": "@anthropic-ai/sdk",
      "options": { "apiKey": "{env:ANTHROPIC_API_KEY}" },
      "models": {
        "claude-3-5-sonnet-20241022": { "name": "Claude 3.5 Sonnet" }
      }
    }
  }
}
```

### "Agent references non-existent provider"

**Problem**: Agent's model references a provider that doesn't exist

**Solution**: Either:

1. Add the missing provider to the config, OR
2. Change the agent's model to use an existing provider

**Example:**

```json
{
  "agents": {
    "coder": {
      "model": "openai.gpt-4" // ❌ openai provider doesn't exist
    }
  }
}
```

Fix by adding the provider:

```json
{
  "provider": {
    "openai": {
      "npm": "@ai-sdk/openai",
      "options": { "apiKey": "{env:OPENAI_API_KEY}" },
      "models": { "gpt-4": { "name": "GPT-4" } }
    }
  }
}
```

### "Configuration file not found"

**Problem**: Missing `.crowd/opencode/opencode.json`

**Solution**: Create the file:

```bash
mkdir -p .crowd/opencode
cp .crowd/opencode/opencode.json.example .crowd/opencode/opencode.json
# Edit opencode.json with your providers
```

## Security Best Practices

1. **Never commit API keys** - Use `.env.local` for sensitive keys
2. **Add to .gitignore**:
   ```
   .crowd/opencode/.env.local
   .crowd/opencode/.env
   ```
3. **Use environment variables** - Always use `{env:VAR}` syntax in `opencode.json`
4. **Rotate keys regularly** - Update API keys periodically
5. **Use separate keys per environment** - Don't share keys between dev/prod

## Related Documentation

- [OpenCode Official Docs](https://opencode.ai/docs/)
- [OpenCode Providers](https://opencode.ai/docs/providers/)
- [OpenCode Agents](https://opencode.ai/docs/agents/)
- [OpenCode Config Reference](https://opencode.ai/docs/config/)
