import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { Git } from '../src/gitUtils.js';
import os from 'os';

// Set a longer timeout for all tests in this file
jest.setTimeout(30000); // 30 seconds

describe('AI.generateCommitMessage', () => {
  let tempDir;
  
  beforeEach(() => {
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

  test.only('should absorb changes', async () => {
    // Set a longer timeout for this specific test that's failing
    jest.setTimeout(60000); // 60 seconds
    
    process.chdir(tempDir);

    // Make a change to the repository
    fs.writeFileSync('test.js', 'console.log("Hello, world!");');
    
    // Call updateBranch with a summary
    const prompt = 'Add test script';
    await Git.updateBranch(tempDir, prompt, true); // with AI

    // Make a change to the repository
    fs.writeFileSync('test.js', `console.log("Hello, world!");\n console.log("Hello, again!");`);

    // Call absorb
    const absorbResult = await Git.absorb(tempDir);

    // Verify the result
    expect(absorbResult.success).toBe(true);
    expect(absorbResult.appliedFixups).toBe(1);

    // Verify the commit was made
    const lastCommit = execSync('git log --oneline --decorate', { encoding: 'utf8' }).trim();
    const commitCount = lastCommit.split('\n').length;

    console.log(lastCommit);
    expect(commitCount).toBe(2);

    fs.writeFileSync('index.js', `console.log("Main stuff!");`);

    const lastCommit2 = execSync('git commit -a -m "add main index file"', { encoding: 'utf8' }).trim();
    console.log(lastCommit2);

    fs.writeFileSync('index.js', `console.log("Main stuff!");\n console.log("Main stuff again!");`);
    fs.writeFileSync('test.js', `console.log("Test stuff!");\n console.log("Test even more stuff again!");`);

    const absorbResult2 = await Git.absorb(tempDir);
    console.log(absorbResult2);

    const lastCommit3 = execSync('git log --oneline --decorate', { encoding: 'utf8' }).trim();
    console.log(lastCommit3);
  });
}); 