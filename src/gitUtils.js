import { execSync } from 'child_process';

/**
 * Utility class for Git operations
 */
export class Git {
  /**
   * Get the path to the current git repository
   * @returns {string} Path to the current git repository or error message
   */
  static getGitRepoPath() {
    try {
      return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    } catch (error) {
      return "Not a git repository";
    }
  }

  /**
   * Gets the current branch name
   * @returns {string} Current branch name
   */
  static getCurrentBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Checks if a remote branch exists
   * @param {string} branch - Branch name to check
   * @returns {boolean} True if the branch exists
   */
  static remoteBranchExists(branch) {
    try {
      execSync(`git rev-parse --verify --quiet origin/${branch}`, { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets number of commits between the current HEAD and origin/main or origin/master
   * @returns {Object} Information about commits ahead of upstream
   */
  static getCommitsAheadOfUpstream() {
    try {
      // Check which upstream branch exists (origin/main or origin/master)
      let upstreamBranch = null;
      
      if (Git.remoteBranchExists('main')) {
        upstreamBranch = 'origin/main';
      } else if (Git.remoteBranchExists('master')) {
        upstreamBranch = 'origin/master';
      }
      
      if (!upstreamBranch) {
        return {
          success: false,
          message: "No origin/main or origin/master branch found"
        };
      }
      
      // Count commits between upstream and HEAD
      const logOutput = execSync(`git log --oneline ${upstreamBranch}..HEAD`, { encoding: 'utf8' }).trim();
      const commits = logOutput ? logOutput.split('\n') : [];
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
        message: error.message
      };
    }
  }

  /**
   * Checks out a new branch. If the branch already exists, it will just check it out.
   * @param {string} branchName - Name of the branch to create and checkout
   * @returns {Object} Result of the branch creation/checkout
   */
  static checkoutNewBranch(branchName) {
    try {
      // Create and checkout new branch
      execSync(`git checkout -b ${branchName}`, { encoding: 'utf8' });
      return {
        success: true,
        message: `Created and checked out new branch '${branchName}'`
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Commits all changes to the current branch.
   * If the current branch is master or main, creates a new feature branch instead.
   * @param {string} message - Commit message
   * @returns {Object} Result of the commit operation
   */
  static updateBranch(summary) {
    try {
      // Add all changes to staging
      const addResult = execSync('git add .', { encoding: 'utf8' }).trim();
      
      const message = summary || "Update branch with latest changes";
      
      // Check if we're on master or main
      const currentBranch = Git.getCurrentBranch();
      if (currentBranch === 'master' || currentBranch === 'main') {
        // Create a new feature branch based on the summary
        const safeBranchName = summary
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 20);
        
        const branchName = `feature/${safeBranchName}`;
        const branchResult = Git.checkoutNewBranch(branchName);
        
        if (!branchResult.success) {
          return branchResult;
        }
      }

      // Commit the changes
      const commitResult = execSync(`git commit -m "${message}"`, { encoding: 'utf8' }).trim();
      
      // Get commit count info
      const commitsAhead = Git.getCommitsAheadOfUpstream();
      
      return {
        success: true,
        message: commitResult,
        branch: Git.getCurrentBranch(),
        commitsAhead: commitsAhead.success ? commitsAhead : null
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
} 