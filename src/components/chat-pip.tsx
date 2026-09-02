"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, X, Send, Minimize2, Maximize2, ChevronDown,
  Hash, Users, Megaphone, Building2, Loader2, GripVertical,
  UserPlus, Search, Circle, Check, CheckCheck, Play, Pause,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { fetchWithAuth, getUser } from "@/lib/client-auth";
import { useQuery } from "@tanstack/react-query";
import { VoiceRecorder } from "@/components/voice-recorder";
import { MentionText } from "@/components/chat/mention-text";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  public: Hash, group: Users, personal: MessageSquare, project_order: Megaphone, org_order: Building2,
};

const STORAGE_KEY = "cm-chat-pip-state";

type PipState = "closed" | "minimized" | "open";

/**
 * ChatPiP — floating chat panel that follows the user across all pages.
 *
 * States:
 *  - closed: nothing visible (entry via floating button)
 *  - minimized: small floating bubble showing unread count
 *  - open: full chat panel (resizable via drag handle)
 *
 * The panel remembers its position and last-opened channel via localStorage.
 *
 * Drag & drop: image attachments in messages are draggable. Drag them to
 * any text input / form to insert the data URL (or to another app to copy).
 */
export function ChatPiP() {
  const utils = trpc.useUtils();
  const [state, setState] = useState<PipState>("closed");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [showChannelList, setShowChannelList] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // @mention autocomplete state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);

  // Fetch channel members for @mention autocomplete
  const { data: membersData } = trpc.chat.getChannelMembers.useQuery(
    { channelId: selectedChannelId ?? "" },
    { enabled: showMentionDropdown && !!selectedChannelId }
  );
  const channelMembers = membersData?.members ?? [];
  const filteredMembers = mentionQuery
    ? channelMembers.filter((m) => m.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : channelMembers;

  // Restore state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.state) setState(parsed.state);
        if (parsed.channelId) setSelectedChannelId(parsed.channelId);
        if (parsed.position) setPosition(parsed.position);
      } catch (_) {}
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state, channelId: selectedChannelId, position })
    );
  }, [state, selectedChannelId, position]);

  // Fetch current user (for read-receipt checkmarks on own messages)
  const { data: meData } = useQuery<{ user: { id: string; name: string } }>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/auth/me");
      if (!res.ok) throw new Error("not authed");
      return res.json();
    },
    enabled: !!getUser(),
  });
  const currentUserId = meData?.user?.id;

  // Fetch channels (no projectId → all channels across all projects)
  const { data: channelsData, isLoading: channelsLoading } =
    trpc.chat.listChannels.useQuery({});

  const channels = channelsData?.channels ?? [];
  const totalUnread = channels.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  // Auto-select first channel if none selected
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels.length, selectedChannelId]);

  // Poll for new messages every 5s when open. Infinite query: "Load older"
  // prepends history; page 1 keeps refetching on the 5s poll so new messages
  // arrive without disturbing older cached pages.
  const messagesQuery = trpc.chat.getMessages.useInfiniteQuery(
    { channelId: selectedChannelId ?? "", limit: 50 },
    {
      enabled: !!selectedChannelId && state === "open",
      refetchInterval: 5000,
      getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    }
  );
  const messagesLoading = messagesQuery.isLoading;

  const sendMut = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setMessageText("");
      utils.chat.getMessages.invalidate({ channelId: selectedChannelId! });
      utils.chat.listChannels.invalidate({});
    },
    onError: (e) => toast.error(e.message),
  });

  const markReadMut = trpc.chat.markRead.useMutation({
    onSuccess: () => utils.chat.listChannels.invalidate({}),
  });

  // User search for new DMs (debounced via useQuery key)
  const { data: searchResults, isLoading: searching } = trpc.chat.searchUsers.useQuery(
    { query: dmSearchQuery, limit: 20 },
    { enabled: dmSearchQuery.trim().length >= 2 }
  );

  // Create or fetch existing DM channel
  const createDMMut = trpc.chat.getOrCreateDM.useMutation({
    onSuccess: (data) => {
      utils.chat.listChannels.invalidate({});
      if (data.channel) setSelectedChannelId(data.channel.id);
      setShowNewDM(false);
      setDmSearchQuery("");
      setShowChannelList(false);
      toast.success(data.created ? "New conversation started" : "Conversation opened");
    },
    onError: (e) => toast.error(e.message),
  });

  const messages = useMemo(() => {
    const flat = messagesQuery.data ? messagesQuery.data.pages.flatMap((p) => p.messages) : [];
    // Pages are newest-first blocks (each internally ASC) — flatten then
    // re-sort chronologically so display order is correct across pages.
    return [...flat].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [messagesQuery.data]);
  const selectedChannel = channels.find((c) => c.id === selectedChannelId);

  // For personal channels: fetch other user's read receipt for "seen" indicator
  const isPersonalChannel = selectedChannel?.type === "personal";
  const { data: messageStatus } = trpc.chat.getMessageStatus.useQuery(
    { channelId: selectedChannelId ?? "" },
    { enabled: !!selectedChannelId && isPersonalChannel && state === "open", refetchInterval: 5000 }
  );

  // Mark messages as read when viewing
  useEffect(() => {
    if (state !== "open" || !selectedChannelId || !messages.length) return;
    const lastMsg = messages[messages.length - 1];
    markReadMut.mutate({ channelId: selectedChannelId, lastMessageId: lastMsg.id });
  }, [state, selectedChannelId, messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (state === "open") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, state]);

  // Drag handling for the panel
  const handleDragStart = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("button, input, textarea, a")) return;
    setDragging(true);
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.current.y));
      setPosition({ x, y });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  function handleSend() {
    if (!messageText.trim() || !selectedChannelId) return;
    sendMut.mutate({ channelId: selectedChannelId, text: messageText.trim() });
  }

  function handleSendVoice(audioBase64: string, durationSec: number) {
    if (!selectedChannelId) return;
    sendMut.mutate({
      channelId: selectedChannelId,
      text: `🎤 Voice message (${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, "0")})`,
      attachmentData: audioBase64,
      attachmentName: `voice-${Date.now()}.webm`,
      attachmentType: "audio/webm",
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showMentionDropdown && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIdx((i) => Math.min(i + 1, filteredMembers.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const member = filteredMembers[selectedMentionIdx];
        if (member) {
          const lastAt = messageText.lastIndexOf("@");
          setMessageText(messageText.slice(0, lastAt) + `@${member.name} `);
          setShowMentionDropdown(false);
          setMentionQuery("");
        }
        return;
      }
      if (e.key === "Escape") {
        setShowMentionDropdown(false);
        setMentionQuery("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Closed: show floating action button
  if (state === "closed") {
    return (
      <button
        onClick={() => setState("open")}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-black shadow-2xl hover:bg-amber-400 transition-all hover:scale-105 active:scale-95"
        title="Open chat"
        aria-label="Open chat"
      >
        <MessageSquare className="h-6 w-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-background">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  // Minimized: small bubble
  if (state === "minimized") {
    return (
      <button
        onClick={() => setState("open")}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-card border border-border px-4 py-3 shadow-2xl hover:bg-muted transition-all"
        style={{ left: "auto" }}
      >
        <MessageSquare className="h-5 w-5 text-amber-500" />
        <span className="text-sm font-medium">Chat</span>
        {totalUnread > 0 && (
          <Badge className="bg-red-500 text-white text-xs h-5 min-w-5 flex items-center justify-center px-1.5">
            {totalUnread > 9 ? "9+" : totalUnread}
          </Badge>
        )}
      </button>
    );
  }

  // Open: full panel
  return (
    <div
      ref={panelRef}
      className="fixed z-50 flex flex-col rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
      style={{
        right: "20px",
        bottom: "20px",
        width: "min(380px, calc(100vw - 40px))",
        height: "min(560px, calc(100vh - 100px))",
      }}
    >
      {/* Header — draggable */}
      <div
        onMouseDown={handleDragStart}
        className={cn(
          "flex items-center gap-2 border-b bg-background/80 backdrop-blur px-3 py-2 cursor-move select-none",
          dragging && "cursor-grabbing"
        )}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        <button
          onClick={() => setShowChannelList((v) => !v)}
          className="flex flex-1 items-center gap-2 min-w-0 text-left"
        >
          {selectedChannel ? (
            <>
              {(() => {
                const Icon = CHANNEL_ICONS[selectedChannel.type] ?? MessageSquare;
                return <Icon className="h-4 w-4 shrink-0 text-amber-500" />;
              })()}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">
                  {selectedChannel.type === "personal" && messageStatus?.otherUser
                    ? messageStatus.otherUser.name
                    : selectedChannel.name}
                </span>
                {selectedChannel.type === "personal" && messageStatus?.otherUser && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {messageStatus.otherUser.lastActiveAt ? (
                      <>
                        <Circle
                          className={cn(
                            "h-2 w-2 fill-current",
                            new Date().getTime() - new Date(messageStatus.otherUser.lastActiveAt).getTime() < 2 * 60 * 1000
                              ? "text-emerald-500"
                              : "text-muted-foreground/40"
                          )}
                        />
                        {new Date().getTime() - new Date(messageStatus.otherUser.lastActiveAt).getTime() < 2 * 60 * 1000
                          ? "online"
                          : `last seen ${formatDistanceToNow(new Date(messageStatus.otherUser.lastActiveAt), { addSuffix: true })}`}
                      </>
                    ) : (
                      <span>offline</span>
                    )}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Select a channel…</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
        <button
          onClick={() => setState("minimized")}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Minimize"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setState("closed")}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Channel list dropdown */}
      {showChannelList && !showNewDM && (
        <div className="border-b bg-background/95 backdrop-blur">
          {/* New DM button */}
          <button
            onClick={() => setShowNewDM(true)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 transition border-b"
          >
            <UserPlus className="h-3.5 w-3.5" />
            New Direct Message
          </button>
          <div className="max-h-48 overflow-y-auto">
            {channelsLoading ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />
                Loading channels…
              </div>
            ) : channels.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                No channels yet. Start a DM above.
              </div>
            ) : (
              channels.map((c) => {
                const Icon = CHANNEL_ICONS[c.type] ?? MessageSquare;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedChannelId(c.id);
                      setShowChannelList(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition",
                      c.id === selectedChannelId && "bg-muted"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.unreadCount > 0 && (
                      <Badge className="bg-red-500 text-white text-xs h-4 min-w-4 flex items-center justify-center px-1">
                        {c.unreadCount}
                      </Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* New DM search panel */}
      {showNewDM && (
        <div className="border-b bg-background/95 backdrop-blur p-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowNewDM(false); setDmSearchQuery(""); }}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Back"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={dmSearchQuery}
                onChange={(e) => setDmSearchQuery(e.target.value)}
                placeholder="Search by name or email…"
                autoFocus
                className="w-full rounded-md border border-input bg-background pl-7 pr-2 py-1.5 text-xs"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {dmSearchQuery.trim().length < 2 ? (
              <p className="text-[10px] text-muted-foreground text-center py-3">
                Type at least 2 characters to search
              </p>
            ) : searching ? (
              <p className="text-[10px] text-muted-foreground text-center py-3">
                <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />
                Searching…
              </p>
            ) : (searchResults?.users ?? []).length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-3">
                No users found
              </p>
            ) : (
              (searchResults?.users ?? []).map((u) => {
                const isOnline = u.lastActiveAt
                  ? new Date().getTime() - new Date(u.lastActiveAt).getTime() < 2 * 60 * 1000
                  : false;
                return (
                  <button
                    key={u.id}
                    onClick={() => createDMMut.mutate({ otherUserId: u.id })}
                    disabled={createDMMut.isPending}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted rounded transition"
                  >
                    <div className="relative shrink-0">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-xs font-semibold text-white">
                        {u.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      {isOnline && (
                        <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-emerald-500 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{u.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {u.email} · <span className="capitalize">{u.role.replace("_", " ")}</span>
                      </p>
                    </div>
                    {createDMMut.isPending && createDMMut.variables?.otherUserId === u.id && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messagesLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground text-center px-4">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <>
          {messagesQuery.hasNextPage && (
            <div className="flex justify-center pb-1">
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                onClick={() => messagesQuery.fetchNextPage()}
                disabled={messagesQuery.isFetchingNextPage}
              >
                {messagesQuery.isFetchingNextPage ? "Loading older messages…" : "Load older messages"}
              </button>
            </div>
          )}
          {messages.map((msg) => {
            const isOwn = msg.user?.id === currentUserId;
            // For personal channels: show read checkmark if other user has read this message
            const isRead = isOwn && isPersonalChannel && messageStatus?.lastReadMessageId
              ? messages.findIndex((m) => m.id === messageStatus.lastReadMessageId) >=
                messages.findIndex((m) => m.id === msg.id)
              : false;
            return (
            <div key={msg.id} className={cn("space-y-0.5", isOwn && "items-end")}>
              <div className={cn("flex items-baseline gap-2", isOwn && "justify-end")}>
                {!isOwn && (
                  <span className="text-xs font-medium text-foreground">
                    {msg.user?.name ?? "Unknown"}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                  {isOwn && (
                    isRead ? (
                      <CheckCheck className="h-3 w-3 text-blue-500" aria-label="Seen" />
                    ) : (
                      <Check className="h-3 w-3 text-muted-foreground" aria-label="Sent" />
                    )
                  )}
                </span>
              </div>
              {msg.text && (
                <p className={cn(
                  "text-sm whitespace-pre-wrap break-words",
                  isOwn ? "text-foreground" : "text-foreground/90"
                )}>
                  <MentionText text={msg.text} />
                </p>
              )}
              {msg.attachmentData && msg.attachmentType?.startsWith("image/") && (
                <img
                  src={`data:${msg.attachmentType};base64,${msg.attachmentData}`}
                  alt={msg.attachmentName ?? "attachment"}
                  draggable
                  onDragStart={(e) => {
                    // Set the data URL as drag data — works for dropping into
                    // textareas, rich-text editors, or other apps
                    e.dataTransfer.setData("text/uri-list", `data:${msg.attachmentType};base64,${msg.attachmentData}`);
                    e.dataTransfer.setData("text/plain", `data:${msg.attachmentType};base64,${msg.attachmentData}`);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="max-h-32 rounded-md border cursor-grab active:cursor-grabbing hover:opacity-90 transition"
                  title="Drag to a report or form to attach this image"
                />
              )}
              {msg.attachmentData && msg.attachmentType?.startsWith("audio/") && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                  <VoiceMessagePlayer
                    audioSrc={`data:${msg.attachmentType};base64,${msg.attachmentData}`}
                    label={msg.text || "Voice message"}
                  />
                </div>
              )}
              {msg.attachmentData && !msg.attachmentType?.startsWith("image/") && !msg.attachmentType?.startsWith("audio/") && (
                <div className="flex items-center gap-2 rounded border bg-muted/30 p-2 text-xs">
                  <MessageSquare className="h-3 w-3" />
                  <span className="truncate">{msg.attachmentName ?? "Attachment"}</span>
                </div>
              )}
            </div>
          );
          })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-background/80 backdrop-blur p-2 space-y-2 relative">
        {/* @mention autocomplete dropdown */}
        {showMentionDropdown && filteredMembers.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-card border border-border rounded-lg shadow-lg py-1 max-h-40 overflow-y-auto z-50">
            {filteredMembers.slice(0, 8).map((member, idx) => (
              <button
                key={member.id}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2",
                  idx === selectedMentionIdx ? "bg-primary/10" : "hover:bg-muted"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const lastAt = messageText.lastIndexOf("@");
                  setMessageText(messageText.slice(0, lastAt) + `@${member.name} `);
                  setShowMentionDropdown(false);
                  setMentionQuery("");
                  inputRef.current?.focus();
                }}
              >
                <span className="font-medium">{member.name}</span>
                <span className="text-muted-foreground truncate">{member.email}</span>
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={inputRef}
          value={messageText}
          onChange={(e) => {
            const val = e.target.value;
            setMessageText(val);
            // Detect @mention trigger
            const lastAt = val.lastIndexOf("@");
            if (lastAt >= 0) {
              const afterAt = val.slice(lastAt + 1);
              if (!afterAt.includes(" ") || afterAt.split(" ").length <= 2) {
                setMentionQuery(afterAt);
                setShowMentionDropdown(true);
                setSelectedMentionIdx(0);
                return;
              }
            }
            setShowMentionDropdown(false);
            setMentionQuery("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          className="min-h-[40px] max-h-24 resize-none text-sm"
          rows={2}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <VoiceRecorder onSend={handleSendVoice} disabled={!selectedChannelId || sendMut.isPending} />
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              {selectedChannel?.type === "project_order" || selectedChannel?.type === "org_order"
                ? "Orders: PM/admin only"
                : "Drag images to reports"}
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!messageText.trim() || sendMut.isPending}
            className="h-7 text-xs"
          >
            {sendMut.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Send className="h-3 w-3 mr-1" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * VoiceMessagePlayer — compact audio player for voice messages in chat.
 * Shows a play/pause button + a simple progress bar.
 */
function VoiceMessagePlayer({ audioSrc, label }: { audioSrc: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setProgress(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }

  function fmtTime(sec: number): string {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 w-full min-w-[180px]">
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
      />
      <button
        onClick={togglePlay}
        className="shrink-0 rounded-full bg-primary p-1.5 text-primary-foreground hover:bg-primary/90"
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            {fmtTime(progress)} / {fmtTime(duration)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{label}</p>
      </div>
    </div>
  );
}
