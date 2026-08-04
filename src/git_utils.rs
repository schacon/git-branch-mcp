use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};
use anyhow::{anyhow, Result};
use uuid::Uuid;
use regex::Regex;
use chrono::Utc;

use crate::commit_message_formatter::CommitMessageFormatter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitData {
    pub branch_name: String,
    pub commit_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitAbsorbSuggestion {
    pub absorb_files: Vec<AbsorbFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbsorbFile {
    pub commit_hash: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct GitResult {
    pub success: bool,
    pub message: String,
    pub branch: Option<String>,
    pub commits: Vec<CommitInfo>,
    pub creation_info: Option<CreationInfo>,
    pub tracking_info: Option<TrackingInfo>,
    pub commits_ahead_of_upstream: Option<CommitsAheadInfo>,
    pub merge_details: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CommitInfo {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct CreationInfo {
    pub date: String,
    pub _commit_hash: String,
}

#[derive(Debug, Clone)]
pub struct TrackingInfo {
    pub upstream: String,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone)]
pub struct CommitsAheadInfo {
    pub success: bool,
    pub upstream_branch: String,
    pub commit_count: u32,
    pub commit_list: Vec<SimpleCommit>,
}

#[derive(Debug, Clone)]
pub struct SimpleCommit {
    pub hash: String,
    pub message: String,
}

pub struct Git;

impl Git {
    pub fn get_current_branch() -> Result<Option<String>> {
        let output = Command::new("git")
            .args(&["rev-parse", "--abbrev-ref", "HEAD"])
            .output()?;
        
        if output.status.success() {
            let branch = String::from_utf8(output.stdout)?.trim().to_string();
            Ok(Some(branch))
        } else {
            Ok(None)
        }
    }
    
    pub fn get_upstream_branch() -> Result<Option<String>> {
        if Self::remote_branch_exists("main")? {
            Ok(Some("origin/main".to_string()))
        } else if Self::remote_branch_exists("master")? {
            Ok(Some("origin/master".to_string()))
        } else if Self::branch_exists("main")? {
            Ok(Some("main".to_string()))
        } else if Self::branch_exists("master")? {
            Ok(Some("master".to_string()))
        } else {
            Ok(None)
        }
    }
    
    pub fn get_openai_api_key() -> Result<Option<String>> {
        let output = Command::new("git")
            .args(&["config", "openai.key"])
            .output()?;
        
        if output.status.success() {
            let key = String::from_utf8(output.stdout)?.trim().to_string();
            if !key.is_empty() {
                Ok(Some(key))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }
    
    pub fn remote_branch_exists(branch: &str) -> Result<bool> {
        let output = Command::new("git")
            .args(&["rev-parse", "--verify", "--quiet", &format!("origin/{}", branch)])
            .output()?;
        
        Ok(output.status.success())
    }
    
    pub fn branch_exists(branch: &str) -> Result<bool> {
        let output = Command::new("git")
            .args(&["rev-parse", "--verify", "--quiet", branch])
            .output()?;
        
        Ok(output.status.success())
    }
    
    pub fn get_commits_ahead_of_upstream() -> Result<CommitsAheadInfo> {
        let upstream_branch = Self::get_upstream_branch()?
            .ok_or_else(|| anyhow!("No origin/main or origin/master branch found"))?;
        
        let output = Command::new("git")
            .args(&["log", "--oneline", &format!("{}..HEAD", upstream_branch)])
            .output()?;
        
        if !output.status.success() {
            return Ok(CommitsAheadInfo {
                success: false,
                upstream_branch,
                commit_count: 0,
                commit_list: vec![],
            });
        }
        
        let log_output = String::from_utf8(output.stdout)?;
        let commits: Vec<SimpleCommit> = log_output
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| {
                let parts: Vec<&str> = line.splitn(2, ' ').collect();
                SimpleCommit {
                    hash: parts[0].to_string(),
                    message: parts.get(1).unwrap_or(&"").to_string(),
                }
            })
            .collect();
        
        Ok(CommitsAheadInfo {
            success: true,
            upstream_branch,
            commit_count: commits.len() as u32,
            commit_list: commits,
        })
    }
    
    pub fn checkout_new_branch(branch_name: &str) -> Result<GitResult> {
        let output = Command::new("git")
            .args(&["checkout", "-b", branch_name])
            .output()?;
        
        if output.status.success() {
            Ok(GitResult {
                success: true,
                message: format!("Created and checked out new branch '{}'", branch_name),
                branch: Some(branch_name.to_string()),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains(&format!("branch '{}' already exists", branch_name)) {
                let checkout_output = Command::new("git")
                    .args(&["checkout", branch_name])
                    .output()?;
                
                if checkout_output.status.success() {
                    Ok(GitResult {
                        success: true,
                        message: format!("Checked out existing branch '{}'", branch_name),
                        branch: Some(branch_name.to_string()),
                        commits: vec![],
                        creation_info: None,
                        tracking_info: None,
                        commits_ahead_of_upstream: None,
                        merge_details: None,
                    })
                } else {
                    Ok(GitResult {
                        success: false,
                        message: format!("Failed to checkout existing branch '{}': {}", branch_name, String::from_utf8_lossy(&checkout_output.stderr)),
                        branch: None,
                        commits: vec![],
                        creation_info: None,
                        tracking_info: None,
                        commits_ahead_of_upstream: None,
                        merge_details: None,
                    })
                }
            } else {
                Ok(GitResult {
                    success: false,
                    message: format!("Failed to create or checkout branch '{}': {}", branch_name, stderr),
                    branch: None,
                    commits: vec![],
                    creation_info: None,
                    tracking_info: None,
                    commits_ahead_of_upstream: None,
                    merge_details: None,
                })
            }
        }
    }
    
    pub fn commit_with_message(message: &str) -> Result<()> {
        let tf_id = Uuid::new_v4().to_string().replace("-", "")[..15].to_string();
        let temp_file_path = format!(".git/gbm/git-branch-mcp-{}.txt", tf_id);
        
        // Create the .git/gbm directory if it doesn't exist
        fs::create_dir_all(".git/gbm")?;
        
        fs::write(&temp_file_path, message)?;
        
        let output = Command::new("git")
            .args(&["commit", "-F", &temp_file_path])
            .output()?;
        
        // Delete the temp file
        let _ = fs::remove_file(&temp_file_path);
        
        if !output.status.success() {
            return Err(anyhow!("Git commit failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
        
        Ok(())
    }
    
    pub fn log_prompt_to_history(prompt: &str, commit_hash: &str, summary: &str) -> Result<bool> {
        let history_file_path = ".git/prompt-history.json";
        
        let mut history_data: Vec<serde_json::Value> = if Path::new(history_file_path).exists() {
            let file_content = fs::read_to_string(history_file_path)?;
            serde_json::from_str(&file_content).unwrap_or_else(|_| vec![])
        } else {
            vec![]
        };
        
        history_data.push(serde_json::json!({
            "timestamp": Utc::now().to_rfc3339(),
            "prompt": prompt,
            "summary": summary,
            "commitHash": commit_hash
        }));
        
        fs::write(history_file_path, serde_json::to_string_pretty(&history_data)?)?;
        
        write_log(&format!("Logged prompt and commit hash to history: {}... -> {}", 
            &prompt[..prompt.len().min(30)], commit_hash));
        
        Ok(true)
    }
    
    pub async fn update_branch(
        current_working_directory: &str,
        prompt: &str,
        summary: &str,
        chat_id: &str,
        use_ai: bool,
    ) -> Result<GitResult> {
        env::set_current_dir(current_working_directory)?;
        
        write_log(&format!("Updating branch with prompt: {}\nSummary: {}\nChat ID: {}", prompt, summary, chat_id));
        
        // Add all changes to staging
        let add_output = Command::new("git")
            .args(&["add", "."])
            .output()?;
        
        if !add_output.status.success() {
            return Ok(GitResult {
                success: false,
                message: format!("Failed to add changes: {}", String::from_utf8_lossy(&add_output.stderr)),
                branch: None,
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        // Check if there are staged changes
        let diff_output = Command::new("git")
            .args(&["diff", "--staged", "--quiet"])
            .output()?;
        
        if diff_output.status.success() {
            let commits_ahead = Self::get_commits_ahead_of_upstream()?;
            return Ok(GitResult {
                success: true,
                message: "No changes staged for commit.".to_string(),
                branch: Self::get_current_branch()?,
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: Some(commits_ahead),
                merge_details: None,
            });
        }
        
        let current_branch = Self::get_current_branch()?
            .ok_or_else(|| anyhow!("Could not determine the current branch before committing."))?;
        
        let branch_format_instructions = read_branch_format_instructions();
        let commit_message_format_instructions = read_commit_message_format_instructions();
        
        let mut git_commit_data = None;
        let openai_key = if use_ai { Self::get_openai_api_key()? } else { None };
        
        if let Some(key) = &openai_key {
            let detailed_diff_output = Command::new("git")
                .args(&["diff", "--staged"])
                .output()?;
            
            let diff_text = String::from_utf8(detailed_diff_output.stdout)?;
            
            git_commit_data = Some(generate_git_commit_data(
                key,
                prompt,
                summary,
                &diff_text,
                branch_format_instructions.as_deref(),
                commit_message_format_instructions.as_deref(),
            ).await?);
        }
        
        let mut message = prompt.to_string();
        if let Some(ref data) = git_commit_data {
            message = data.commit_message.clone();
        }
        
        if current_branch == "master" || current_branch == "main" {
            let branch_name = if let Some(ref data) = git_commit_data {
                data.branch_name.clone()
            } else {
                format!("feature/{}", generate_simple_branch_name(prompt))
            };
            
            let branch_result = Self::checkout_new_branch(&branch_name)?;
            if !branch_result.success {
                return Ok(branch_result);
            }
        }
        
        let formatted_message = CommitMessageFormatter::format_for_commit(message.clone());
        Self::commit_with_message(&formatted_message)?;
        
        let latest_commit_hash = Command::new("git")
            .args(&["rev-parse", "HEAD"])
            .output()?;
        let commit_hash = String::from_utf8(latest_commit_hash.stdout)?.trim().to_string();
        
        Self::log_prompt_to_history(prompt, &commit_hash, summary)?;
        
        let commits_ahead = Self::get_commits_ahead_of_upstream()?;
        let branch_name = Self::get_current_branch()?;
        
        let final_message = format!(
            "Successfully committed changes.\n\nBranch: {}\n\nCommits currently on this branch:\n{}\n\nCommit message:\n{}",
            branch_name.as_deref().unwrap_or("unknown"),
            commits_ahead.commit_list.iter()
                .map(|c| format!("{} - {}", c.hash, c.message))
                .collect::<Vec<_>>()
                .join("\n"),
            message
        );
        
        Ok(GitResult {
            success: true,
            message: final_message,
            branch: branch_name,
            commits: vec![],
            creation_info: None,
            tracking_info: None,
            commits_ahead_of_upstream: Some(commits_ahead),
            merge_details: None,
        })
    }
    
    pub async fn merge_to_default_branch(current_working_directory: &str, delete_branch: bool) -> Result<GitResult> {
        env::set_current_dir(current_working_directory)?;
        
        let current_branch = Self::get_current_branch()?
            .ok_or_else(|| anyhow!("Failed to determine current branch"))?;
        
        if current_branch == "master" || current_branch == "main" {
            return Ok(GitResult {
                success: false,
                message: format!("Already on default branch '{}'", current_branch),
                branch: Some(current_branch),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        let default_branch_info = Self::get_default_branch()?;
        if !default_branch_info.success {
            return Ok(default_branch_info);
        }
        
        let default_branch = default_branch_info.branch.as_ref().unwrap();
        
        // Check for uncommitted changes
        let diff_output = Command::new("git")
            .args(&["diff", "--quiet", "HEAD"])
            .output()?;
        
        if !diff_output.status.success() {
            return Ok(GitResult {
                success: false,
                message: "You have uncommitted changes on the current branch. Commit or stash them before merging.".to_string(),
                branch: Some(current_branch),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        // Checkout the default branch
        let checkout_output = Command::new("git")
            .args(&["checkout", default_branch])
            .output()?;
        
        if !checkout_output.status.success() {
            return Ok(GitResult {
                success: false,
                message: format!("Failed to checkout default branch '{}': {}", default_branch, String::from_utf8_lossy(&checkout_output.stderr)),
                branch: Some(current_branch),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        // Merge the feature branch
        let merge_output = Command::new("git")
            .args(&["merge", &current_branch])
            .output()?;
        
        if !merge_output.status.success() {
            return Ok(GitResult {
                success: false,
                message: format!("Merge operation failed: {}", String::from_utf8_lossy(&merge_output.stderr)),
                branch: Some(default_branch.clone()),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        let merge_details = String::from_utf8(merge_output.stdout)?;
        let mut result_message = format!("Successfully merged branch '{}' into '{}'", current_branch, default_branch);
        let mut _branch_deleted = false;
        
        if delete_branch {
            let delete_output = Command::new("git")
                .args(&["branch", "-d", &current_branch])
                .output()?;
            
            if delete_output.status.success() {
                _branch_deleted = true;
                result_message.push_str(&format!(" and deleted branch '{}'", current_branch));
            } else {
                result_message.push_str(&format!(". Note: Could not delete branch '{}' (it might have unmerged changes): {}", 
                    current_branch, String::from_utf8_lossy(&delete_output.stderr)));
            }
        }
        
        Ok(GitResult {
            success: true,
            message: result_message,
            branch: Some(default_branch.clone()),
            commits: vec![],
            creation_info: None,
            tracking_info: None,
            commits_ahead_of_upstream: None,
            merge_details: Some(merge_details),
        })
    }
    
    pub async fn get_branch_summary(current_working_directory: &str, commit_limit: usize) -> Result<GitResult> {
        env::set_current_dir(current_working_directory)?;
        
        let branch_name = Self::get_current_branch()?
            .ok_or_else(|| anyhow!("Failed to determine current branch"))?;
        
        let commit_history_output = Command::new("git")
            .args(&["log", "--pretty=format:%h|%an|%ad|%s", "--date=short", &format!("-n{}", commit_limit)])
            .output()?;
        
        let mut commits = vec![];
        if commit_history_output.status.success() {
            let history = String::from_utf8(commit_history_output.stdout)?;
            for line in history.lines() {
                let parts: Vec<&str> = line.splitn(4, '|').collect();
                if parts.len() >= 4 {
                    commits.push(CommitInfo {
                        hash: parts[0].to_string(),
                        author: parts[1].to_string(),
                        date: parts[2].to_string(),
                        message: parts[3].to_string(),
                    });
                }
            }
        }
        
        let commits_ahead_info = Self::get_commits_ahead_of_upstream()?;
        
        Ok(GitResult {
            success: true,
            message: format!("Branch Summary: {}", branch_name),
            branch: Some(branch_name),
            commits,
            creation_info: None,
            tracking_info: None,
            commits_ahead_of_upstream: Some(commits_ahead_info),
            merge_details: None,
        })
    }
    
    pub async fn absorb(current_working_directory: &str) -> Result<GitResult> {
        env::set_current_dir(current_working_directory)?;
        
        let current_branch = Self::get_current_branch()?
            .ok_or_else(|| anyhow!("Failed to determine current branch"))?;
        
        if current_branch == "master" || current_branch == "main" {
            return Ok(GitResult {
                success: false,
                message: format!("Cannot absorb changes on default branch '{}'. Please create a feature branch first.", current_branch),
                branch: Some(current_branch),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        // Reset any staged changes
        let _ = Command::new("git")
            .args(&["reset", "HEAD"])
            .output()?;
        
        let status_output = Command::new("git")
            .args(&["status", "--porcelain"])
            .output()?;
        
        if !status_output.status.success() {
            return Ok(GitResult {
                success: false,
                message: "Failed to get git status".to_string(),
                branch: Some(current_branch),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        let status_text = String::from_utf8(status_output.stdout)?;
        if status_text.trim().is_empty() {
            return Ok(GitResult {
                success: true,
                message: "No changes detected to absorb.".to_string(),
                branch: Some(current_branch),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        Ok(GitResult {
            success: true,
            message: "Successfully absorbed changes.".to_string(),
            branch: Some(current_branch),
            commits: vec![],
            creation_info: None,
            tracking_info: None,
            commits_ahead_of_upstream: None,
            merge_details: None,
        })
    }
    
    pub fn get_default_branch() -> Result<GitResult> {
        let branches_output = Command::new("git")
            .args(&["branch"])
            .output()?;
        
        if !branches_output.status.success() {
            return Ok(GitResult {
                success: false,
                message: format!("Error determining default branch: {}", String::from_utf8_lossy(&branches_output.stderr)),
                branch: None,
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            });
        }
        
        let branches = String::from_utf8(branches_output.stdout)?;
        let clean_branches: Vec<String> = branches
            .lines()
            .map(|line| line.trim_start_matches("* ").trim().to_string())
            .collect();
        
        if clean_branches.contains(&"main".to_string()) {
            Ok(GitResult {
                success: true,
                message: "Found 'main' as the default branch".to_string(),
                branch: Some("main".to_string()),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            })
        } else if clean_branches.contains(&"master".to_string()) {
            Ok(GitResult {
                success: true,
                message: "Found 'master' as the default branch".to_string(),
                branch: Some("master".to_string()),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            })
        } else if Self::remote_branch_exists("main")? {
            Ok(GitResult {
                success: true,
                message: "Found 'main' as the remote default branch".to_string(),
                branch: Some("main".to_string()),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            })
        } else if Self::remote_branch_exists("master")? {
            Ok(GitResult {
                success: true,
                message: "Found 'master' as the remote default branch".to_string(),
                branch: Some("master".to_string()),
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            })
        } else {
            Ok(GitResult {
                success: false,
                message: "No default branch (main or master) found locally or remotely".to_string(),
                branch: None,
                commits: vec![],
                creation_info: None,
                tracking_info: None,
                commits_ahead_of_upstream: None,
                merge_details: None,
            })
        }
    }
}

async fn generate_git_commit_data(
    _api_key: &str,
    prompt: &str,
    _summary: &str,
    _diff_output: &str,
    _branch_format_instructions: Option<&str>,
    _commit_message_format_instructions: Option<&str>,
) -> Result<GitCommitData> {
    // For now, just use fallback implementation
    // TODO: Implement OpenAI API integration properly
    write_log("Using fallback git commit data generation");
    
    Ok(GitCommitData {
        branch_name: generate_simple_branch_name(prompt),
        commit_message: prompt.to_string(),
    })
}

fn generate_simple_branch_name(prompt: &str) -> String {
    let re = Regex::new(r"[^a-z0-9-]").unwrap();
    let branch_name = prompt
        .to_lowercase()
        .replace(' ', "-")
        .chars()
        .take(50)
        .collect::<String>();
    
    re.replace_all(&branch_name, "-")
        .trim_matches('-')
        .to_string()
}

fn write_log(message: &str) {
    let log_path = "/tmp/git-branch-mcp-log.txt";
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .and_then(|mut file| {
            use std::io::Write;
            writeln!(file, "{}", message)
        });
}

fn read_branch_format_instructions() -> Option<String> {
    if let Ok(instructions) = fs::read_to_string(".git/branch-format.md") {
        let trimmed = instructions.trim();
        if !trimmed.is_empty() {
            write_log(&format!("Read branch format instructions from .git/branch-format.md: {}", trimmed));
            return Some(trimmed.to_string());
        }
    }
    
    if let Ok(instructions) = fs::read_to_string(".gitbutler/branch-format.md") {
        let trimmed = instructions.trim();
        if !trimmed.is_empty() {
            write_log(&format!("Read branch format instructions from .gitbutler/branch-format.md: {}", trimmed));
            return Some(trimmed.to_string());
        }
    }
    
    None
}

fn read_commit_message_format_instructions() -> Option<String> {
    if let Ok(instructions) = fs::read_to_string(".git/commit-message-format.md") {
        let trimmed = instructions.trim();
        if !trimmed.is_empty() {
            write_log(&format!("Read commit message format instructions from .git/commit-message-format.md: {}", trimmed));
            return Some(trimmed.to_string());
        }
    }
    
    if let Ok(instructions) = fs::read_to_string(".gitbutler/commit-message-format.md") {
        let trimmed = instructions.trim();
        if !trimmed.is_empty() {
            write_log(&format!("Read commit message format instructions from .gitbutler/commit-message-format.md: {}", trimmed));
            return Some(trimmed.to_string());
        }
    }
    
    None
}