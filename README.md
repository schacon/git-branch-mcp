# Git Branch MCP

An implementation of the Model Context Protocol (MCP) server for Git branch operations.

## Running the Server

```bash
npm start
```

## Testing

The project includes several test suites:

```bash
# Run all tests
npm run jest

# Run specific test file
npm run jest -- test/gitUtils.test.js
npm run jest -- test/mcp.test.js
npm run jest -- test/integration.test.js
npm run jest -- test/commitMessageFormatter.test.js
```

### Test Suite Overview

- **gitUtils.test.js**: Tests the Git utility functions directly
- **mcp.test.js**: Tests the MCP server functionality with mocked Git utilities
- **integration.test.js**: End-to-end tests of the MCP server with real Git operations
- **commitMessageFormatter.test.js**: Tests the commit message formatting utilities that handle proper Git commit message formatting and parsing

### Commit Message Formatter

The commit message formatter provides utilities for formatting Git commit messages according to best practices:

- Wraps lines at 72 characters
- Preserves special formatting for bullet points, quotes, and code blocks
- Provides methods for UI-friendly message parsing and Git-friendly storage formats

To run only the commit message formatter tests:

```bash
npm run jest -- test/commitMessageFormatter.test.js
```

## MCP Inspector Testing

```bash
npm run jest
```

## Setting up Cursor to use the server

1. Go to cursor settings
2. Search for "MCP"
3. Click "Add new MCP Server"
4. Type is "command" and command is `npm [path]/src/index.js`

## What does Git Branch MCP do?

This MCP server provides tooling to keep a git branch intelligently managed
with the changes that your agent is making to the codebase.

## Authors

- Scott Chacon <schacon@gmail.com>

## Available MCP Functions

### git.updateBranch

Updates commits on the current branch based on the summary of the prompt used to modify the codebase. If on the main/master branch, it creates a new feature branch based on the summary.

### git.integrateBranch

Merges the current branch into the default branch (main or master) and optionally deletes the current branch.

### git.summarizeBranch

Shows a list of the current commits on the active branch and information about the branch.
