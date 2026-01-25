import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { Phone, Twitter, Linkedin } from "lucide-react";
import type { Database } from "@/types/database";
import CopyLinkButton from "./CopyLinkButton";

// Create supabase client for server-side
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface PageProps {
  params: { id: string };
}

async function getQuote(id: string) {
  // Check if it's a featured quote or a call quote
  if (id.startsWith("call-")) {
    const callId = id.replace("call-", "");
    const { data } = await supabase
      .from("calls")
      .select("id, quotable_quote, city, region")
      .eq("id", callId)
      .single();

    if (data?.quotable_quote) {
      return {
        quote: data.quotable_quote,
        location: data.city && data.region
          ? `${data.city}, ${data.region}`
          : data.region || data.city || "Anonymous",
      };
    }
  } else {
    const { data } = await supabase
      .from("featured_quotes")
      .select("quote, location")
      .eq("id", id)
      .single();

    if (data) {
      return {
        quote: data.quote,
        location: data.location || "Anonymous",
      };
    }
  }

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const quote = await getQuote(params.id);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://doc.meroka.co";

  if (!quote) {
    return {
      title: "Doc - AI Companion for Healthcare Workers",
      description: "Vent about the healthcare system with someone who gets it.",
    };
  }

  const truncatedQuote = quote.quote.length > 100
    ? quote.quote.slice(0, 97) + "..."
    : quote.quote;

  const ogImageUrl = `${baseUrl}/api/og?quote=${encodeURIComponent(quote.quote)}&location=${encodeURIComponent(quote.location)}`;

  return {
    title: `"${truncatedQuote}" - Doc`,
    description: `A healthcare worker's confession: "${truncatedQuote}" Talk to Doc, an AI companion for burnt-out physicians.`,
    openGraph: {
      title: `"${truncatedQuote}"`,
      description: `— ${quote.location} | Talk to Doc, an AI companion for burnt-out healthcare workers.`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `"${truncatedQuote}"`,
      description: `— ${quote.location} | Talk to Doc`,
      images: [ogImageUrl],
    },
  };
}

export default async function SharePage({ params }: PageProps) {
  const quote = await getQuote(params.id);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://doc.meroka.co";
  const shareUrl = `${baseUrl}/share/${params.id}`;

  if (!quote) {
    return (
      <div className="min-h-screen bg-brand-neutral-50 flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl text-brand-navy-900 mb-4">Quote not found</h1>
        <Link
          href="/"
          className="text-brand-brown hover:text-brand-brown-dark transition-colors"
        >
          Go to Doc
        </Link>
      </div>
    );
  }

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`"${quote.quote}" - Anonymous Healthcare Worker\n\nTalk to Doc:`)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="min-h-screen bg-brand-neutral-50 flex flex-col items-center justify-center p-8">
      {/* Quote Card */}
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl p-8 border border-brand-neutral-100 mb-8 shadow-lg">
          {/* Quote */}
          <div className="relative">
            <span className="absolute -top-4 -left-2 text-6xl text-brand-brown/30 font-serif">
              &ldquo;
            </span>
            <p className="text-xl md:text-2xl text-brand-navy-800 italic leading-relaxed pl-6">
              {quote.quote}
            </p>
            <span className="absolute -bottom-8 right-0 text-6xl text-brand-brown/30 font-serif">
              &rdquo;
            </span>
          </div>

          <p className="text-brand-navy-600 mt-8 text-right">— {quote.location}</p>
        </div>

        {/* Share buttons */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="text-brand-navy-600 text-sm">Share:</span>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-full bg-brand-neutral-100 hover:bg-brand-ice text-brand-navy-600 hover:text-brand-navy-900 transition-colors"
            title="Share on Twitter"
          >
            <Twitter size={20} />
          </a>
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-full bg-brand-neutral-100 hover:bg-brand-ice text-brand-navy-600 hover:text-brand-navy-900 transition-colors"
            title="Share on LinkedIn"
          >
            <Linkedin size={20} />
          </a>
          <CopyLinkButton shareUrl={shareUrl} />
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-brand-navy-800 mb-6">
            Healthcare workers are venting to Doc every day.
            <br />
            <span className="text-brand-navy-600">An AI companion who gets the system&apos;s BS.</span>
          </p>

          <Link
            href="/"
            className="inline-flex items-center gap-3 bg-brand-brown hover:bg-brand-brown-dark text-white px-8 py-4 rounded-full text-lg font-medium transition-all transform hover:scale-105 shadow-lg shadow-brand-brown/30"
          >
            <Phone size={24} />
            Talk to Doc
          </Link>
        </div>

        {/* Meroka branding */}
        <p className="text-center text-brand-navy-600 text-sm mt-12">
          by{" "}
          <a
            href="https://meroka.co"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-brown transition-colors"
          >
            Meroka
          </a>
        </p>
      </div>
    </div>
  );
}
