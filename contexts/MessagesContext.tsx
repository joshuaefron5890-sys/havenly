import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { Conversation, isUnread, subscribeToConversations } from '../lib/messages';

type MessagesState = {
  hasUnread: boolean;
};

const MessagesContext = createContext<MessagesState>({ hasUnread: false });

// Subscribed once at the app root (see app/_layout.tsx) rather than inside
// ScreenHeader itself — ScreenHeader renders on every tab, and a shared
// subscription here means switching tabs doesn't tear down and re-open a
// fresh Firestore listener each time.
export function MessagesProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      return;
    }
    return subscribeToConversations(setConversations);
  }, [user]);

  const hasUnread = Boolean(user) && conversations.some((c) => isUnread(c, user!.uid));

  return <MessagesContext.Provider value={{ hasUnread }}>{children}</MessagesContext.Provider>;
}

export function useMessagesBadge() {
  return useContext(MessagesContext);
}
