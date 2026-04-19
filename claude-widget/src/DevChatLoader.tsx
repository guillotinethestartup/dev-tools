import { createRoot } from 'react-dom/client';
import { DevChatWidget } from './DevChatWidget';

export function mountDevChat() {
  const container = document.createElement('div');
  container.id = 'dev-chat-root';
  document.body.appendChild(container);

  createRoot(container).render(<DevChatWidget />);
}
