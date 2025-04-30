# Git Branch MCP

An implementation of the Model Context Protocol (MCP) server for Git branch operations.

## Running the Server

```bash
npm start
```

## Testing

```bash
npm run test
```

## Setting up Cursor to use the server

1. Go to cursor settings
2. Search for "MCP"
3. Click "Add new MCP Server"
4. Type is "command" and command is `npm [path]/src/index.js`

## What does Git Branch MCP do?

This MCP server provides tooling to keep a git branch intelligently managed
with the changes that your agent is making to the codebase.
