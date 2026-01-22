"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { trackClick } from "@/lib/trackClick";

interface CopyLinkButtonProps {
  shareUrl: string;
}

export default function CopyLinkButton({ shareUrl }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    trackClick("share_page_copy", shareUrl);
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-3 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
      title="Copy link"
    >
      {copied ? <Check size={20} className="text-green-400" /> : <Link2 size={20} />}
    </button>
  );
}
