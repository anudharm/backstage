/*
 * Copyright 2025 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InfoCard, MarkdownContent } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { chatbotApiRef } from './api';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Divider from '@material-ui/core/Divider';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  error?: boolean;
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'assistant-welcome',
    role: 'assistant',
    content:
      'Hello! I can help you explore the Backstage catalog. Ask me about services, ownership, documentation, or anything that is cataloged here.',
  },
];

export const ChatbotCard = () => {
  const chatbotApi = useApi(chatbotApiRef);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const question = input.trim();
      if (!question || pending) {
        return;
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: question,
      };
      const placeholderId = `assistant-${Date.now()}`;
      const placeholderMessage: ChatMessage = {
        id: placeholderId,
        role: 'assistant',
        content: 'Searching the catalog…',
        pending: true,
      };

      setMessages(prev => [...prev, userMessage, placeholderMessage]);
      setInput('');
      setPending(true);

      try {
        const response = await chatbotApi.sendMessage({ message: question });
        setMessages(prev =>
          prev.map(message =>
            message.id === placeholderId
              ? {
                  ...message,
                  content: response.text,
                  pending: false,
                }
              : message,
          ),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Something went wrong while querying the catalog.';
        setMessages(prev =>
          prev.map(message =>
            message.id === placeholderId
              ? {
                  ...message,
                  content: errorMessage,
                  pending: false,
                  error: true,
                }
              : message,
          ),
        );
      } finally {
        setPending(false);
      }
    },
    [chatbotApi, input, pending],
  );

  const renderedMessages = useMemo(
    () =>
      messages.map(message => (
        <Box key={message.id} mb={2} data-testid={`chat-message-${message.role}`}>
          <Typography variant="subtitle2" color="textSecondary">
            {message.role === 'user' ? 'You' : 'Assistant'}
          </Typography>
          {message.pending ? (
            <Typography variant="body2" color="textSecondary">
              {message.content}
            </Typography>
          ) : message.role === 'assistant' ? (
            <MarkdownContent
              content={message.content || '_No catalog information was returned._'}
            />
          ) : (
            <Typography variant="body1">{message.content}</Typography>
          )}
          {message.error ? (
            <Typography variant="caption" color="error">
              The catalog service returned an error.
            </Typography>
          ) : null}
        </Box>
      )),
    [messages],
  );

  return (
    <InfoCard
      title="Catalog Chatbot"
      subheader="Ask questions about the entities cataloged in Backstage."
    >
      <Box display="flex" flexDirection="column" height={420}>
        <Box
          ref={containerRef}
          flex={1}
          style={{ overflowY: 'auto' }}
          pr={1}
          data-testid="chatbot-messages"
        >
          {renderedMessages}
        </Box>
        <Divider />
        <Box component="form" onSubmit={handleSubmit} mt={2} display="flex">
          <TextField
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="How do I find the owner of the order service?"
            variant="outlined"
            size="small"
            fullWidth
            autoComplete="off"
            disabled={pending}
            aria-label="Ask the catalog chatbot"
          />
          <Box ml={1} display="flex" alignItems="center">
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={pending || !input.trim()}
            >
              Send
            </Button>
          </Box>
        </Box>
      </Box>
    </InfoCard>
  );
};
