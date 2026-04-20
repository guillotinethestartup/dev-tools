import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import styles from './MessageContent.module.css';

interface Props {
  content: string;
  role: string;
}

export const MessageContent = memo(function MessageContent({ content, role }: Props) {
  if (role === 'tool' || role === 'error') {
    return <span>{content}</span>;
  }

  if (role === 'user') {
    return <span>{content}</span>;
  }

  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          hr() { return null; },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children).replace(/\n$/, '');

            if (match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  customStyle={{
                    margin: 0,
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: 'rgba(0, 0, 0, 0.4)',
                  }}
                >
                  {text}
                </SyntaxHighlighter>
              );
            }

            return (
              <code className={styles.inlineCode} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
