import { execSync } from 'child_process';

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

  static updateBranch(currentWorkingDirectory, summary) {
    try {
      // cd to the current working directory
      process.chdir(currentWorkingDirectory);

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

      const message = summary || "Update branch with latest changes";
      
      // Check if we're on master or main
      const currentBranch = Git.getCurrentBranch(); // getCurrentBranch handles cwd
      
      // Handle case where getCurrentBranch failed
       if (currentBranch === null) {
         return {
           success: false,
           message: "Could not determine the current branch before committing."
         };
       }

      let branchMessage = ''; // To store messages about branch switching

      if (currentBranch === 'master' || currentBranch === 'main') {
        // Create a new feature branch based on the summary
        const safeBranchName = summary
          .toLowerCase()
          .replace(/\\s+/g, '-') // Replace spaces with hyphens
          .replace(/[^a-z0-9-]/g, '-') // Remove non-alphanumeric characters except hyphens
          .replace(/-+/g, '-') // Collapse multiple hyphens
          .replace(/^-|-$/g, '') // Trim leading/trailing hyphens
          .slice(0, 50); // Limit length
        
        // Handle empty branch name after sanitization
        const branchName = `feature/${safeBranchName || 'new-feature'}`; 
        
        // checkoutNewBranch handles cwd and checking out existing branches
        const branchResult = Git.checkoutNewBranch(branchName); 
        
        if (!branchResult.success) {
          // Pass the specific error message from checkoutNewBranch
          return { success: false, message: branchResult.message }; 
        }
        // Store the message from checkoutNewBranch to include in the final output
        branchMessage = branchResult.message; 
      }

      // Commit the changes - Ensure message is properly escaped for the command line
      const commitMessage = message.replace(/"/g, '\\"'); // Basic escaping for double quotes
      execSyncSafe(`git commit -m "${commitMessage}"`, { encoding: 'utf8' });
      
      // Get commit count info after successful commit
      const commitsAhead = Git.getCommitsAheadOfUpstream(); // getCommitsAheadOfUpstream handles cwd
      
      const finalMessage = branchMessage ? `${branchMessage}. Successfully committed changes.` : 'Successfully committed changes.';

      return {
        success: true,
        message: finalMessage, // Include branch switching message if relevant
        branch: Git.getCurrentBranch(),
        // Ensure commitsAhead is attached correctly, handling potential failures
        commitsAhead: commitsAhead.success ? commitsAhead : { success: false, message: commitsAhead.message || "Failed to get commits ahead info." } 
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

  /**
   * Determines which default branch (main or master) exists in the repository
   * @returns {Object} Information about the default branch
   */
  static getDefaultBranch() {
    let repoPath;
    try {
      // cd to the current working directory
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

  /**
   * Merges the current branch into the default branch (main or master) and optionally deletes the current branch
   * @param {boolean} deleteBranch - Whether to delete the current branch after merging
   * @param {string} currentWorkingDirectory - Current working directory
   * @returns {Object} Result of the merge operation
   */
  static mergeToDefaultBranch(currentWorkingDirectory, deleteBranch = true) {
    let repoPath;
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

  /**
   * Gets a summary of the current branch including name, last commits, and creation date
   * @param {number} commitLimit - Maximum number of commits to include in the summary
   * @returns {Object} Branch summary information
   */
  static getBranchSummary(currentWorkingDirectory, commitLimit = 10) {
    let repoPath;
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