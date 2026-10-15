"use client";

import { useState } from "react";
import { PromptComposer } from "@/components/ui/prompt-composer";
import { AttachmentChip } from "@/components/ui/attachment-chip";
import { X } from "lucide-react";
import { useMerchant } from "@/components/layout/merchant-provider";
import { uploadChatImage } from "@/lib/storage/upload-chat-image";
import { cn } from "@/lib/utils";
import { isRtlText, friendlySendError } from "@/lib/utils/text";
import type { ChatSendRef, OptimisticInput } from "./chat-thread";
import type { Message } from "@/types/message";

interface ReplyInputProps {
  conversationId: string;
  disabled?: boolean;
  onSendRef?: React.MutableRefObject<ChatSendRef | null>;
  /** Message being replied to (Instagram-style). */
  replyTarget?: Message | null;
  onClearReply?: () => void;
}

function replyPreview(message: Message): string {
  if (message.message_type === "image") return "Photo";
  if (message.message_type === "voice") return "Voice message";
  if (message.message_type === "document") return "Document";
  return message.content;
}

export function ReplyInput({
  conversationId,
  disabled,
  onSendRef,
  replyTarget,
  onClearReply,
}: ReplyInputProps) {
  const merchant = useMerchant();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  }

  function handleImageFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSend() {
    const text = content.trim();
    if ((!text && !imageFile) || sending || uploading) return;

    const replyToMessageId = replyTarget?.id;

    // Upload the image first (need a public URL before we can send or optimistically render).
    let mediaUrl: string | undefined;
    if (imageFile) {
      setUploading(true);
      try {
        mediaUrl = await uploadChatImage(imageFile, merchant.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Image upload failed");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const payload: OptimisticInput = {
      content: text || undefined,
      mediaUrl,
      messageType: mediaUrl ? "image" : "text",
      replyToMessageId,
    };

    // Optimistic: show immediately, clear composer + reply target.
    onSendRef?.current?.addOptimistic(payload);
    setContent("");
    clearImage();
    onClearReply?.();

    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, ...payload }),
      });
      if (!res.ok) {
        const serverError = await res
          .json()
          .then((d) => d?.error as string | undefined)
          .catch(() => undefined);
        onSendRef?.current?.markFailed(payload, friendlySendError(serverError));
      }
    } catch {
      onSendRef?.current?.markFailed(
        payload,
        "Failed to send. Check your connection."
      );
    } finally {
      setSending(false);
    }
  }

  const busy = sending || uploading;

  return (
    <div className="border-t border-border p-3">
      {replyTarget && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-s-2 border-foreground/30 bg-muted/40 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Replying to {replyTarget.direction === "outbound" ? "yourself" : "customer"}
            </p>
            <p
              className={cn(
                "truncate text-xs text-foreground",
                isRtlText(replyPreview(replyTarget)) && "font-arabic"
              )}
              dir={isRtlText(replyPreview(replyTarget)) ? "rtl" : "ltr"}
            >
              {replyPreview(replyTarget)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      <PromptComposer
        value={content}
        onValueChange={setContent}
        onSubmit={() => handleSend()}
        status={busy ? "submitted" : "ready"}
        placeholder="Type a message..."
        disabled={disabled}
        allowEmpty={!!imageFile}
        accept="image/jpeg,image/png,image/webp,image/gif"
        onFilesSelected={(files) => handleImageFile(files[0])}
        textareaClassName={cn(isRtlText(content) && "font-arabic")}
        attachments={
          imageFile && imagePreview ? (
            <AttachmentChip
              name={imageFile.name}
              size={imageFile.size}
              type={imageFile.type}
              previewUrl={imagePreview}
              status={uploading ? "uploading" : "ready"}
              onRemove={uploading ? undefined : clearImage}
            />
          ) : undefined
        }
      />
    </div>
  );
}
