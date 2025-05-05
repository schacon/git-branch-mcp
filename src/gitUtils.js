import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { execSync } from 'child_process';
import fs from 'fs';
import CommitMessageFormatter from './commitMessageFormatter.js';

const GitCommitData = z.object({
  branchName: z.string(),
  commitMessage: z.string()
});

const GitAbsorbSuggestion = z.object({
  absorbFiles: z.array(z.object({
    commitHash: z.string(),
    files: z.array(z.string())
  }))
});

// Add OpenAI API support
async function generateGitCommitData(apiKey, prompt, summary, diffOutput, branchFormatInstructions = null, commitMessageFormatInstructions = null) {
  try {
    const client = new OpenAI({
      apiKey: apiKey
    });

    // Default branch name instructions
    const defaultBranchInstructions = "The branch name should be a simple name like \"feature/add-user-authentication\" or \"fix/typo-in-login-page\"";
    
    // Default commit message format instructions
    const defaultCommitMessageInstructions = `The message should be a short summary line, followed by two newlines, then a short paragraph explaining WHY the change was needed based off the prompt. 

- If a summary is provided, use it to create more short paragraphs or bullet points explaining the changes.
- The first summary line should be no more than 50 characters.
- Use the imperative mood for the message (e.g. "Add user authentication system" instead of "Adding user authentication system").
    
Here is an example of a good commit message:
    
bundle-uri: copy all bundle references ino the refs/bundle space

When downloading bundles via the bundle-uri functionality, we only copy the
references from refs/heads into the refs/bundle space. I'm not sure why this
refspec is hardcoded to be so limited, but it makes the ref negotiation on
the subsequent fetch suboptimal, since it won't use objects that are
referenced outside of the current heads of the bundled repository.

This change to copy everything in refs/ in the bundle to refs/bundles/
significantly helps the subsequent fetch, since nearly all the references
are now included in the negotiation.

The update to the bundle-uri unbundling refspec puts all the heads from a
bundle file into refs/bundle/heads instead of directly into refs/bundle/ so
the tests also need to be updated to look in the new heirarchy.`;

    // Use custom instructions if provided, otherwise use default
    const branchInstructions = branchFormatInstructions || defaultBranchInstructions;
    const commitMessageInstructions = commitMessageFormatInstructions || defaultCommitMessageInstructions;
    
    const response = await client.responses.create({
      model: 'gpt-4o',
      instructions: 'You are a version control assistant that helps with Git branch committing',
      input: [
        {
          role: "system", content: "Extract the git commit data from the prompt, summary and diff output. Return the branch name and commit message." },
        {
          role: "user",
          content: `Determine from this AI prompt, summary and diff output what the git commit data should be.\n\n${commitMessageInstructions}\n\n${branchInstructions}\n\nHere is the data:\n\nPrompt: ${prompt}\n\nSummary: ${summary}\n\nDiff:\n\`\`\`\n${diffOutput}\n\`\`\`\n\n`
        },
      ],
      text: {
        format: zodTextFormat(GitCommitData, "gitCommitData"),
      },
    });

    writeLog(`OpenAI Call`);
    // pretty print the response
    const prettyResponse = JSON.stringify(response, null, 2);
    writeLog(prettyResponse);

    const gitCommitData = JSON.parse(response.output_text);

    writeLog(`branch name: ${gitCommitData.branchName}`);
    writeLog(`commit message: ${gitCommitData.commitMessage}`);

    return gitCommitData;
  } catch (error) {
    writeLog('Error calling OpenAI API:', error.message);
    // Provide fallback values
    return {
      branchName: generateSimpleBranchName(prompt),
      commitMessage: prompt,
    };
  }
}

async function getAiAbsorbSuggestion(apiKey, commitsOutput, commitHashes, modifiedFiles) {
  const client = new OpenAI({
    apiKey: apiKey
  });

  const modifiedFilesString = modifiedFiles.map(file => `- ${file}`).join("\n");
  const commitHashesString = commitHashes.map(hash => `- ${hash}`).join("\n");

const aiPrompt =        `Analyze the git commit history and suggest which modified files should be absorbed into which commits.
        
For each modified file, determine which commit it should be associated with as a fixup.

Git commit history: 
${commitsOutput}

Git commit hashes:
${commitHashesString}

Modified files: 
${modifiedFilesString}

Return a JSON object with an 'absorbFiles' array containing objects with 'commitHash' and 'files' properties where each file is one of the modified files in the modifiedFiles array and each commitHash is one of the commit hashes in the commitsOutput array.`
  console.log(aiPrompt);

  const response = await client.responses.create({
    model: 'gpt-4o',
    instructions: 'You are a version control assistant that helps with Git branch committing',
    input: [
      {
        role: "system", content: "Given the git commit history and the modified files, return a list of files to absorb into the commit history." },
      {
        role: "user",
        content: aiPrompt
      },
    ],
    text: {
      format: zodTextFormat(GitAbsorbSuggestion, "gitAbsorbSuggestion"),
    },
  });

  const gitAbsorbSuggestion = JSON.parse(response.output_text);

  return gitAbsorbSuggestion;
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
  // create the file if it doesn't exist
  if (!fs.existsSync('/tmp/git-branch-mcp-log.txt')) {
    fs.writeFileSync('/tmp/git-branch-mcp-log.txt', '');
  }
  fs.appendFileSync('/tmp/git-branch-mcp-log.txt', message + '\n');
}

// Function to read branch format instructions from multiple locations with precedence
function readBranchFormatInstructions() {
  try {
    // First check for personal override in .git directory (with .md extension)
    if (fs.existsSync('.git/branch-format.md')) {
      const instructions = fs.readFileSync('.git/branch-format.md', 'utf8').trim();
      writeLog(`Read branch format instructions from .git/branch-format.md: ${instructions}`);
      return instructions.length > 0 ? instructions : null;
    }
    
    // Finally check for version-controlled file in .gitbutler directory
    if (fs.existsSync('.gitbutler/branch-format.md')) {
      const instructions = fs.readFileSync('.gitbutler/branch-format', 'utf8').trim();
      writeLog(`Read branch format instructions from .gitbutler/branch-format: ${instructions}`);
      return instructions.length > 0 ? instructions : null;
    }
    
    return null;
  } catch (error) {
    writeLog(`Error reading branch format file: ${error.message}`);
    return null;
  }
}

// Function to read commit message format instructions from multiple locations with precedence
function readCommitMessageFormatInstructions() {
  try {
    // First check for personal override in .git directory (with .md extension)
    if (fs.existsSync('.git/commit-message-format.md')) {
      const instructions = fs.readFileSync('.git/commit-message-format.md', 'utf8').trim();
      writeLog(`Read commit message format instructions from .git/commit-message-format.md: ${instructions}`);
      return instructions.length > 0 ? instructions : null;
    }
    
    // Finally check for version-controlled file in .gitbutler directory
    if (fs.existsSync('.gitbutler/commit-message-format.md')) {
      const instructions = fs.readFileSync('.gitbutler/commit-message-format.md', 'utf8').trim();
      writeLog(`Read commit message format instructions from .gitbutler/commit-message-format.md: ${instructions}`);
      return instructions.length > 0 ? instructions : null;
    }
    
    return null;
  } catch (error) {
    writeLog(`Error reading commit message format file: ${error.message}`);
    return null;
  }
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

  static getUpstreamBranch() {
    try {
      let upstreamBranch = null;
      if (Git.remoteBranchExists('main')) { // remoteBranchExists now handles cwd internally
        upstreamBranch = 'origin/main';
      } else if (Git.remoteBranchExists('master')) { // remoteBranchExists now handles cwd internally
        upstreamBranch = 'origin/master';
      } else if (Git.branchExists('main')) {
        upstreamBranch = 'main';
      } else if (Git.branchExists('master')) {
        upstreamBranch = 'master';
      }
      return upstreamBranch;
    } catch (error) {
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
      let upstreamBranch = Git.getUpstreamBranch();
      
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

  static async updateBranch(currentWorkingDirectory, prompt, summary, useAi = false) {
    try {
      // cd to the current working directory
      process.chdir(currentWorkingDirectory);

      writeLog(`Updating branch with prompt: ${prompt}\nSummary: ${summary}`);

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

      // Read custom branch format instructions if available
      const branchFormatInstructions = readBranchFormatInstructions();
      
      // Read custom commit message format instructions if available
      const commitMessageFormatInstructions = readCommitMessageFormatInstructions();

      // Generate git commit data with OpenAI if API key is available and useAi is true
      let gitCommitData = null;
      
      if (openAIKey && useAi) {
        detailedDiffOutput = execSyncSafe('git diff --staged', { encoding: 'utf8' }).stdout.trim();
        gitCommitData = await generateGitCommitData(
          openAIKey, 
          prompt,
          summary,
          detailedDiffOutput, 
          branchFormatInstructions, 
          commitMessageFormatInstructions
        );
        writeLog(`branch name: ${gitCommitData.branchName}`);
        writeLog(`commit message: ${gitCommitData.commitMessage}`);
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

      const formattedMessage = CommitMessageFormatter.formatForCommit(message);
      Git.commitWithMessage(formattedMessage);

      // Get commit count info after successful commit
      const commitsAhead = Git.getCommitsAheadOfUpstream(); // getCommitsAheadOfUpstream handles cwd
      writeLog(commitsAhead);
    
      const branchName = Git.getCurrentBranch();
      // final message includes: branch name, commits ahead, and commit message
      const finalMessage = `Successfully committed changes.

Branch: ${branchName}

Commits currently on this branch:
${commitsAhead.commitList.map(commit => `${commit.hash} - ${commit.message}`).join('\n')}

Commit message:
${message}
  `;

      return {
        success: true,
        branchName: branchName,
        message: finalMessage,
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
      
      // Create a more user-friendly message similar to updateBranch
      let finalMessage = `Branch Summary: ${branchName}\n`;
      
      // Add creation info if available
      if (creationInfo && creationInfo.date) {
        finalMessage += `\nCreated on: ${creationInfo.date}`;
      }
      
      // Add tracking info if available
      if (trackingInfo) {
        finalMessage += `\nTracking: ${trackingInfo.upstream}`;
        if (trackingInfo.ahead > 0 || trackingInfo.behind > 0) {
          finalMessage += ` (`;
          if (trackingInfo.ahead > 0) {
            finalMessage += `ahead ${trackingInfo.ahead}`;
            if (trackingInfo.behind > 0) finalMessage += ', ';
          }
          if (trackingInfo.behind > 0) {
            finalMessage += `behind ${trackingInfo.behind}`;
          }
          finalMessage += `)`;
        }
      }
      
      // Add commits ahead of upstream info
      if (commitsAheadInfo.success) {
        if (commitsAheadInfo.commitCount > 0) {
          finalMessage += `\n\nAhead of ${commitsAheadInfo.upstreamBranch}: ${commitsAheadInfo.commitCount} commit${commitsAheadInfo.commitCount !== 1 ? 's' : ''}`;
          finalMessage += `\n\nCommits different from ${commitsAheadInfo.upstreamBranch}:`;
          commitsAheadInfo.commitList.forEach(commit => {
            finalMessage += `\n  ${commit.hash} - ${commit.message}`;
          });
        } else {
          finalMessage += `\n\nNo commits ahead of ${commitsAheadInfo.upstreamBranch}`;
        }
      }
      
      // Add recent commits section
      if (commits.length > 0) {
        finalMessage += `\n\nRecent Commits:`;
        commits.slice(0, Math.min(5, commits.length)).forEach(commit => {
          finalMessage += `\n- \`${commit.hash}\` (${commit.date}) by ${commit.author}: ${commit.message}`;
        });
        
        if (commits.length > 5) {
          finalMessage += `\n... and ${commits.length - 5} more commits`;
        }
      } else {
        finalMessage += `\n\nNo commits found on this branch`;
      }
      
      return {
        success: true,
        message: finalMessage,
        branch: branchName,
        commits,
        creationInfo,
        trackingInfo,
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

  static async absorb(currentWorkingDirectory) {
    try {
      // cd to the current working directory
      process.chdir(currentWorkingDirectory);

      // Get current branch name
      const currentBranch = Git.getCurrentBranch();
      
      if (!currentBranch) {
        return {
          success: false,
          message: "Failed to determine current branch"
        };
      }
      
      // Check if we're on master or main
      if (currentBranch === 'master' || currentBranch === 'main') {
        return {
          success: false,
          message: `Cannot absorb changes on default branch '${currentBranch}'. Please create a feature branch first.`
        };
      }

      // unstage anything that is staged
      execSyncSafe('git reset HEAD', { encoding: 'utf8' });
      
      // Get status to see which files are modified
      const statusOutput = execSyncSafe('git status --porcelain', { encoding: 'utf8' }).stdout.trim();
      
      if (!statusOutput) {
        return {
          success: true,
          message: "No changes detected to absorb.",
          appliedFixups: 0
        };
      }
      
      // Parse the status output to get modified files
      const modifiedFiles = [];
      const statusLines = statusOutput.split('\n');
      
      for (const line of statusLines) {
        if (line.trim()) {
          const status = line.substring(0, 2).trim();
          const filePath = line.substring(2).trim();
          
          // Handle renamed files that appear as "R old -> new"
          let actualPath = filePath;
          if (filePath.includes(' -> ')) {
            actualPath = filePath.split(' -> ')[1];
          }
          
          modifiedFiles.push(actualPath);
        }
      }
     
      const upstreamBranch = Git.getUpstreamBranch(currentBranch);

      // Get number of commits
      const commitHashes = execSyncSafe(`git rev-list ${upstreamBranch}..HEAD`, 
        { encoding: 'utf8' }).stdout.trim();
      
      const commitHashesArray = commitHashes.split('\n');
      const commitCount = commitHashesArray.length;

      if (commitCount === '0') {
        return {
          success: true,
          message: "No changes detected to absorb.",
          appliedFixups: 0
        };
      }

      if (commitCount === '1') {
        // Amend the commit
        execSyncSafe(`git commit --amend --no-edit`, { encoding: 'utf8' });
        return {
          success: true,
          message: "Only one commit detected. Amended commit.",
          appliedFixups: 1
        };
      }

      // Get commit history with files changed per commit
      const commitsOutput = execSyncSafe(`git log --name-only ${upstreamBranch}..HEAD`, 
        { encoding: 'utf8' }).stdout.trim();
      
      const openAIKey = Git.getOpenAIApiKey();
      console.log(openAIKey);
      if (!openAIKey) {
        return {
          success: false,
          message: "OpenAI API key not configured"
        };
      }
    
      // Create fixup commits
      let fixupsApplied = 0;

      const aiAbsorbSuggestion = await getAiAbsorbSuggestion(openAIKey, commitsOutput, commitHashesArray, modifiedFiles);

      let message = "Successfully absorbed changes.";

      // Process each suggested absorption
      for (const suggestion of aiAbsorbSuggestion.absorbFiles) {
        const commitHash = suggestion.commitHash;
        const files = suggestion.files;
        
        // Only stage the files for this specific commit
        execSyncSafe('git reset', { encoding: 'utf8' }); // Unstage everything
        for (const file of files) {
          execSyncSafe(`git add "${file}"`, { encoding: 'utf8' });
        }
        
        // Create the fixup commit
        const result = execSyncSafe(`git commit --fixup=${commitHash}`, { encoding: 'utf8' });
        
        if (result.status === 0) {
          fixupsApplied++;
          message += `\nFixup commit: ${commitHash}`;
          files.forEach(file => {
            message += `\n  ${file}`;
          });
        }
      }

      // run git rebase --autosquash on the merge-base of the current branch and the upstream branch
      const mergeBase = execSyncSafe(`git merge-base ${currentBranch} ${upstreamBranch}`, { encoding: 'utf8' });
      if (mergeBase.status === 0) {
        const mergeBaseHash = mergeBase.stdout.trim();
        execSyncSafe(`git rebase --autosquash ${mergeBaseHash}`, { encoding: 'utf8' });
      }

      return {
        success: true,
        message: message,
        appliedFixups: fixupsApplied,
      };
      
    } catch (error) {
      // Try to provide a more specific error message
      let errorMessage = `Failed to absorb changes: ${error.message}`;
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
}

export function execSyncSafe(cmd, opts = {}) {
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