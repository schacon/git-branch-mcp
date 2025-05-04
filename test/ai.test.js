import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { Git } from '../src/gitUtils.js';
import os from 'os';

describe('AI.generateCommitMessage', () => {
  let tempDir;
  
  beforeEach(() => {
    // assert that openai is available
    const openaiKey = Git.getOpenAIApiKey();
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    // Create a temporary directory for the test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'));
    
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
  });
  
  afterEach(() => {
    // Clean up the temporary directory after the test
    fs.removeSync(tempDir);
  });
  
  test('should create a feature branch and commit changes', async () => {
    // Make a change to the repository
    fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("Hello, world!");');
    
    // Call updateBranch with a summary
    const prompt = 'Add test script';
    const result = await Git.updateBranch(tempDir, prompt, true); // with AI

    console.log(result);

    // Verify the result
    expect(result.success).toBe(true);
    
    // Verify a new branch was created
    const branches = execSync('git branch', { cwd: tempDir, encoding: 'utf8' });
    expect(branches).toContain(result.branchName);
    
    // Verify the current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: tempDir, encoding: 'utf8' }).trim();
    expect(currentBranch).toBe(result.branchName);
    
    // Verify the commit was made
    const lastCommit = execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf8' }).trim();
    console.log(lastCommit);
    
    // Verify the file was committed
    const files = execSync('git ls-tree -r HEAD --name-only', { cwd: tempDir, encoding: 'utf8' });
    expect(files).toContain('test.js');
  });
}); 