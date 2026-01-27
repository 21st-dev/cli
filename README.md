# @21st-dev/cli

Adds MagicMCP configuration to AI IDEs (Cursor, Windsurf, Cline, etc.)

## Usage

### Install MCP Configuration

```bash
npx @21st-dev/cli@latest install <client> --api-key <key>
```

You can obtain your API key at [21st.dev Magic Console](https://21st.dev/magic/console)

Supported IDEs: cursor, windsurf, cline, claude, witsy, enconvo

### Analyze GitHub Repository (Octolens)

Analyze any GitHub repository using [Octolens analyzemyrepo](https://analyzemyrepo.com):

```bash
# Analyze a specific repository
npx @21st-dev/cli@latest analyze facebook/react

# Analyze current repository (auto-detected from git remote)
npx @21st-dev/cli@latest analyze

# Open analysis in browser
npx @21st-dev/cli@latest analyze --open
```

## Manual Installation

Add to your IDE's MCP config:

```json
{
  "mcpServers": {
    "@21st-dev/magic": {
      "command": "npx",
      "args": ["-y", "@21st-dev/magic@latest", "API_KEY=\"your-api-key\""]
    }
  }
}
```
