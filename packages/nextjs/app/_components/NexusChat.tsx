"use client";

import { useState, useRef, type FormEvent } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function NexusChat() {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setInputValue("");
    setError(null);
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ messages: conversation.map(({ role, content }) => ({
          role,
          content,
        })) }),
        signal: controller.signal,
      });

      if (!response.body || !response.ok) {
        throw new Error("Risposta non valida dal server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
  const assistantId = crypto.randomUUID();

      setMessages((current) => [
        ...current,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) {
          continue;
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + chunk }
              : message,
          ),
        );
      }
    } catch (err) {
      console.error("Errore durante la chat Nexus", err);
      setError(err instanceof Error ? err.message : "Impossibile completare la richiesta");
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <section className="w-full max-w-2xl border rounded-xl border-base-300 bg-base-100 shadow-sm">
      <header className="flex items-center justify-between px-4 py-3 border-b border-base-200">
        <div>
          <p className="text-sm font-semibold">Civic Nexus AI</p>
          <p className="text-xs text-base-content/70">
            Chat con gli strumenti Civic Nexus abilitati in base al tuo account.
          </p>
        </div>
        <button
          type="button"
          className="px-2 py-1 text-xs font-medium rounded-md border border-base-300 hover:bg-base-200"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {isOpen ? "Nascondi" : "Mostra"}
        </button>
      </header>

      {isOpen && (
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <p className="text-sm text-base-content/70">
                Invia un messaggio per iniziare la conversazione con Nexus.
              </p>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-base-content/80">
                  {msg.role === "assistant" ? "Nexus" : "Tu"}
                </span>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {msg.content}
                </p>
              </div>
            ))}

            {isLoading && (
              <p className="text-sm text-base-content/70">L&apos;assistente sta rispondendo…</p>
            )}

            {error && (
              <p className="text-sm text-error">
                Errore durante la richiesta: {error}
              </p>
            )}
          </div>

          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              name="prompt"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Scrivi un messaggio..."
              className="input input-bordered input-sm w-full"
              disabled={isLoading}
              aria-label="Messaggio da inviare a Civic Nexus"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={isLoading}>
              {isLoading ? "Invio..." : "Invia"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!isLoading}
              onClick={() => {
                abortRef.current?.abort();
                abortRef.current = null;
                setIsLoading(false);
              }}
            >
              Annulla
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
