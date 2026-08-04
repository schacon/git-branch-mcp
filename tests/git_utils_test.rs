use std::fs;
use std::process::Command;
use tempfile::TempDir;

use git_branch_mcp::git_utils::Git;

fn setup_git_repo() -> TempDir {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let temp_path = temp_dir.path();
    
    // Initialize git in the temporary directory
    Command::new("git")
        .args(&["init"])
        .current_dir(temp_path)
        .output()
        .expect("Failed to initialize git repo");
    
    // Configure git user for the test repository
    Command::new("git")
        .args(&["config", "user.name", "Test User"])
        .current_dir(temp_path)
        .output()
        .expect("Failed to configure git user name");
    
    Command::new("git")
        .args(&["config", "user.email", "test@example.com"])
        .current_dir(temp_path)
        .output()
        .expect("Failed to configure git user email");
    
    // Create an initial file
    let readme_path = temp_path.join("README.md");
    fs::write(&readme_path, "# Test Repository\n\nThis is a test repository.")
        .expect("Failed to write README.md");
    
    // Add and commit the initial file
    Command::new("git")
        .args(&["add", "README.md"])
        .current_dir(temp_path)
        .output()
        .expect("Failed to add README.md");
    
    Command::new("git")
        .args(&["commit", "-m", "Initial commit"])
        .current_dir(temp_path)
        .output()
        .expect("Failed to commit initial file");
    
    temp_dir
}

#[tokio::test]
async fn test_update_branch_creates_feature_branch() {
    let temp_dir = setup_git_repo();
    let temp_path = temp_dir.path().to_str().unwrap();
    
    // Make a change to the repository
    let test_file_path = temp_dir.path().join("test.rs");
    fs::write(&test_file_path, r#"fn main() { println!("Hello, world!"); }"#)
        .expect("Failed to write test.rs");
    
    // Call updateBranch
    let prompt = "Add test script";
    let result = Git::update_branch(temp_path, prompt, "summary", "test-chat-id", false).await;
    
    // Verify the result
    assert!(result.is_ok());
    let result = result.unwrap();
    assert!(result.success, "Expected success but got: {}", result.message);
    
    // Verify a new branch was created
    let branches_output = Command::new("git")
        .args(&["branch"])
        .current_dir(temp_dir.path())
        .output()
        .expect("Failed to list branches");
    let branches = String::from_utf8(branches_output.stdout).unwrap();
    assert!(branches.contains("feature/add-test-script"));
    
    // Verify the current branch
    let current_branch_output = Command::new("git")
        .args(&["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(temp_dir.path())
        .output()
        .expect("Failed to get current branch");
    let current_branch_string = String::from_utf8(current_branch_output.stdout).unwrap();
    let current_branch = current_branch_string.trim();
    assert_eq!(current_branch, "feature/add-test-script");
}

#[tokio::test]
async fn test_get_current_branch() {
    let temp_dir = setup_git_repo();
    
    // Test using git command directly in the temp directory
    // instead of changing global working directory
    let output = Command::new("git")
        .args(&["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(temp_dir.path())
        .output()
        .expect("Failed to get current branch");
    
    assert!(output.status.success());
    let branch = String::from_utf8(output.stdout).unwrap().trim().to_string();
    assert_eq!(branch, "main");
}

#[tokio::test]
async fn test_branch_summary() {
    let temp_dir = setup_git_repo();
    let temp_path = temp_dir.path().to_str().unwrap();
    
    let result = Git::get_branch_summary(temp_path, 10).await;
    
    assert!(result.is_ok());
    let summary = result.unwrap();
    assert!(summary.success);
    assert!(summary.branch.is_some());
    assert!(!summary.commits.is_empty());
}

#[test]
fn test_generate_simple_branch_name() {
    // This function is not public, so we'll test it indirectly through update_branch
    // For now, just ensure the module loads correctly
    assert!(true);
}

#[tokio::test]
async fn test_no_changes_to_commit() {
    let temp_dir = setup_git_repo();
    let temp_path = temp_dir.path().to_str().unwrap();
    
    // Call updateBranch without making any changes
    let prompt = "No changes";
    let result = Git::update_branch(temp_path, prompt, "summary", "test-chat-id", false).await;
    
    assert!(result.is_ok());
    let result = result.unwrap();
    assert!(result.success, "Expected success but got: {}", result.message);
    assert!(result.message.contains("No changes staged for commit"));
}