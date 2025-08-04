mod git_utils;
mod commit_message_formatter;
mod mcp_server;

use git_utils::Git;
use mcp_server::{McpServer, ToolRequest, ToolResponse};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mut server = McpServer::new("Git Branch MCP", "1.0.0");
    
    // Register tools
    server.register_tool(
        "git.updateBranch",
        "Update commits on the current branch based on the prompt used to modify the codebase and a summary of the changes made. The chatTitle should be the title that the agent is using to describe the chat.",
        update_branch_handler,
    );
    
    server.register_tool(
        "git.integrateBranch",
        "Merge the current branch into the default branch (main or master) and optionally delete the current branch",
        integrate_branch_handler,
    );
    
    server.register_tool(
        "git.summarizeBranch",
        "Shows a list of the current commits on the active branch and what the branch is named",
        summarize_branch_handler,
    );
    
    server.register_tool(
        "git.absorb",
        "Intelligently absorbs uncommitted changes into appropriate existing commits as fixup commits",
        absorb_handler,
    );
    
    // Start the server with stdio transport
    server.run_stdio().await?;
    
    Ok(())
}

async fn update_branch_handler(request: ToolRequest) -> anyhow::Result<ToolResponse> {
    let full_prompt = request.arguments.get("fullPrompt")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing fullPrompt parameter"))?;
    
    let chat_title = request.arguments.get("chatTitle")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing chatTitle parameter"))?;
    
    let changes_summary = request.arguments.get("changesSummary")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing changesSummary parameter"))?;
    
    let current_working_directory = request.arguments.get("currentWorkingDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing currentWorkingDirectory parameter"))?;
    
    let result = Git::update_branch(
        current_working_directory,
        full_prompt,
        changes_summary,
        chat_title,
        true,
    ).await?;
    
    if result.success {
        Ok(ToolResponse::text(result.message))
    } else {
        Ok(ToolResponse::text(format!(
            "Failed to update branch: {}. Current working directory: {}",
            result.message,
            std::env::current_dir()?.display()
        )))
    }
}

async fn integrate_branch_handler(request: ToolRequest) -> anyhow::Result<ToolResponse> {
    let delete_branch = request.arguments.get("deleteBranch")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    
    let current_working_directory = request.arguments.get("currentWorkingDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing currentWorkingDirectory parameter"))?;
    
    let result = Git::merge_to_default_branch(current_working_directory, delete_branch).await?;
    
    if result.success {
        let mut message = result.message.clone();
        if let Some(merge_details) = &result.merge_details {
            message.push_str(&format!("\n\nMerge details: {}", merge_details));
        }
        Ok(ToolResponse::text(message))
    } else {
        Ok(ToolResponse::text(format!("Failed to merge to default branch: {}", result.message)))
    }
}

async fn summarize_branch_handler(request: ToolRequest) -> anyhow::Result<ToolResponse> {
    let commit_limit = request.arguments.get("commitLimit")
        .and_then(|v| v.as_u64())
        .unwrap_or(10) as usize;
    
    let current_working_directory = request.arguments.get("currentWorkingDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing currentWorkingDirectory parameter"))?;
    
    let result = Git::get_branch_summary(current_working_directory, commit_limit).await?;
    
    if result.success {
        let mut message = format!("# Branch Summary: {}\n\n", result.branch.as_deref().unwrap_or("unknown"));
        
        if let Some(creation_info) = &result.creation_info {
            message.push_str(&format!("**Created on:** {}\n\n", creation_info.date));
        }
        
        if let Some(tracking_info) = &result.tracking_info {
            message.push_str(&format!("**Tracking:** {}", tracking_info.upstream));
            if tracking_info.ahead > 0 || tracking_info.behind > 0 {
                message.push('(');
                if tracking_info.ahead > 0 {
                    message.push_str(&format!("{} commit{} ahead", 
                        tracking_info.ahead,
                        if tracking_info.ahead != 1 { "s" } else { "" }
                    ));
                }
                if tracking_info.ahead > 0 && tracking_info.behind > 0 {
                    message.push_str(", ");
                }
                if tracking_info.behind > 0 {
                    message.push_str(&format!("{} commit{} behind", 
                        tracking_info.behind,
                        if tracking_info.behind != 1 { "s" } else { "" }
                    ));
                }
                message.push(')');
            }
            message.push_str("\n\n");
        }
        
        if let Some(commits_ahead) = &result.commits_ahead_of_upstream {
            if commits_ahead.success {
                message.push_str(&format!(
                    "**Ahead of {}:** {} commit{}\n\n",
                    commits_ahead.upstream_branch,
                    commits_ahead.commit_count,
                    if commits_ahead.commit_count != 1 { "s" } else { "" }
                ));
            }
        }
        
        if !result.commits.is_empty() {
            message.push_str("## Recent Commits\n\n");
            for commit in &result.commits {
                message.push_str(&format!(
                    "- `{}` ({}) by {}: {}\n",
                    commit.hash, commit.date, commit.author, commit.message
                ));
            }
        } else {
            message.push_str("No commits found in this branch.");
        }
        
        Ok(ToolResponse::text(message))
    } else {
        Ok(ToolResponse::text(format!("Failed to get branch summary: {}", result.message)))
    }
}

async fn absorb_handler(request: ToolRequest) -> anyhow::Result<ToolResponse> {
    let current_working_directory = request.arguments.get("currentWorkingDirectory")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing currentWorkingDirectory parameter"))?;
    
    let result = Git::absorb(current_working_directory).await?;
    
    if result.success {
        Ok(ToolResponse::text(result.message))
    } else {
        Ok(ToolResponse::text(format!("Failed to absorb changes: {}", result.message)))
    }
}