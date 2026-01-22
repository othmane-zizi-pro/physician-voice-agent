# Featured Quotes Management System - Roadmap

## Status: ✅ ALL PHASES COMPLETE

## Overview
Build an admin interface to curate and order featured quotes that appear to users after calls end. Quotes are automatically extracted from transcripts via AI, then admins can select and order which ones to feature.

## Current State (COMPLETE)
- ✅ AI extracts quotable quotes from transcripts (`/api/extract-quote`)
- ✅ Quotes stored in `calls.quotable_quote` with `frustration_score`
- ✅ Featured quotes displayed in post-call form
- ✅ Manual curation and ordering via admin panel
- ✅ Drag-and-drop reordering with top 7 highlighted
- ✅ Bulk actions for featuring/removing multiple quotes
- ✅ Preview modal to see how quotes appear to users
- ✅ Confirmation dialogs for destructive actions

---

## Phase 1: Database Schema ✅ COMPLETE
**Create `featured_quotes` table**

```sql
CREATE TABLE featured_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  location TEXT, -- city, region from original call
  display_order INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_featured_quotes_order ON featured_quotes(display_order);
```

**Tasks:**
- [x] Create migration file
- [x] Run migration
- [x] Update TypeScript types
- [x] Add RLS policies (admin read/write, anon read)

---

## Phase 2: Admin UI - Quotes Browser Tab ✅ COMPLETE
**Add "Quotes" tab to admin panel to browse all extracted quotes**

**Features:**
- List all calls with quotes (quotable_quote not null)
- Show: Quote text, Location, Frustration score, Date, Featured status
- "Add to Featured" button for each quote
- Filter: All / Featured only / Not featured
- Search quotes

**Tasks:**
- [x] Add "Quotes" tab to admin panel
- [x] Create quotes list view with all quote data
- [x] Add "Feature this quote" action button
- [x] Add filter controls
- [x] Create POST /api/featured-quotes endpoint
- [x] Create DELETE /api/featured-quotes/[id] endpoint
- [x] Updated GET /api/featured-quotes to use curated list first

---

## Phase 3: Featured Quotes Manager ✅ COMPLETE
**Drag-and-drop interface to manage featured quotes order**

**Features:**
- Separate section/tab showing only featured quotes
- Drag-and-drop reordering (using react-beautiful-dnd or dnd-kit)
- Top 7 rows highlighted in green
- Remove from featured button
- Show current order number
- Save order button (or auto-save on drop)

**Tasks:**
- [x] Install drag-and-drop library (dnd-kit recommended)
- [x] Create FeaturedQuotesManager component
- [x] Implement drag-and-drop reordering
- [x] Add green highlighting for top 7
- [x] Create API endpoint to update order (`PATCH /api/featured-quotes/reorder`)
- [x] Add remove from featured functionality
- [x] Integrate into admin panel (shows when "Featured" filter selected)

---

## Phase 4: Update Featured Quotes API ✅ COMPLETE
**Modify `/api/featured-quotes` to use curated list**

**Logic:**
1. First, fetch from `featured_quotes` table ordered by `display_order`
2. Return top 7 active quotes
3. Fallback to old behavior (random high-frustration) if < 7 curated quotes

**Tasks:**
- [x] Update GET `/api/featured-quotes` to query curated table first
- [x] Add fallback logic for insufficient curated quotes
- [x] Test with post-call form (completed in Phase 2)

---

## Phase 5: Polish & Edge Cases ✅ COMPLETE
**Final improvements**

**Tasks:**
- [x] Handle deleted calls (cascade already configured in DB schema)
- [x] Add "Preview" to see how quotes appear in post-call form
- [x] Add bulk actions (feature multiple, remove multiple)
- [x] Add quote character limit validation (warning shown for quotes > 200 chars)
- [x] Add confirmation dialogs for destructive actions

---

## Technical Notes

### Drag-and-Drop Library
Recommend `@dnd-kit/core` + `@dnd-kit/sortable`:
- Modern, accessible, performant
- Better than react-beautiful-dnd (no longer maintained)
- ~15KB gzipped

### Order Management
When reordering:
1. Update `display_order` for affected rows
2. Use transaction for consistency
3. Consider sparse numbering (10, 20, 30) to allow insertions without full renumber

### API Endpoints
- `GET /api/featured-quotes` - Get featured quotes for display (existing, to be modified)
- `POST /api/featured-quotes` - Add quote to featured list
- `DELETE /api/featured-quotes/[id]` - Remove from featured
- `PATCH /api/featured-quotes/reorder` - Update order after drag-drop

---

## Estimated Effort
- Phase 1: Small (database setup)
- Phase 2: Medium (admin UI)
- Phase 3: Medium-Large (drag-drop is tricky)
- Phase 4: Small (API update)
- Phase 5: Small (polish)

## Dependencies
- `@dnd-kit/core` - Drag and drop
- `@dnd-kit/sortable` - Sortable lists
- `@dnd-kit/utilities` - CSS utilities
