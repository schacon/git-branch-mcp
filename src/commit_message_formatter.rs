/// Message formatting utilities for Git commit messages.
/// 
/// This module handles the formatting and parsing of commit messages,
/// allowing for a standardized format in the Git repository while providing
/// UI-friendly versions for editing.

pub struct CommitMessageFormatter;

impl CommitMessageFormatter {
    /// Wrap a line of text at 72 characters, preserving list items and quotes.
    pub fn wrap_line(line: &str, leading: Option<&str>, indent: Option<usize>) -> String {
        let leading_spaces = line.len() - line.trim_start().len();
        let words: Vec<&str> = line.split_whitespace().collect();
        let mut lines = 0;
        let mut result = String::new();
        let mut current_line = String::new();

        if leading_spaces > 0 {
            result.push_str(&" ".repeat(leading_spaces));
        }

        let current_indent = if let Some(indent) = indent {
            " ".repeat(indent)
        } else {
            String::new()
        };

        for (j, word) in words.iter().enumerate() {
            if current_line.is_empty() {
                current_line = word.to_string();
            } else if current_line.len() + word.len() + 1 > 72 {
                // Line would be too long, start a new line
                if lines > 0 {
                    if let Some(leading) = leading {
                        result.push_str(leading);
                    }
                }
                result.push_str(&current_line);
                result.push('\n');
                result.push_str(&current_indent);
                lines += 1;
                current_line = word.to_string();
            } else {
                // Add word to current line
                current_line.push(' ');
                current_line.push_str(word);
            }

            // If this is the last word
            if j == words.len() - 1 {
                if lines > 0 {
                    if let Some(leading) = leading {
                        result.push_str(leading);
                    }
                }
                result.push_str(&current_line.trim_end());
                current_line.clear();
            }
        }

        result
    }

    /// Turn a multi-line quote into a single line
    pub fn quote_unwrap(paragraph: &str) -> String {
        let mut result = String::new();
        let lines: Vec<&str> = paragraph.split('\n').collect();

        for (j, line) in lines.iter().enumerate() {
            // preserve indentation of first line
            if j == 0 {
                let leading_spaces = line.len() - line.trim_start().len();
                result.push_str(&" ".repeat(leading_spaces));
            }

            let trimmed_line = line.trim();

            if trimmed_line.starts_with('>') && j > 0 {
                result.push_str(&trimmed_line.strip_prefix('>').unwrap_or(trimmed_line).trim());
            } else {
                result.push_str(trimmed_line);
            }
            result.push(' ');
        }

        result.trim_end().to_string()
    }

    /// Process bullet points in a paragraph
    pub fn bullet_unwrap(paragraph: &str) -> String {
        let possible_bullets = ['*', '-', '+'];
        let mut result = String::new();
        let lines: Vec<&str> = paragraph.split('\n').collect();

        for (j, line) in lines.iter().enumerate() {
            // if it starts with any of the possible bullets, start a new line
            if possible_bullets.iter().any(|&bullet| line.trim().starts_with(bullet)) {
                if j > 0 {
                    result = result.trim_end().to_string();
                    result.push('\n');
                }
                result.push_str(line);
            } else {
                // it's a continuation of the last bullet
                result.push_str(&line.trim());
            }

            result.push(' ');
        }

        result.trim_end().to_string()
    }

    /// Basic paragraph unwrapping
    pub fn simple_unwrap(paragraph: &str) -> String {
        let mut result = String::new();
        let lines: Vec<&str> = paragraph.split('\n').collect();
        let trailer_regex = regex::Regex::new(r"^[!-9;-~]+:\s*.+$").unwrap();

        // Process each line in the paragraph
        for line in lines {
            // if it's a trailer (RFC 822 grammar), add it to the result
            if trailer_regex.is_match(line.trim()) {
                result.push_str(line);
                result.push('\n');
            } else {
                result.push_str(line);
                result.push(' ');
            }
        }

        result.trim_end().to_string()
    }

    /// Format a user-provided message for storage in a commit.
    pub fn format_for_commit(message: &str) -> String {
        // Split the message into paragraphs
        let paragraphs: Vec<&str> = message.split("\n\n").collect();

        if paragraphs.is_empty() {
            return String::new();
        }

        // Keep the first line as is, this is the subject line
        let mut result = paragraphs[0].to_string();
        result.push_str("\n\n");

        let mut code_block = false;

        // Format the rest of the message with hard wrapping text paragraphs at 72 chars
        if paragraphs.len() > 1 {
            // Process remaining paragraphs
            for paragraph in paragraphs.iter().skip(1) {
                let lines: Vec<&str> = paragraph.split('\n').collect();

                // Process each line in the paragraph
                for (x, line) in lines.iter().enumerate() {
                    if line.starts_with("```") {
                        code_block = !code_block;
                        result.push_str(line);
                    } else if code_block || line.len() <= 72 {
                        result.push_str(line);
                    } else {
                        // is this a list item or quote?
                        let is_list_item = line.trim().starts_with("* ");
                        let is_quote = line.trim().starts_with("> ");

                        if is_list_item || is_quote {
                            let leading_spaces = line.len() - line.trim_start().len();

                            if is_list_item {
                                result.push_str(&Self::wrap_line(line, None, Some(leading_spaces + 2)));
                            } else {
                                result.push_str(&Self::wrap_line(line, Some("> "), Some(leading_spaces)));
                            }
                        } else {
                            result.push_str(&Self::wrap_line(line, None, None));
                        }
                    }

                    if x < lines.len() - 1 {
                        result.push('\n');
                    }
                }

                result.push_str("\n\n");
            }
        }

        result.trim_end().to_string()
    }

    /// Parse a commit message back into its user-editable form.
    pub fn parse_for_ui(formatted_message: &str) -> String {
        // Split the message into paragraphs
        let paragraphs: Vec<&str> = formatted_message.split("\n\n").collect();

        if paragraphs.is_empty() {
            return String::new();
        }

        let mut code_block = false;

        // Keep the first line as is, this is the subject line
        let mut result = paragraphs[0].to_string();
        result.push_str("\n\n");

        if paragraphs.len() > 1 {
            // Process remaining paragraphs
            for (i, paragraph) in paragraphs.iter().skip(1).enumerate() {
                // is this a list item or quote?
                let is_list_item = paragraph.trim().starts_with("* ");
                let is_quote = paragraph.trim().starts_with('>');
                let starts_code_block = paragraph.trim().starts_with("```");
                let ends_code_block = paragraph.trim().ends_with("```");

                if starts_code_block {
                    code_block = !code_block;
                }

                if code_block {
                    result.push_str(paragraph);
                } else if is_list_item {
                    result.push_str(&Self::bullet_unwrap(paragraph));
                } else if is_quote {
                    result.push_str(&Self::quote_unwrap(paragraph));
                } else {
                    result.push_str(&Self::simple_unwrap(paragraph));
                }

                if ends_code_block {
                    code_block = !code_block;
                }

                if i < paragraphs.len() - 2 {
                    result.push_str("\n\n");
                }
            }
        }

        result.trim_end().to_string()
    }
}