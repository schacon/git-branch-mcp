import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { execSync } from 'child_process';
import fs from 'fs';

const GitCommitData = z.object({
  branchName: z.string(),
  commitMessage: z.string()
});

// Add OpenAI API support
async function generateGitCommitData(apiKey, prompt, diffOutput) {
  try {
    const client = new OpenAI({
      apiKey: apiKey
    });

    const response = await client.responses.create({
      model: 'gpt-4o',
      instructions: 'You are a version control assistant that helps with Git branch committing',
      input: [
        { role: "system", content: "Extract the git commit data from the prompt and diff output. Format commit messages with a short summary line, followed by two newlines, then a paragraph explaining WHY the change was needed. Example:\n\nAdd user authentication system\n\nImplemented a secure authentication flow to address increasing security concerns and enable user-specific features that were previously impossible without a proper identity system." },
        {
          role: "user",
          content: `Determine from this AI prompt and diff output what the git commit data should be. The message should be a short summary line, followed by two newlines, then a paragraph explaining WHY the change was needed. The first summary line should be no more than 50 characters. The branch name should be a simple name like "feature/add-user-authentication" or "fix/typo-in-login-page". Here is the data:\n\nPrompt: ${prompt}\n\nDiff:\n\`\`\`\n${diffOutput}\n\`\`\`\n\n`
        },
      ],
      text: {
        format: zodTextFormat(GitCommitData, "gitCommitData"),
      },
    });

    writeLog(`OpenAI Call`);
    writeLog(`branch name: ${response.gitCommitData.branchName}`);
    writeLog(`commit message: ${response.gitCommitData.commitMessage}`);

    return response;
  } catch (error) {
    console.error('Error calling OpenAI API:', error.message);
    // Provide fallback values
    return {
      branchName: generateSimpleBranchName(prompt),
      commitMessage: prompt,
    };
  }
}

// Helper to generate a simple branch name from prompt
function generateSimpleBranchName(prompt) {
  return prompt
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '-') // Remove non-alphanumeric characters except hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim leading/trailing hyphens
    .slice(0, 50); // Limit length
}

function writeLog(message) {
  console.log(message);
  // create the file if it doesn't exist
  if (!fs.existsSync('/tmp/git-branch-mcp-log.txt')) {
    fs.writeFileSync('/tmp/git-branch-mcp-log.txt', '');
  }
  fs.appendFileSync('/tmp/git-branch-mcp-log.txt', message + '\n');
}


export class Git {

  static getCurrentBranch() {
    try {
      return execSyncSafe('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).stdout.trim();
    } catch (error) {
      // Log the error for debugging, but return null as per original logic
      console.error("Error getting current branch:", error.message);
      return null;
    }
  }

  // Add function to check if OpenAI API key is configured
  static getOpenAIApiKey() {
    try {
      const result = execSyncSafe('git config openai.key', { encoding: 'utf8' });
      if (result.status === 0 && result.stdout.trim()) {
        return result.stdout.trim();
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  static remoteBranchExists(branch) {
    try {
      let result = execSyncSafe(`git rev-parse --verify --quiet origin/${branch}`, { stdio: 'ignore' });
      if (result.status === 0) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  static branchExists(branch) {
    try {
      let result = execSyncSafe(`git rev-parse --verify --quiet ${branch}`, { stdio: 'ignore' });
      if (result.status === 0) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  static getCommitsAheadOfUpstream() {
    try {
      // Check which upstream branch exists (origin/main or origin/master)
      let upstreamBranch = null;
      
      // Need to pass repoPath to remoteBranchExists if it uses execSync internally (which it does)
      if (Git.remoteBranchExists('main')) { // remoteBranchExists now handles cwd internally
        upstreamBranch = 'origin/main';
      } else if (Git.remoteBranchExists('master')) { // remoteBranchExists now handles cwd internally
        upstreamBranch = 'origin/master';
      } else if (Git.branchExists('main')) {
        upstreamBranch = 'main';
      } else if (Git.branchExists('master')) {
        upstreamBranch = 'master';
      }

      if (!upstreamBranch) {
        return {
          success: false,
          message: "No origin/main or origin/master branch found"
        };
      }
      
      // Count commits between upstream and HEAD
      const logOutput = execSyncSafe(`git log --oneline ${upstreamBranch}..HEAD`, { encoding: 'utf8' }).stdout.trim();
      const commits = logOutput ? logOutput.split('\\n') : [];
      const commitCount = commits.length;
      
      // Get the commit list with truncated messages
      const commitList = commits.map(commit => {
        const [hash, ...messageParts] = commit.split(' ');
        const message = messageParts.join(' ');
        return { hash, message };
      });
      
      return {
        success: true,
        upstreamBranch,
        commitCount,
        commitList
      };
    } catch (error) {
      return {
        success: false,
        // Include the specific error message, potentially indicating if it's a repo path issue
        message: `Error getting commits ahead of upstream: ${error.message}`
      };
    }
  }

  static checkoutNewBranch(branchName) {
    try {
      // Create and checkout new branch
      execSyncSafe(`git checkout -b ${branchName}`, { encoding: 'utf8' });
      return {
        success: true,
        message: `Created and checked out new branch '${branchName}'`
      };
    } catch (error) {
       // Check if the error is because the branch already exists
      if (error.stderr && error.stderr.includes(`branch '${branchName}' already exists`)) {
         try {
           // If branch exists, just check it out
           execSyncSafe(`git checkout ${branchName}`, { encoding: 'utf8' });
           return {
             success: true,
             message: `Checked out existing branch '${branchName}'`
           };
         } catch (checkoutError) {
           return {
              success: false,
              message: `Failed to checkout existing branch '${branchName}': ${checkoutError.message}`
           };
         }
      }
      // Otherwise, return the original error
      return {
        success: false,
        message: `Failed to create or checkout branch '${branchName}': ${error.message}`
      };
    }
  }

  static commitWithMessage(message) {
    // write the commit message to a temp file
    const tfId = Math.random().toString(36).substring(2, 15);
    const tempFilePath = `.git/gbm/git-branch-mcp-${tfId}.txt`;

    // create the .git/gbm directory if it doesn't exist
    if (!fs.existsSync('.git/gbm')) {
      fs.mkdirSync('.git/gbm');
    }

    fs.writeFileSync(tempFilePath, message);
    execSyncSafe(`git commit -F ${tempFilePath}`, { encoding: 'utf8' });
    // delete the temp file
    fs.unlinkSync(tempFilePath);
  }

  static async updateBranch(currentWorkingDirectory, prompt, useAi = false) {
    try {
      // cd to the current working directory
      process.chdir(currentWorkingDirectory);

      writeLog(`Updating branch with prompt: ${prompt}`);

      // Add all changes to staging
      execSyncSafe('git add .', { encoding: 'utf8' });
      
      // Check if there are staged changes
      const diffOutput = execSyncSafe('git diff --staged --quiet', { encoding: 'utf8', stdio: 'pipe' });

      // If git diff --staged --quiet exits with 1, there are changes. If 0, no changes.
      if (diffOutput.status === 0) {
        return {
          success: true,
          message: "No changes staged for commit.",
          branch: Git.getCurrentBranch(),
          commitsAhead: Git.getCommitsAheadOfUpstream()
        };
      }

      // Get the diff content for OpenAI if API key is available and useAi is true
      let detailedDiffOutput = "";
      const openAIKey = useAi ? Git.getOpenAIApiKey() : null;
      
      // Check if we're on master or main
      const currentBranch = Git.getCurrentBranch();
      
      // Handle case where getCurrentBranch failed
      if (currentBranch === null) {
        return {
          success: false,
          message: "Could not determine the current branch before committing."
        };
      }

      // Generate git commit data with OpenAI if API key is available and useAi is true
      let gitCommitData = null;
      
      if (openAIKey && useAi) {
        detailedDiffOutput = execSyncSafe('git diff --staged', { encoding: 'utf8' }).stdout.trim();
        gitCommitData = await generateGitCommitData(openAIKey, prompt, detailedDiffOutput);
        writeLog(gitCommitData);
      }

      // Generate the commit message
      let message = prompt;
      if (gitCommitData) {
        message = gitCommitData.commitMessage || prompt;
      }

      if (currentBranch === 'master' || currentBranch === 'main') {
        // Generate branch name with OpenAI if API key is available and useAi is true
        let branchName = "";
       
        if (gitCommitData) {
          branchName = gitCommitData.branchName;
        }

        // Fall back to traditional method if OpenAI failed or isn't available or useAi is false
        if (!branchName) {
          branchName = generateSimpleBranchName(prompt);
          // Handle empty branch name after sanitization
          branchName = `feature/${branchName}`;
        }
        
        // checkoutNewBranch handles cwd and checking out existing branches
        const branchResult = Git.checkoutNewBranch(branchName); 
        
        if (!branchResult.success) {
          // Pass the specific error message from checkoutNewBranch
          return { success: false, message: branchResult.message }; 
        }
      }

      Git.commitWithMessage(message);

      // Get commit count info after successful commit
      const commitsAhead = Git.getCommitsAheadOfUpstream(); // getCommitsAheadOfUpstream handles cwd
      writeLog(commitsAhead);
     
      // final message includes: branch name, commits ahead, and commit message
      const finalMessage = `Successfully committed changes.
Branch: ${Git.getCurrentBranch()} 
Commit list:
${commitsAhead.commitList.map(commit => `  ${commit.hash} - ${commit.message}`).join('\n')}
Commit message:
${message}
  `;

      return {
        success: true,
        message: finalMessage, // Include branch switching message if relevant
      };
    } catch (error) {
       // Try to provide a more specific error message
      let errorMessage = `Failed to update branch: ${error.message}`;
       if (error.stderr) {
         errorMessage += `\nStderr: ${error.stderr}`;
       }
       if (error.stdout) {
         errorMessage += `\nStdout: ${error.stdout}`;
       }
      return {
        success: false,
        message: errorMessage
      };
    }
  }

  static getDefaultBranch() {
    try {
      // Check for local branches first
      const branchesOutput = execSyncSafe('git branch', { encoding: 'utf8' }).stdout.trim();
      const branches = branchesOutput.trim().split('\\n');
      
      // Remove the asterisk and spaces from branch names
      const cleanBranches = branches.map(branch => branch.replace(/^\\*?\\s*/, ''));
      
      if (cleanBranches.includes('main')) {
        return {
          success: true,
          branch: 'main',
          message: "Found 'main' as the default branch"
        };
      } else if (cleanBranches.includes('master')) {
        return {
          success: true,
          branch: 'master',
          message: "Found 'master' as the default branch"
        };
      }
      
      // If no local branch found, check remote branches
      // remoteBranchExists handles cwd internally
      if (Git.remoteBranchExists('main')) { 
        return {
          success: true,
          branch: 'main',
          remote: true,
          message: "Found 'main' as the remote default branch"
        };
      } else if (Git.remoteBranchExists('master')) {
        return {
          success: true,
          branch: 'master',
          remote: true,
          message: "Found 'master' as the remote default branch"
        };
      }
      
      return {
        success: false,
        message: "No default branch (main or master) found locally or remotely"
      };
    } catch (error) {
      return {
        success: false,
        message: `Error determining default branch: ${error.message}`
      };
    }
  }

  static mergeToDefaultBranch(currentWorkingDirectory, deleteBranch = true) {
    let originalBranch; // Keep track of the branch to potentially delete later
    try {
      // cd to the current working directory
      process.chdir(currentWorkingDirectory);

      // Get current branch name - getCurrentBranch handles cwd
      const currentBranch = Git.getCurrentBranch(); 
      originalBranch = currentBranch; // Store it for potential deletion
      
      if (!currentBranch) {
        return {
          success: false,
          message: "Failed to determine current branch"
        };
      }
      
      // Check if we're already on master or main
      if (currentBranch === 'master' || currentBranch === 'main') {
        return {
          success: false,
          message: `Already on default branch '${currentBranch}'`
        };
      }
      
      // Find the default branch - getDefaultBranch handles cwd
      const defaultBranchInfo = Git.getDefaultBranch(); 
      
      if (!defaultBranchInfo.success) {
        return defaultBranchInfo; // Return the error from getDefaultBranch
      }
      
      const defaultBranch = defaultBranchInfo.branch;
      
      // Check if there are any uncommitted changes on the current branch
      try {
        execSyncSafe('git diff --quiet HEAD', { stdio: 'ignore' });
      } catch (error) {
        // Error (non-zero exit code) means there ARE uncommitted changes
        return {
          success: false,
          message: "You have uncommitted changes on the current branch. Commit or stash them before merging."
        };
      }
      
      // Checkout the default branch
      try {
        execSyncSafe(`git checkout ${defaultBranch}`, { encoding: 'utf8' });
      } catch (error) {
        // If the branch doesn't exist locally but exists remotely, check it out from remote
        if (defaultBranchInfo.remote && error.stderr && error.stderr.includes(`pathspec '${defaultBranch}' did not match`)) {
           try {
            execSyncSafe(`git checkout -b ${defaultBranch} origin/${defaultBranch}`, { encoding: 'utf8' });
           } catch (remoteCheckoutError) {
             return {
               success: false,
               message: `Failed to checkout remote branch ${defaultBranch} from origin: ${remoteCheckoutError.message}`
             };
           }
        } else {
          // Otherwise, it's some other checkout error
          return {
            success: false,
            message: `Failed to checkout default branch '${defaultBranch}': ${error.message}`
          };
        }
      }
      
      // Merge the feature branch (originalBranch) into the now current defaultBranch
      const mergeOutput = execSyncSafe(`git merge ${originalBranch}`, { encoding: 'utf8' }).stdout.trim();
      
      let resultMessage = `Successfully merged branch '${originalBranch}' into '${defaultBranch}'`;
      let branchDeleted = false;
      
      // Delete the branch if requested
      if (deleteBranch) {
        try {
          execSyncSafe(`git branch -d ${originalBranch}`, { encoding: 'utf8' });
          branchDeleted = true;
          resultMessage += ` and deleted branch '${originalBranch}'`;
        } catch (error) {
          // Add a note if deletion failed, but don't mark the overall operation as failed
          resultMessage += `. Note: Could not delete branch '${originalBranch}' (it might have unmerged changes): ${error.message}`;
        }
      }
      
      return {
        success: true,
        message: resultMessage,
        mergeDetails: mergeOutput,
        defaultBranch,
        originalBranch: originalBranch,
        branchDeleted: branchDeleted
      };

    } catch (error) {
       // Attempt to switch back to the original branch if merge failed mid-operation
       if (originalBranch && Git.getCurrentBranch() !== originalBranch) {
         try {
           execSyncSafe(`git checkout ${originalBranch}`, { encoding: 'utf8' });
           console.warn(`Switched back to original branch '${originalBranch}' after merge failure.`);
         } catch (switchBackError) {
           console.error(`Failed to switch back to original branch '${originalBranch}' after merge failure: ${switchBackError.message}`);
         }
       }
      return {
        success: false,
        message: `Merge operation failed: ${error.message}`
      };
    }
  }

  static getBranchSummary(currentWorkingDirectory, commitLimit = 10) {
    try {
      // cd to the current working directory
      process.chdir(currentWorkingDirectory);

      // Get current branch name - getCurrentBranch handles cwd
      const branchName = Git.getCurrentBranch(); 
      
      if (!branchName) {
        return {
          success: false,
          message: "Failed to determine current branch"
        };
      }
      
      // Get commit history for this branch
      const commitHistory = execSyncSafe(`git log --pretty=format:"%h|%an|%ad|%s" --date=short -n ${commitLimit}`, 
        { encoding: 'utf8' }).stdout.trim();
      
      // Parse commit history into structured data
      let commits = [];
      if (commitHistory) { // Handle case where there are no commits
          commits = commitHistory.split('\\n').map(commit => {
          const parts = commit.split('|');
          // Handle potential '|' in commit messages
          const hash = parts[0];
          const author = parts[1];
          const date = parts[2];
          const message = parts.slice(3).join('|'); 
          return { hash, author, date, message };
        });
      }
      
      // Get branch creation date (usually the oldest commit unique to this branch)
      let creationInfo = null;
      try {
        // Try to find the branch creation point
        // getDefaultBranch handles cwd
        const defaultBranchInfo = Git.getDefaultBranch(); 
        if (defaultBranchInfo.success) {
          const defaultBranch = defaultBranchInfo.branch;
          // Ensure merge-base doesn't fail if default branch doesn't exist locally yet
          // Fetch might be needed here in a more complex scenario
          const mergeBase = execSyncSafe(`git merge-base ${branchName} ${defaultBranch}`, { encoding: 'utf8' }).stdout.trim();
          // Use rev-list to find the first commit after the merge base
          const firstUniqueCommitOutput = execSyncSafe(`git rev-list --first-parent --reverse ${mergeBase}..${branchName}`, 
            { encoding: 'utf8' }).stdout.trim();
          
          const firstUniqueCommit = firstUniqueCommitOutput.trim().split('\\n')[0]; // Get the first line (oldest commit)
            
          if (firstUniqueCommit) {
            const creationDate = execSyncSafe(`git show -s --format=%ad --date=short ${firstUniqueCommit}`, 
              { encoding: 'utf8' }).stdout.trim();
            creationInfo = {
              date: creationDate,
              commitHash: firstUniqueCommit
            };
          } else {
             // Branch might be identical to default branch or hasn't diverged
             creationInfo = { date: "Same as " + defaultBranch, commitHash: mergeBase };
          }
        }
      } catch (error) {
        // Creation info is optional, log error and continue
        console.warn(`Could not determine branch creation date: ${error.message}`);
        creationInfo = null;
      }
      
      // Get branch tracking information
      let trackingInfo = null;
      try {
        const trackingOutput = execSyncSafe(`git for-each-ref --format="%(upstream:short) %(upstream:track)" refs/heads/${branchName}`, 
          { encoding: 'utf8' }).stdout.trim();
        // Check for empty output or output starting with space (indicates no upstream)
        if (trackingOutput && trackingOutput.trim() && !trackingOutput.startsWith(' ')) {
          // Split carefully, as %(upstream:track) might be empty
          const parts = trackingOutput.trim().split(' ');
          const upstream = parts[0];
          const behindAheadText = parts.length > 1 ? parts.slice(1).join(' ') : '';
          
          let behind = 0;
          let ahead = 0;
          
          if (behindAheadText) {
             // Remove brackets if present, e.g., "[ahead 1, behind 2]"
            const behindAhead = behindAheadText.replace(/[\[\]]/g, ''); 
            const behindMatch = behindAhead.match(/behind\\s+(\\d+)/);
            const aheadMatch = behindAhead.match(/ahead\\s+(\\d+)/);
            
            if (behindMatch) behind = parseInt(behindMatch[1], 10);
            if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          }
          
          trackingInfo = {
            upstream,
            behind,
            ahead
          };
        }
      } catch (error) {
        // Tracking info is optional, log error and continue
        console.warn(`Could not get tracking info for branch ${branchName}: ${error.message}`);
        trackingInfo = null;
      }
      
      // Get commits ahead of upstream main/master - getCommitsAheadOfUpstream handles cwd
      const commitsAheadInfo = Git.getCommitsAheadOfUpstream(); 
      
      return {
        success: true,
        branch: branchName,
        commits,
        creationInfo,
        trackingInfo,
        // Provide clearer fallback if commitsAheadInfo failed
        commitsAheadOfUpstream: commitsAheadInfo.success ? commitsAheadInfo : { success: false, message: commitsAheadInfo.message || "Failed to get upstream comparison." } 
      };
    } catch (error) {
      // Catch errors from getGitRepoPath or other unexpected errors
      return {
        success: false,
        message: `Error getting branch summary: ${error.message}`
      };
    }
  }
}

function execSyncSafe(cmd, opts = {}) {
  writeLog(`Executing: ${cmd}`);
  try {
    const out = execSync(cmd, { encoding: 'utf8', ...opts });
    return { status: 0, stdout: out, stderr: '' };
  } catch (err) {
    // `err` is a ChildProcessError – keep the information but don't re-throw.
    return {
      status: err.status,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
      error: err                      // if callers want the raw error object
    };
  }
} 