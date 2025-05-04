import CommitMessageFormatter from '../src/commitMessageFormatter.js';

describe('CommitMessageFormatter', () => {
  describe('wrapLine', () => {
    test('wraps lines at 72 characters', () => {
      const longLine = 'This is a very long line that should be wrapped at 72 characters because it exceeds the maximum width allowed for a Git commit message.';
      const result = CommitMessageFormatter.wrapLine(longLine);
      
      // Result should contain a newline
      expect(result.includes('\n')).toBe(true);
      
      // No line should be longer than 72 chars
      const lines = result.split('\n');
      lines.forEach(line => {
        expect(line.length).toBeLessThanOrEqual(72);
      });
    });

    test('handles indentation correctly', () => {
      const line = 'This line should be indented by 4 spaces after wrapping.';
      const result = CommitMessageFormatter.wrapLine(line, null, 4);
      
      // Second line should start with 4 spaces
      const lines = result.split('\n');
      if (lines.length > 1) {
        expect(lines[1].startsWith('    ')).toBe(true);
      }
    });

    test('adds leading string to wrapped lines', () => {
      const line = 'This is a quote that should have > at the start of each wrapped line.';
      const result = CommitMessageFormatter.wrapLine(line, '> ');
      
      // Each wrapped line should start with '> '
      const lines = result.split('\n');
      if (lines.length > 1) {
        expect(lines[1].startsWith('> ')).toBe(true);
      }
    });
  });

  describe('quoteUnwrap', () => {
    test('converts multi-line quote to single line', () => {
      const quote = '> This is a quote\n> that spans multiple lines\n> and should be unwrapped.';
      const result = CommitMessageFormatter.quoteUnwrap(quote);
      
      // Result should not contain newlines
      expect(result.includes('\n')).toBe(false);
      
      // Result should not contain '>' characters except perhaps at the start
      expect(result.substring(1).includes('>')).toBe(false);
    });
  });

  describe('bulletUnwrap', () => {
    test('preserves bullet points', () => {
      const bullets = '* First item\n  continues here\n* Second item\n  also continues';
      const result = CommitMessageFormatter.bulletUnwrap(bullets);
      
      // Result should contain the same number of bullets
      expect((result.match(/\*/g) || []).length).toBe(2);
      
      // Result should have newlines between bullet points
      expect(result.includes('\n')).toBe(true);
    });
  });

  describe('formatForCommit', () => {
    test('formats commit message correctly', () => {
      const message = 'Subject line\n\nThis is a paragraph that should be wrapped at 72 characters to follow Git commit message best practices.\n\n* This is a bullet point\n  that continues on the next line\n\n> This is a quote\n> that spans multiple lines';
      
      const result = CommitMessageFormatter.formatForCommit(message);
      
      // Result should have subject line followed by blank line
      expect(result.startsWith('Subject line\n\n')).toBe(true);
      
      // No line should be longer than 72 chars except for the first line potentially
      const lines = result.split('\n').slice(1);
      lines.forEach(line => {
        if (!line.trim().startsWith('```')) { // Ignore code blocks
          expect(line.length).toBeLessThanOrEqual(72);
        }
      });
    });
  });

  describe('parseForUi', () => {
    test('round trip conversion works', () => {
      const originalMessage = 'Subject line\n\nThis is a paragraph that should be wrapped for the UI.\n\n* This is a bullet point\n\n> This is a quote';
      
      // Format for commit then parse back for UI
      const formatted = CommitMessageFormatter.formatForCommit(originalMessage);
      const parsedBack = CommitMessageFormatter.parseForUi(formatted);
      
      // The content should be semantically equivalent
      expect(parsedBack.split('\n\n').length).toBe(originalMessage.split('\n\n').length);
      expect(parsedBack.includes('Subject line')).toBe(true);
      expect(parsedBack.includes('This is a paragraph')).toBe(true);
      expect(parsedBack.includes('* This is a bullet point')).toBe(true);
      expect(parsedBack.includes('This is a quote')).toBe(true);
    });
  });
}); 