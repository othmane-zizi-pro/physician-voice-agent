"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FeaturedQuote } from "@/types/database";

interface SortableQuoteProps {
  quote: FeaturedQuote;
  index: number;
  onRemove: (id: string) => void;
  isRemoving: boolean;
}

function SortableQuote({ quote, index, onRemove, isRemoving }: SortableQuoteProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: quote.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isTopSeven = index < 7;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${isDragging
          ? "opacity-50 glass-dark border-brand-neutral-300"
          : isTopSeven
            ? "glass bg-emerald-50/50 border-emerald-500/30"
            : "glass border-white/40"
        }`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-white touch-none"
        title="Drag to reorder"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
        </svg>
      </button>

      {/* Order Number */}
      <div
        className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold shadow-sm ${isTopSeven
            ? "bg-emerald-500 text-white"
            : "bg-brand-neutral-200 text-brand-navy-500"
          }`}
      >
        {index + 1}
      </div>

      {/* Quote Content */}
      <div className="flex-1 min-w-0">
        <p className="text-brand-navy-900 italic truncate">
          &ldquo;{quote.quote}&rdquo;
        </p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-brand-navy-500 text-sm">
            {quote.location || "Unknown location"}
          </p>
          {!quote.call_id && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded font-medium">
              Sample
            </span>
          )}
        </div>
      </div>

      {/* Top 7 Badge */}
      {isTopSeven && (
        <span className="px-2 py-1 bg-green-600/30 text-green-400 text-xs rounded whitespace-nowrap">
          Shown to users
        </span>
      )}

      {/* Remove Button */}
      <button
        onClick={() => onRemove(quote.id)}
        disabled={isRemoving}
        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
        title="Remove from featured"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

interface FeaturedQuotesManagerProps {
  quotes: FeaturedQuote[];
  onReorder: (quotes: FeaturedQuote[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export default function FeaturedQuotesManager({
  quotes,
  onReorder,
  onRemove,
}: FeaturedQuotesManagerProps) {
  const [items, setItems] = useState(quotes);
  const [isSaving, setIsSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Update items when quotes prop changes
  if (quotes !== items && !isSaving) {
    setItems(quotes);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);

      // Save the new order
      setIsSaving(true);
      try {
        await onReorder(newItems);
      } catch (error) {
        console.error("Failed to save order:", error);
        // Revert on error
        setItems(items);
      }
      setIsSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await onRemove(id);
    } catch (error) {
      console.error("Failed to remove:", error);
    }
    setRemovingId(null);
  };

  if (items.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <div className="text-gray-500 mb-2">No featured quotes yet</div>
        <p className="text-gray-600 text-sm">
          Go to the Quotes tab and click &quot;Feature&quot; to add quotes here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Featured Quotes Order</h3>
          <p className="text-gray-400 text-sm mt-1">
            Drag to reorder. Top 7 quotes (in green) are shown to users after calls.
          </p>
        </div>
        {isSaving && (
          <span className="text-gray-400 text-sm animate-pulse">Saving...</span>
        )}
      </div>

      {/* Sortable List */}
      <div className="glass rounded-xl p-4 shadow-glass border border-white/40">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((quote, index) => (
                <SortableQuote
                  key={quote.id}
                  quote={quote}
                  index={index}
                  onRemove={handleRemove}
                  isRemoving={removingId === quote.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-gray-800 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-900/40 border border-green-700/50"></div>
            <span className="text-gray-400">Shown to users (top 7)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gray-800/50 border border-gray-700"></div>
            <span className="text-gray-400">Not shown (backlog)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
