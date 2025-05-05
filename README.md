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

## Configuration Files

You can customize how Git Branch MCP generates branch names and commit messages by using the following configuration files:

### Format Instruction Files

Git Branch MCP supports format instruction files in multiple locations with the following precedence order:

1. **Personal Overrides** - Located in your local .git directory (not version-controlled):

   - `.git/branch-format.md`
   - `.git/commit-message-format.md`

2. **Repository-wide Settings** - Located in the .gitbutler directory (version-controlled):
   - `.gitbutler/branch-format.md`
   - `.gitbutler/commit-message-format.md`

The system will check these locations in order and use the first one it finds. This allows for both personal customization and team-wide standardization.

### Branch Format Instructions

Branch format instructions control how branch names are generated when using the AI feature.

Example content:

```
Branch names should follow the pattern: 'team/feature-name' where team is one of: frontend, backend, devops, qa
```

To set up repository-wide branch format instructions that can be version-controlled:

```bash
# Create the file in your .gitbutler directory
mkdir -p .gitbutler
echo "Branch names should be in format 'type/short-description' where type is one of: feature, bugfix, hotfix, refactor, docs" > .gitbutler/branch-format.md
```

To set up personal branch format instructions that override repository settings:

```bash
# Create the file in your .git directory
echo "Branch names should use my-username/feature-description format" > .git/branch-format.md
```

### Commit Message Format Instructions

Commit message format instructions control how commit messages are generated when using the AI feature.

Example content:

```
Commit messages must follow the Conventional Commits specification:
- First line is type(scope): description (50 chars max)
- Types allowed: feat, fix, docs, style, refactor, perf, test, chore
- Leave a blank line after the first line
- Body should explain WHY this change was needed, wrapped at 72 chars
- Use imperative present tense (e.g., "add" not "adds" or "added")
```

To set up repository-wide commit message format instructions that can be version-controlled:

```bash
# Create the file in your .gitbutler directory
mkdir -p .gitbutler
echo "Commit messages should follow conventional commits format: type(scope): description" > .gitbutler/commit-message-format.md
```

To set up personal commit message format instructions that override repository settings:

```bash
# Create the file in your .git directory
echo "Commit messages should include a ticket number in the format [TICKET-123]" > .git/commit-message-format.md
```

When these files are present in your repository, Git Branch MCP will read their contents based on the precedence order and pass them to the AI model to guide the generation of branch names and commit messages according to your team's or personal preferences.
