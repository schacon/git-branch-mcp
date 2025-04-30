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
   * Checks out a new branch. If the branch already exists, it will just check it out.
   * @param {string} branchName - Name of the branch to create and checkout
   * @returns {Object} Result of the branch creation/checkout
   */
  static checkoutNewBranch(branchName) {
    try {
      // Check if branch exists
      const branchExists = execSync(`git show-ref --verify --quiet refs/heads/${branchName}`) === 0;
      
      if (branchExists) {
        // Branch exists, just check it out
        execSync(`git checkout ${branchName}`, { encoding: 'utf8' });
        return {
          success: true,
          message: `Checked out existing branch '${branchName}'`
        };
      } else {
        // Create and checkout new branch
        execSync(`git checkout -b ${branchName}`, { encoding: 'utf8' });
        return {
          success: true,
          message: `Created and checked out new branch '${branchName}'`
        };
      }
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
      
      return {
        success: true,
        message: commitResult,
        branch: Git.getCurrentBranch()
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
} 