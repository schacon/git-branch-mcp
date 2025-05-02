import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { execSync, spawn } from 'child_process';
import os from 'os';
import { McpClient } from '@modelcontextprotocol/sdk/client/mcp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// This test runs the actual server and tests the integration
describe('MCP Server Integration Test', () => {
  let tempDir;
  let serverProcess;
  let client;
  
  beforeEach(async () => {
    // Set longer timeout for this test
    jest.setTimeout(10000);
    
    // Create a temporary directory for the test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-mcp-integration-'));
    
    // Initialize git in the temporary directory
    execSync('git init', { cwd: tempDir });
    
    // Configure git user for the test repository
    execSync('git config user.name "Test User"', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    
    // Create an initial file
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repository\n\nThis is a test repository.');
    
    // Add and commit the initial file
    execSync('git add README.md', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });
    
    // Start the server as a child process
    serverProcess = spawn('node', ['src/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Create a client and connect to the server
    client = new McpClient();
    const transport = new StdioClientTransport(serverProcess.stdin, serverProcess.stdout);
    
    // Wait for the server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Connect the client to the server
    await client.connect(transport);
  });
  
  afterEach(async () => {
    // Disconnect the client
    if (client) {
      await client.disconnect();
    }
    
    // Kill the server process
    if (serverProcess) {
      serverProcess.kill();
    }
    
    // Clean up the temporary directory
    fs.removeSync(tempDir);
  });
  
  test('git.updateBranch should create a new branch and commit changes', async () => {
    // Make a change to the repository
    fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("Hello, world!");');
    
    // Call the git.updateBranch tool via the MCP client
    const summary = 'Add test script';
    const response = await client.callTool('git.updateBranch', {
      promptSummary: summary,
      currentWorkingDirectory: tempDir
    });
    
    // Verify the response contains successful branch creation
    expect(response.content[0].text).toContain('Created and checked out new branch');
    expect(response.content[0].text).toContain('feature/add-test-script');
    
    // Verify a new branch was created
    const branches = execSync('git branch', { cwd: tempDir, encoding: 'utf8' });
    expect(branches).toContain('feature/add-test-script');
    
    // Verify the current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: tempDir, encoding: 'utf8' }).trim();
    expect(currentBranch).toBe('feature/add-test-script');
    
    // Verify the commit was made
    const lastCommit = execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf8' }).trim();
    expect(lastCommit).toBe(summary);
    
    // Verify the file was committed
    const files = execSync('git ls-tree -r HEAD --name-only', { cwd: tempDir, encoding: 'utf8' });
    expect(files).toContain('test.js');
  });
}); 