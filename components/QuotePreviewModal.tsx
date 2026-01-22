"use client";

import type { FeaturedQuote } from "@/types/database";

interface QuotePreviewModalProps {
  quotes: FeaturedQuote[];
  onClose: () => void;
}

export default function QuotePreviewModal({ quotes, onClose }: QuotePreviewModalProps) {
  // Get top 7 quotes (what users see)
  const displayQuotes = quotes.slice(0, 7);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Preview: Post-Call Form</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mock Form Question */}
        <div className="bg-gray-800 rounded-xl p-6 mb-4">
          <h3 className="text-xl font-semibold text-white mb-6 text-center">
            Are you a US independent physician owner?
          </h3>
          <div className="flex gap-4">
            <button className="flex-1 py-3 px-6 bg-green-600 text-white font-medium rounded-lg">
              Yes
            </button>
            <button className="flex-1 py-3 px-6 bg-gray-700 text-white font-medium rounded-lg">
              No
            </button>
          </div>
        </div>

        {/* Featured Quotes Section */}
        <div className="border-t border-gray-800 pt-4">
          <p className="text-gray-500 text-xs text-center mb-4">What other physicians are saying</p>

          {displayQuotes.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              <p>No featured quotes yet.</p>
              <p className="text-sm mt-1">Add quotes to see them here.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
              {displayQuotes.map((item, index) => (
                <div
                  key={item.id}
                  className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                >
                  <p className="text-gray-300 text-sm italic leading-relaxed">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    — {item.location || "Anonymous"}
                  </p>
                  {/* Order indicator (only in preview) */}
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-green-600 text-white text-xs rounded-full flex items-center justify-center">
                    {index + 1}
                  </span>
                </div>
              ))}
            </div>
          )}

          {quotes.length > 7 && (
            <p className="text-gray-500 text-xs text-center mt-3">
              +{quotes.length - 7} more quotes in backlog (not shown to users)
            </p>
          )}
        </div>

        {/* Social Links Mock */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-gray-500 text-xs text-center mb-3">Follow Meroka</p>
          <div className="flex justify-center gap-4">
            <div className="w-5 h-5 bg-gray-700 rounded"></div>
            <div className="w-5 h-5 bg-gray-700 rounded"></div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full mt-6 py-2 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          Close Preview
        </button>
      </div>
    </div>
  );
}
