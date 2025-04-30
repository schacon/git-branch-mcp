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
