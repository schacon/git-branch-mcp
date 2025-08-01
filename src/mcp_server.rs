use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolRequest {
    pub name: String,
    pub arguments: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResponse {
    pub content: Vec<Content>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

impl ToolResponse {
    pub fn text(text: String) -> Self {
        Self {
            content: vec![Content {
                content_type: "text".to_string(),
                text,
            }],
        }
    }
}

type ToolHandler = Box<dyn Fn(ToolRequest) -> Pin<Box<dyn Future<Output = anyhow::Result<ToolResponse>> + Send>> + Send + Sync>;

pub struct Tool {
    pub name: String,
    pub description: String,
    pub handler: ToolHandler,
}

pub struct McpServer {
    name: String,
    version: String,
    tools: HashMap<String, Tool>,
}

impl McpServer {
    pub fn new(name: &str, version: &str) -> Self {
        Self {
            name: name.to_string(),
            version: version.to_string(),
            tools: HashMap::new(),
        }
    }
    
    pub fn register_tool<F, Fut>(&mut self, name: &str, description: &str, handler: F)
    where
        F: Fn(ToolRequest) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = anyhow::Result<ToolResponse>> + Send + 'static,
    {
        let handler_fn = Box::new(move |req: ToolRequest| -> Pin<Box<dyn Future<Output = anyhow::Result<ToolResponse>> + Send>> {
            Box::pin(handler(req))
        });
        
        self.tools.insert(name.to_string(), Tool {
            name: name.to_string(),
            description: description.to_string(),
            handler: handler_fn,
        });
    }
    
    pub async fn run_stdio(&self) -> anyhow::Result<()> {
        let stdin = tokio::io::stdin();
        let mut stdout = tokio::io::stdout();
        let mut reader = BufReader::new(stdin);
        let mut line = String::new();
        
        // Send initialization message
        let init_response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": self.name,
                    "version": self.version
                }
            }
        });
        
        stdout.write_all(format!("{}\n", init_response).as_bytes()).await?;
        stdout.flush().await?;
        
        loop {
            line.clear();
            match reader.read_line(&mut line).await? {
                0 => break, // EOF
                _ => {
                    if let Ok(request) = serde_json::from_str::<Value>(&line) {
                        if let Some(response) = self.handle_request(request).await? {
                            stdout.write_all(format!("{}\n", response).as_bytes()).await?;
                            stdout.flush().await?;
                        }
                    }
                }
            }
        }
        
        Ok(())
    }
    
    async fn handle_request(&self, request: Value) -> anyhow::Result<Option<Value>> {
        if let Some(method) = request.get("method").and_then(|m| m.as_str()) {
            match method {
                "tools/list" => {
                    let tools: Vec<_> = self.tools.values().map(|tool| {
                        serde_json::json!({
                            "name": tool.name,
                            "description": tool.description,
                            "inputSchema": {
                                "type": "object",
                                "properties": {},
                                "required": []
                            }
                        })
                    }).collect();
                    
                    Ok(Some(serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": request.get("id"),
                        "result": {
                            "tools": tools
                        }
                    })))
                }
                "tools/call" => {
                    if let Some(params) = request.get("params") {
                        if let Some(name) = params.get("name").and_then(|n| n.as_str()) {
                            if let Some(tool) = self.tools.get(name) {
                                let arguments = params.get("arguments")
                                    .and_then(|a| a.as_object())
                                    .map(|obj| obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                                    .unwrap_or_default();
                                
                                let tool_request = ToolRequest {
                                    name: name.to_string(),
                                    arguments,
                                };
                                
                                match (tool.handler)(tool_request).await {
                                    Ok(response) => {
                                        Ok(Some(serde_json::json!({
                                            "jsonrpc": "2.0",
                                            "id": request.get("id"),
                                            "result": response
                                        })))
                                    }
                                    Err(e) => {
                                        Ok(Some(serde_json::json!({
                                            "jsonrpc": "2.0",
                                            "id": request.get("id"),
                                            "error": {
                                                "code": -32603,
                                                "message": e.to_string()
                                            }
                                        })))
                                    }
                                }
                            } else {
                                Ok(Some(serde_json::json!({
                                    "jsonrpc": "2.0",
                                    "id": request.get("id"),
                                    "error": {
                                        "code": -32601,
                                        "message": format!("Tool '{}' not found", name)
                                    }
                                })))
                            }
                        } else {
                            Ok(Some(serde_json::json!({
                                "jsonrpc": "2.0",
                                "id": request.get("id"),
                                "error": {
                                    "code": -32602,
                                    "message": "Missing tool name"
                                }
                            })))
                        }
                    } else {
                        Ok(Some(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": request.get("id"),
                            "error": {
                                "code": -32602,
                                "message": "Missing parameters"
                            }
                        })))
                    }
                }
                _ => Ok(None)
            }
        } else {
            Ok(None)
        }
    }
}