import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Git } from './gitUtils.js';

// Create an MCP server
const server = new McpServer({
  name: "Git Branch MCP",
  version: "1.0.0"
});

// Add an addition tool
server.tool("git.updateBranch",
  "Update commits on the current branch based on the summary of the prompt used to modify the codebase",
  {
    promptSummary: z.string(),
    currentWorkingDirectory: z.string(),
   },
  async ({ promptSummary, currentWorkingDirectory }) => {
    // Use the promptSummary as the commit message
    const result = Git.updateBranch(currentWorkingDirectory, promptSummary);
    
    if (result.success) {
      let message = `Branch '${result.branch}' has been updated with changes related to: ${promptSummary}`;
      
      // If we switched branches, add that information
      if (result.message.includes('Created and checked out new branch') || 
          result.message.includes('Checked out existing branch')) {
        message = `${result.message}. ${message}`;
      }
      
      // Add information about commits ahead of upstream
      if (result.commitsAhead && result.commitsAhead.success) {
        const commitInfo = result.commitsAhead;
        message += `\n\nThis branch is ${commitInfo.commitCount} commit${commitInfo.commitCount !== 1 ? 's' : ''} ahead of ${commitInfo.upstreamBranch}.`;
        
        if (commitInfo.commitCount > 0 && commitInfo.commitList.length > 0) {
          message += "\nRecent commits:";
          // Show up to 5 most recent commits
          const recentCommits = commitInfo.commitList.slice(0, 5);
          recentCommits.forEach(commit => {
            message += `\n- ${commit.hash.substring(0, 7)}: ${commit.message}`;
          });
          
          // If more commits, indicate there are more
          if (commitInfo.commitCount > 5) {
            message += `\n... and ${commitInfo.commitCount - 5} more commit${commitInfo.commitCount - 5 !== 1 ? 's' : ''}.`;
          }
        }
      }
      
      return {
        content: [{ type: "text", text: message }]
      };
    } else {
      return {
        content: [{ type: "text", text: `Failed to update branch: ${result.message}. Current working directory: ${process.cwd()}` }]
      };
    }
  }
);

// Add a merge to default branch tool
server.tool("git.integrateBranch",
  "Merge the current branch into the default branch (main or master) and optionally delete the current branch",
  {
    deleteBranch: z.boolean().optional().default(true),
    currentWorkingDirectory: z.string(),
   },
  async ({ deleteBranch, currentWorkingDirectory }) => {
    // Call the mergeToDefaultBranch method from Git utility
    const result = Git.mergeToDefaultBranch(currentWorkingDirectory, deleteBranch);
    
    if (result.success) {
      let message = result.message;
      
      // Add additional merge details if they exist
      if (result.mergeDetails) {
        message += `\n\nMerge details: ${result.mergeDetails}`;
      }
      
      return {
        content: [{ type: "text", text: message }]
      };
    } else {
      return {
        content: [{ type: "text", text: `Failed to merge to default branch: ${result.message}` }]
      };
    }
  }
);

// Add a branch summary tool
server.tool("git.summarizeBranch",
  "Shows a list of the current commits on the active branch and what the branch is named",
  {
    commitLimit: z.number().optional().default(10),
    currentWorkingDirectory: z.string(),
   },
  async ({ commitLimit, currentWorkingDirectory }) => {
    // Call the getBranchSummary method from Git utility
    const result = Git.getBranchSummary(currentWorkingDirectory, commitLimit);
    
    if (result.success) {
      let message = `# Branch Summary: ${result.branch}\n\n`;
      
      // Add creation info if available
      if (result.creationInfo) {
        message += `**Created on:** ${result.creationInfo.date}\n\n`;
      }
      
      // Add tracking info if available
      if (result.trackingInfo) {
        message += `**Tracking:** ${result.trackingInfo.upstream}`;
        if (result.trackingInfo.ahead > 0 || result.trackingInfo.behind > 0) {
          message += ` (`;
          if (result.trackingInfo.ahead > 0) {
            message += `${result.trackingInfo.ahead} commit${result.trackingInfo.ahead !== 1 ? 's' : ''} ahead`;
          }
          if (result.trackingInfo.ahead > 0 && result.trackingInfo.behind > 0) {
            message += `, `;
          }
          if (result.trackingInfo.behind > 0) {
            message += `${result.trackingInfo.behind} commit${result.trackingInfo.behind !== 1 ? 's' : ''} behind`;
          }
          message += `)`;
        }
        message += `\n\n`;
      }
      
      // Add commits ahead of upstream info if available
      if (result.commitsAheadOfUpstream && result.commitsAheadOfUpstream.success) {
        const commitInfo = result.commitsAheadOfUpstream;
        message += `**Ahead of ${commitInfo.upstreamBranch}:** ${commitInfo.commitCount} commit${commitInfo.commitCount !== 1 ? 's' : ''}\n\n`;
      }
      
      // Add commit list
      if (result.commits && result.commits.length > 0) {
        message += `## Recent Commits\n\n`;
        result.commits.forEach(commit => {
          message += `- \`${commit.hash}\` (${commit.date}) by ${commit.author}: ${commit.message}\n`;
        });
      } else {
        message += `No commits found in this branch.`;
      }
      
      return {
        content: [{ type: "text", text: message }]
      };
    } else {
      return {
        content: [{ type: "text", text: `Failed to get branch summary: ${result.message}` }]
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();

// Wrap the await in an immediately invoked async function
(async () => {
  try {
    await server.connect(transport);
    console.log("MCP Server connected and ready");
  } catch (error) {
    console.error("Failed to connect MCP server:", error);
    process.exit(1);
  }
})();
