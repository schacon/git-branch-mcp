import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Git } from '../src/gitUtils.js';

// Use jest.spyOn instead of jest.mock for ES modules
beforeEach(() => {
  // Set up Git.updateBranch mock
  jest.spyOn(Git, 'updateBranch').mockImplementation(() => ({}));
});

afterEach(() => {
  // Clean up all mocks
  jest.restoreAllMocks();
});

describe('MCP Git Branch Server', () => {
  let server;
  let tempDir;
  let updateBranchHandler; // Store the handler here
  
  beforeEach(() => {
    // Create a temporary directory for the test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-mcp-test-'));
    
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
    
    // Create MCP server
    server = new McpServer({
      name: "Git Branch MCP Test",
      version: "1.0.0"
    });
    
    // Create the handler function
    updateBranchHandler = async ({ promptSummary, currentWorkingDirectory }) => {
      // Use the promptSummary as the commit message
      const result = Git.updateBranch(currentWorkingDirectory, promptSummary, 'test-chat-id');
      
      if (result.success) {
        let message = `Branch '${result.branch}' has been updated with changes related to: ${promptSummary}`;
        
        // If we switched branches, add that information
        if (result.message.includes('Created and checked out new branch') || 
            result.message.includes('Checked out existing branch')) {
          message = `${result.message}. ${message}`;
        }
        
        return {
          content: [{ type: "text", text: message }]
        };
      } else {
        return {
          content: [{ type: "text", text: `Failed to update branch: ${result.message}` }]
        };
      }
    };
    
    // Add git.updateBranch tool to the server
    server.tool("git.updateBranch",
      "Update commits on the current branch based on the summary of the prompt used to modify the codebase",
      {
        promptSummary: z.string(),
        currentWorkingDirectory: z.string()
      },
      updateBranchHandler
    );
  });
  
  afterEach(() => {
    // Clean up the temporary directory after the test
    fs.removeSync(tempDir);
  });
  
  test('git.updateBranch should create a new branch and commit changes', async () => {
    // Make a change to the repository
    fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("Hello, world!");');
    
    // Mock the Git.updateBranch response
    jest.spyOn(Git, 'updateBranch').mockReturnValue({
      success: true,
      message: "Created and checked out new branch 'feature/add-test-script'. Successfully committed changes.",
      branch: 'feature/add-test-script',
      commitsAhead: { 
        success: true, 
        commitCount: 1, 
        upstreamBranch: 'main',
        commitList: [{ hash: 'abc1234', message: 'Add test script' }]
      }
    });
    
    // Call the handler directly
    const result = await updateBranchHandler({
      promptSummary: 'Add test script',
      currentWorkingDirectory: tempDir
    });
    
    // Verify Git.updateBranch was called with correct parameters
    expect(Git.updateBranch).toHaveBeenCalledWith(tempDir, 'Add test script', 'test-chat-id');
    
    // Verify the MCP response
    expect(result.content[0].text).toContain("Created and checked out new branch 'feature/add-test-script'");
    expect(result.content[0].text).toContain("Branch 'feature/add-test-script' has been updated with changes related to: Add test script");
  });
  
  test('git.updateBranch should handle errors', async () => {
    // Mock the Git.updateBranch to return an error
    jest.spyOn(Git, 'updateBranch').mockReturnValue({
      success: false,
      message: "Failed to update branch: Some error occurred"
    });
    
    // Call the handler directly
    const result = await updateBranchHandler({
      promptSummary: 'Add test script',
      currentWorkingDirectory: tempDir
    });
    
    // Verify Git.updateBranch was called with correct parameters
    expect(Git.updateBranch).toHaveBeenCalledWith(tempDir, 'Add test script', 'test-chat-id');
    
    // Verify the MCP error response
    expect(result.content[0].text).toBe("Failed to update branch: Failed to update branch: Some error occurred");
  });
}); 