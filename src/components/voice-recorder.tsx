"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Pause, Send, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VoiceRecorderProps {
  onSend: (audioBase64: string, durationSec: number) => void;
  disabled?: boolean;
}

/**
 * VoiceRecorder — record audio messages using the MediaRecorder API.
 *
 * Flow:
 *  1. User clicks mic → request microphone permission → start recording
 *  2. Recording timer counts up; user sees a pulsing red dot
 *  3. User clicks stop → recording stops, audio is converted to base64
 *  4. Preview player appears with Play/Pause + Send + Cancel
 *  5. Send → calls onSend with base64 audio data + duration
 *
 * Audio format: webm/opus (Chrome/Firefox) or mp4/aac (Safari).
 * Stored in chat message attachmentData as base64.
 */
export function VoiceRecorder({ onSend, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sending, setSending] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopRecording = useCallback((silent = false) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopRecording(true);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stopRecording]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            setAudioPreview(result);
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.error("Microphone permission denied. Allow mic access in browser settings.");
      } else {
        toast.error("Could not access microphone. " + (err instanceof Error ? err.message : ""));
      }
    }
  }, []);


  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }
  }, []);

  const handleSend = useCallback(() => {
    if (!audioPreview) return;
    setSending(true);
    // Strip data: prefix to get base64
    const match = audioPreview.match(/^data:audio\/[^;]+;base64,(.+)$/);
    if (!match) {
      toast.error("Audio format error");
      setSending(false);
      return;
    }
    onSend(match[1], duration);
    // Reset
    setAudioPreview(null);
    setDuration(0);
    setSending(false);
    setIsPlaying(false);
  }, [audioPreview, duration, onSend]);

  const handleCancel = useCallback(() => {
    setAudioPreview(null);
    setDuration(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Not recording, no preview — show mic button
  if (!isRecording && !audioPreview) {
    return (
      <button
        onClick={startRecording}
        disabled={disabled}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        title="Record voice message"
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  // Recording in progress
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
        <span className="relative flex h-3 w-3">
          <span className={cn("absolute h-3 w-3 rounded-full bg-red-500", !isPaused && "animate-ping opacity-75")} />
          <span className="relative h-3 w-3 rounded-full bg-red-500" />
        </span>
        <span className="text-xs font-mono text-red-700 dark:text-red-400">
          {formatTime(duration)}
        </span>
        <button
          onClick={pauseRecording}
          className="rounded p-1 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900"
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => stopRecording()}
          className="rounded p-1 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900"
          title="Stop recording"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>
    );
  }

  // Preview mode
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30 border">
      <audio
        ref={audioRef}
        src={audioPreview ?? undefined}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <button
        onClick={togglePlayback}
        className="rounded-full bg-primary p-1.5 text-primary-foreground hover:bg-primary/90"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <span className="text-xs font-mono text-muted-foreground">
        {formatTime(duration)}
      </span>
      <div className="flex-1" />
      <button
        onClick={handleCancel}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Discard"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleSend}
        disabled={sending}
        className="rounded p-1 text-primary hover:bg-primary/10"
        title="Send voice message"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
