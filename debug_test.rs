use std::process::Command;

fn main() {
    let input = "* one of them is very long and should be wrapped at word boundaries because it is a super long sentence";
    println\!("Input: '{}'", input);
    
    // Test wrap_line function
    let result = wrap_line_test(input, None, Some(4));
    println\!("Output: '{}'", result);
}

fn wrap_line_test(line: &str, leading: Option<String>, indent: Option<usize>) -> String {
    let leading_spaces = line.len() - line.trim_start().len();
    let words: Vec<&str> = line.split_whitespace().collect();
    let mut lines = 0;

    let mut result = String::new();
    let mut current_line = String::new();

    if leading_spaces > 0 {
        for _ in 0..leading_spaces {
            result.push(' ');
        }
    }

    let mut current_indent = String::new();
    if let Some(indent) = indent {
        for _ in 0..indent {
            current_indent.push(' ');
        }
    }

    for (j, word) in words.iter().enumerate() {
        if current_line.is_empty() {
            current_line = word.to_string();
        } else if current_line.len() + word.len() + 1 > 72 {
            // Line would be too long, start a new line
            if lines > 0 {
                if let Some(ref leading_str) = leading {
                    result.push_str(leading_str);
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

        // If this is the last word and we're not at the end of the input
        if j == words.len() - 1 {
            if lines > 0 {
                if let Some(ref leading_str) = leading {
                    result.push_str(leading_str);
                }
            }
            result.push_str(current_line.trim_end());
            current_line.clear();
        }
    }

    result
}
EOF < /dev/null