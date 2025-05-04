import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { Git } from '../src/gitUtils.js';
import os from 'os';

describe('Git.updateBranch', () => {
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
    const result = await Git.updateBranch(tempDir, prompt, false);

    // Verify the result
    expect(result.success).toBe(true);
    
    // Verify a new branch was created
    const branches = execSync('git branch', { cwd: tempDir, encoding: 'utf8' });
    expect(branches).toContain('feature/add-test-script');
    
    // Verify the current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: tempDir, encoding: 'utf8' }).trim();
    expect(currentBranch).toBe('feature/add-test-script');
    
    // Verify the commit was made
    const lastCommit = execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf8' }).trim();
    expect(lastCommit).toBe(prompt);
    
    // Verify the file was committed
    const files = execSync('git ls-tree -r HEAD --name-only', { cwd: tempDir, encoding: 'utf8' });
    expect(files).toContain('test.js');
  });
  
  test('should commit changes to an existing branch', async () => {
    // Create a feature branch
    execSync('git checkout -b feature/existing-branch', { cwd: tempDir });
    
    // Make a change to the repository
    fs.writeFileSync(path.join(tempDir, 'another-test.js'), 'console.log("Another test");');
    
    // Call updateBranch with a summary
    const summary = 'Add another test script';
    const result = await Git.updateBranch(tempDir, summary, false);
    
    // Verify the result
    expect(result.success).toBe(true);
    
    // Verify the commit was made
    const lastCommit = execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf8' }).trim();
    expect(lastCommit).toBe(summary);
    
    // Verify the file was committed
    const files = execSync('git ls-tree -r HEAD --name-only', { cwd: tempDir, encoding: 'utf8' });
    expect(files).toContain('another-test.js');
  });
  
  test('should handle no changes', async () => {
    // Call updateBranch without making any changes
    const summary = 'No changes to commit';
    const result = await Git.updateBranch(tempDir, summary, false);
    
    // Verify the result
    expect(result.success).toBe(true);
    expect(result.message).toContain('No changes staged for commit');
  });
});

describe('Git.absorb', () => {
  let tempDir;
  
  beforeEach(() => {
    // Create a temporary directory for the test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'));
    
    // Initialize git in the temporary directory
    execSync('git init', { cwd: tempDir });
    
    // Configure git user for the test repository
    execSync('git config user.name "Test User"', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    
    // Create an initial file and commit (this will be on main/master)
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repository\n\nThis is a test repository.');
    execSync('git add README.md', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });
    
    // Create a feature branch
    execSync('git checkout -b feature/test-branch', { cwd: tempDir });
    
    // Create two files with separate commits to test absorb functionality
    fs.writeFileSync(path.join(tempDir, 'file1.js'), 'console.log("First file");');
    execSync('git add file1.js', { cwd: tempDir });
    execSync('git commit -m "Add first file"', { cwd: tempDir });
    
    fs.writeFileSync(path.join(tempDir, 'file2.js'), 'console.log("Second file");');
    execSync('git add file2.js', { cwd: tempDir });
    execSync('git commit -m "Add second file"', { cwd: tempDir });
  });
  
  afterEach(() => {
    // Clean up the temporary directory after the test
    fs.removeSync(tempDir);
  });
  
  test('should create fixup commits for modified files', () => {
    // Get the commit hash for the first file commit
    const firstCommitHash = execSync('git log --format=%h -n 1 -- file1.js', { cwd: tempDir, encoding: 'utf8' }).trim();
    
    // Modify both files to create changes for absorption
    fs.writeFileSync(path.join(tempDir, 'file1.js'), 'console.log("First file - modified");');
    fs.writeFileSync(path.join(tempDir, 'file2.js'), 'console.log("Second file - modified");');
    
    // Call absorb function
    const result = Git.absorb(tempDir);
    
    // Verify the result
    expect(result.success).toBe(true);
    expect(result.appliedFixups).toBeGreaterThan(0);
    
    // Check the log for fixup commits
    const logOutput = execSync('git log --oneline -n 4', { cwd: tempDir, encoding: 'utf8' });
    expect(logOutput).toContain('fixup!');
  });
  
  test('should handle no changes to absorb', () => {
    // Call absorb without making any changes
    const result = Git.absorb(tempDir);
    
    // Verify the result
    expect(result.success).toBe(true);
    expect(result.appliedFixups).toBe(0);
    expect(result.message).toContain('No changes detected to absorb');
  });
  
  test('should error on master/main branch', () => {
    // Switch back to main branch
    execSync('git checkout master || git checkout main', { cwd: tempDir, stdio: 'pipe' });
    
    // Make a change on master/main
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Repository\n\nThis is a modified test repository.');
    
    // Call absorb on main branch
    const result = Git.absorb(tempDir);
    
    // Verify it returns an error
    expect(result.success).toBe(false);
    expect(result.message).toContain('Cannot absorb changes on default branch');
  });
  
  test('should match files to the correct original commits', () => {
    // Get the commit hashes for both original commits
    const firstCommitHash = execSync('git log --format=%h -n 1 -- file1.js', { cwd: tempDir, encoding: 'utf8' }).trim();
    const secondCommitHash = execSync('git log --format=%h -n 1 -- file2.js', { cwd: tempDir, encoding: 'utf8' }).trim();
    
    // Modify both files
    fs.writeFileSync(path.join(tempDir, 'file1.js'), 'console.log("First file - modified");');
    fs.writeFileSync(path.join(tempDir, 'file2.js'), 'console.log("Second file - modified");');
    
    // Call absorb function
    const result = Git.absorb(tempDir);
    
    // Verify the result
    expect(result.success).toBe(true);
    expect(result.appliedFixups).toBe(2); // Should create 2 fixup commits, one for each file
    
    // Check that fixup details include both commits
    const fixupTargets = result.fixupDetails.map(d => d.targetCommit);
    expect(fixupTargets).toContain(firstCommitHash);
    expect(fixupTargets).toContain(secondCommitHash);
    
    // Check that each fixup contains the correct file
    const file1Fixup = result.fixupDetails.find(d => d.targetCommit === firstCommitHash);
    const file2Fixup = result.fixupDetails.find(d => d.targetCommit === secondCommitHash);
    
    expect(file1Fixup.files).toContain('file1.js');
    expect(file2Fixup.files).toContain('file2.js');
  });
}); 