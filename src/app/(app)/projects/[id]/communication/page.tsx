"use client";

import { use, useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Plus, Send, Hash, Users, Megaphone, Building2, MessageSquare, Loader2, Pin,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { CreateChannelDialog } from "./dialogs/create-channel-dialog";
import { toast } from "sonner";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  public: Hash, group: Users, personal: MessageSquare, project_order: Megaphone, org_order: Building2,
};

const CHANNEL_COLORS: Record<string, string> = {
  public: "text-blue-600", group: "text-purple-600", personal: "text-slate-600", project_order: "text-amber-600", org_order: "text-emerald-600",
};

export default function CommunicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channelsData, isLoading: channelsLoading } = trpc.chat.listChannels.useQuery({ projectId: id });
  const channels = channelsData?.channels ?? [];

  // Auto-select first channel
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels.length]);

  // Poll for new messages every 5 seconds (upgrade to WebSocket later)
  const { data: messagesData, isLoading: messagesLoading } = trpc.chat.getMessages.useQuery(
    { channelId: selectedChannelId ?? "", limit: 50 },
    { enabled: !!selectedChannelId, refetchInterval: 5000 }
  );

  const sendMut = trpc.chat.sendMessage.useMutation({
    onSuccess: () => { setMessageText(""); utils.chat.getMessages.invalidate({ channelId: selectedChannelId! }); utils.chat.listChannels.invalidate({ projectId: id }); },
    onError: (e) => toast.error(e.message),
  });

  const markReadMut = trpc.chat.markRead.useMutation({ onSuccess: () => utils.chat.listChannels.invalidate({ projectId: id }) });

  // Mark messages as read when viewing
  useEffect(() => {
    if (selectedChannelId && messagesData?.messages?.length) {
      const lastMsg = messagesData.messages[messagesData.messages.length - 1];
      markReadMut.mutate({ channelId: selectedChannelId, lastMessageId: lastMsg.id });
    }
  }, [selectedChannelId, messagesData?.messages?.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages?.length]);

  const handleSend = () => {
    if (!messageText.trim() || !selectedChannelId) return;
    sendMut.mutate({ channelId: selectedChannelId, text: messageText.trim() });
  };

  const messages = messagesData?.messages ?? [];
  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <header className="shrink-0 border-b bg-card px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">Project</Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold">Communication</span>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm" className="h-7 text-xs gap-1"><Plus className="h-3 w-3" /> New Channel</Button></DialogTrigger>
          <CreateChannelDialog projectId={id} onDone={() => { setCreateOpen(false); utils.chat.listChannels.invalidate({ projectId: id }); }} />
        </Dialog>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Channel list sidebar */}
        <aside className="w-56 shrink-0 border-r bg-muted/20 overflow-y-auto">
          <div className="p-2 space-y-0.5">
            {channelsLoading ? (
              <div className="space-y-1">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : channels.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No channels yet.</p>
                <p className="mt-1">Create one to start chatting.</p>
              </div>
            ) : (
              channels.map(ch => {
                const Icon = CHANNEL_ICONS[ch.type] ?? Hash;
                const isActive = selectedChannelId === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChannelId(ch.id)}
                    className={cn(
                      "flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-xs transition-colors text-left",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : CHANNEL_COLORS[ch.type])} />
                    <span className="flex-1 truncate">{ch.name}</span>
                    {ch.unreadCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full px-1.5 py-0.5 shrink-0">{ch.unreadCount}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Message area */}
        <div className="flex-1 flex flex-col">
          {selectedChannel ? (
            <>
              {/* Channel header */}
              <div className="shrink-0 border-b px-4 py-2 flex items-center gap-2">
                {(() => {
                  const Icon = CHANNEL_ICONS[selectedChannel.type] ?? Hash;
                  return <Icon className={cn("h-4 w-4", CHANNEL_COLORS[selectedChannel.type])} />;
                })()}
                <span className="text-sm font-semibold">{selectedChannel.name}</span>
                {selectedChannel.description && <span className="text-xs text-muted-foreground">· {selectedChannel.description}</span>}
                <span className="text-[10px] text-muted-foreground ml-auto">{selectedChannel._count?.members ?? 0} members</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id} className={cn("flex gap-2", msg.isPinned && "bg-amber-50/50 dark:bg-amber-950/10 rounded-md p-2 -mx-2")}>
                      <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {msg.user?.name?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{msg.user?.name ?? "Unknown"}</span>
                          <span className="text-[9px] text-muted-foreground">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                          {msg.isPinned && <Pin className="h-2.5 w-2.5 text-amber-500" />}
                        </div>
                        <div className="text-sm whitespace-pre-wrap break-words mt-0.5">{msg.text}</div>
                        {msg.attachmentData && msg.attachmentType?.startsWith("image/") && (
                          <img src={`data:${msg.attachmentType};base64,${msg.attachmentData}`} alt={msg.attachmentName ?? "attachment"} className="max-h-48 rounded-md mt-1" />
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 border-t p-3 flex items-end gap-2">
                <Textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  rows={1}
                  placeholder={selectedChannel.type === "project_order" || selectedChannel.type === "org_order" ? "Post an order (admins only)..." : "Type a message... (Enter to send, Shift+Enter for new line)"}
                  className="text-sm resize-none min-h-[36px] max-h-32"
                  disabled={selectedChannel.type === "project_order" || selectedChannel.type === "org_order" ? undefined : false}
                />
                <Button size="sm" className="h-9 shrink-0" onClick={handleSend} disabled={!messageText.trim() || sendMut.isPending}>
                  {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Select a channel to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


