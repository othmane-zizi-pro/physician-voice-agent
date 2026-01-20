# Featured Quotes Management System - Roadmap

## Overview
Build an admin interface to curate and order featured quotes that appear to users after calls end. Quotes are automatically extracted from transcripts via AI, then admins can select and order which ones to feature.

## Current State
- ✅ AI extracts quotable quotes from transcripts (`/api/extract-quote`)
- ✅ Quotes stored in `calls.quotable_quote` with `frustration_score`
- ✅ Featured quotes displayed in post-call form (random 7 with high frustration)
- ❌ No manual curation or ordering

## Target State
- Admins can browse all quotes from the calls table
- Admins can "feature" quotes by adding them to a curated list
- Drag-and-drop to reorder featured quotes
- Top 7 highlighted in green (these are shown to users)
- Featured quotes API serves from curated list instead of random selection

---

## Phase 1: Database Schema
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
- [ ] Create migration file
- [ ] Run migration
- [ ] Update TypeScript types
- [ ] Add RLS policies (admin read/write, anon read)

---

## Phase 2: Admin UI - Quotes Browser Tab
**Add "Quotes" tab to admin panel to browse all extracted quotes**

**Features:**
- List all calls with quotes (quotable_quote not null)
- Show: Quote text, Location, Frustration score, Date, Featured status
- "Add to Featured" button for each quote
- Filter: All / Featured only / Not featured
- Search quotes

**Tasks:**
- [ ] Add "Quotes" tab to admin panel
- [ ] Create quotes list view with all quote data
- [ ] Add "Feature this quote" action button
- [ ] Add filter controls

---

## Phase 3: Featured Quotes Manager
**Drag-and-drop interface to manage featured quotes order**

**Features:**
- Separate section/tab showing only featured quotes
- Drag-and-drop reordering (using react-beautiful-dnd or dnd-kit)
- Top 7 rows highlighted in green
- Remove from featured button
- Show current order number
- Save order button (or auto-save on drop)

**Tasks:**
- [ ] Install drag-and-drop library (dnd-kit recommended)
- [ ] Create FeaturedQuotesManager component
- [ ] Implement drag-and-drop reordering
- [ ] Add green highlighting for top 7
- [ ] Create API endpoint to update order (`PATCH /api/featured-quotes/reorder`)
- [ ] Add remove from featured functionality

---

## Phase 4: Update Featured Quotes API
**Modify `/api/featured-quotes` to use curated list**

**Logic:**
1. First, fetch from `featured_quotes` table ordered by `display_order`
2. Return top 7 active quotes
3. Fallback to old behavior (random high-frustration) if < 7 curated quotes

**Tasks:**
- [ ] Update GET `/api/featured-quotes` to query curated table first
- [ ] Add fallback logic for insufficient curated quotes
- [ ] Test with post-call form

---

## Phase 5: Polish & Edge Cases
**Final improvements**

**Tasks:**
- [ ] Handle deleted calls (cascade or show warning)
- [ ] Add "Preview" to see how quotes appear in post-call form
- [ ] Add bulk actions (feature multiple, remove multiple)
- [ ] Add quote character limit validation
- [ ] Add confirmation dialogs for destructive actions

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
