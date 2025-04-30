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
  { promptSummary: z.string() },
  async ({ promptSummary }) => {
    // Use the promptSummary as the commit message
    const result = Git.updateBranch(promptSummary);
    
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
        content: [{ type: "text", text: `Failed to update branch: ${result.message}` }]
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
