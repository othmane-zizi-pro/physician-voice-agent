---
name: meroka-colors
description: Provides Meroka brand color palette and typography guidelines when building new UI components, pages, or styling elements. Use when creating buttons, forms, layouts, or any new web interface. Suggests appropriate colors and fonts based on context.
---

# Meroka Brand Guidelines

Meroka is focused on saving independent medical practices in the USA. The brand uses warm, professional colors and clean typography that convey trust and urgency.

## Color Palette

### Backgrounds (Light)
**#F7F5F2** - Light beige/cream (primary light background)
- Use for: Main page backgrounds, alternating sections, navbar backgrounds
- Text on this background: `#18212d` (dark slate)

**#FBF5EB** - Warm peachy beige (secondary light background)
- Use for: Alternating sections, cards, panels for visual variety
- Text on this background: `#18212d` (dark slate)

### Background (Dark)
**#18212d** - Dark slate
- Use for: Hero sections, feature sections, footer, sections needing dramatic contrast
- Text on this background: `#FFFFFF` (white) or `#F7F5F2` (light beige)
- Purpose: Creates visual rhythm, emphasizes important sections

### Primary (Call-to-Action)
**#9b420f** - Burnt orange-brown (Meroka's signature orangish-maroon)
- Use for: Primary buttons, main CTAs, important highlights
- Text on this color: `#FFFFFF` (white)
- Purpose: Commands attention, drives user action

### Secondary (Supporting Actions)
**#18212d** - Dark slate
- Use for: Secondary buttons, less prominent actions, alternative CTAs, headers
- Text on this color: `#FFFFFF` (white)
- Purpose: Professional, supporting element without competing with primary

### Text
**#18212d** - Dark slate (primary dark text)
- Use for: Body text, headings, labels on light backgrounds
- Purpose: Professional and readable

**#1F1F1F** - Dark grey (softer alternative)
- Use for: Secondary text, captions, less prominent copy on light backgrounds
- Purpose: Softer than pure black, still readable

## Typography

### Font Family
**Geist** - Modern geometric sans-serif (Google Fonts)
- Fallback stack: `Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`
- Available weights: 300 (Light), 400 (Regular), 500 (Medium), 600 (Semi-Bold), 700 (Bold)

**Geist Mono** - Monospace variant for technical content
- Available weights: 300 (Light), 400 (Regular), 500 (Medium)

### Contextual Font Usage

**Hero Headlines**
- Font: Geist Bold (700)
- Size: 48px - 72px (mobile: 36px - 48px)
- Line height: 1.1 - 1.2 (tight)
- Letter spacing: -0.02em (slightly tighter)
- Use for: Main page headlines, hero sections, primary value propositions

**Feature Headlines**
- Font: Geist Semi-Bold (600)
- Size: 32px - 48px (mobile: 28px - 36px)
- Line height: 1.2 - 1.3
- Letter spacing: -0.01em
- Use for: Section titles, feature callouts, secondary headlines

**Navigation/Buttons**
- Font: Geist Medium (500)
- Size: 14px - 16px
- Line height: 1.4
- Letter spacing: 0 (normal)
- Use for: Navigation links, button text, tabs, form labels

**Body Paragraphs**
- Font: Geist Regular (400)
- Size: 16px - 18px (mobile: 16px)
- Line height: 1.6 - 1.7 (comfortable reading)
- Letter spacing: 0 (normal)
- Use for: All body copy, descriptions, paragraph text

**Captions/Metadata**
- Font: Geist Light (300) or Regular (400)
- Size: 12px - 14px
- Line height: 1.5
- Letter spacing: 0
- Use for: Image captions, footnotes, timestamps, secondary info

**Numerical Data/Metrics**
- Font: Geist Mono Medium (500) or Geist Bold (700)
- Size: Varies by context (often large: 36px+)
- Line height: 1.2
- Use for: Key statistics, pricing, data visualization labels
- Note: Geist Mono adds technical credibility; Geist Bold adds impact

### Typography Guidelines

**Line Heights:**
- Display text (hero/headlines): 1.1 - 1.3 (tighter for visual impact)
- Body text: 1.6 - 1.7 (comfortable reading)
- UI elements (buttons/nav): 1.4 - 1.5

**Letter Spacing:**
- Large text (48px+): -0.02em to -0.01em (slightly tighter)
- Body text (16-18px): 0 (normal)
- Small text (12-14px): 0 to 0.01em (slightly looser for readability)
- All caps text: 0.05em - 0.1em (looser)

**When to Use Geist Mono:**
- Technical specifications or code snippets
- Data tables with numerical alignment
- Key metrics when you want a "data-driven" feel
- API documentation or developer-focused content
- NOT for body paragraphs or general UI text

## Usage Guidelines

### Buttons
```
Primary Button (main action):
- Background: #9b420f
- Text: #FFFFFF
- Example: "Get Started", "Sign Up", "Calculate Savings"

Secondary Button (alternative action):
- Background: #18212d
- Text: #FFFFFF
- Example: "Learn More", "View Details", "Documentation"
```

### Layouts
```
Page Background Options:
- Main/alternating sections: #F7F5F2
- Alternating sections: #FBF5EB
- Dark sections: #18212d (for hero, features, footer)

Content Cards: #FFFFFF with subtle border
Text on light backgrounds: #18212d
Text on dark backgrounds: #FFFFFF or #F7F5F2
```

### Forms
```
Input backgrounds: #FFFFFF
Input borders: Light grey or #18212d at low opacity
Focus state: #9b420f border
Labels: #18212d
```

## CSS Reference
```css
/* Typography */
body {
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 400;
  font-size: 16px;
  line-height: 1.6;
  background-color: #F7F5F2;
  color: #18212d;
}

h1 {
  font-weight: 700;
  font-size: 64px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

h2 {
  font-weight: 600;
  font-size: 40px;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.metric {
  font-family: 'Geist Mono', monospace;
  font-weight: 500;
  font-size: 48px;
  line-height: 1.2;
}

/* Buttons */
.btn-primary {
  background-color: #9b420f;
  color: #FFFFFF;
  font-weight: 500;
  font-size: 16px;
}

.btn-secondary {
  background-color: #18212d;
  color: #FFFFFF;
  font-weight: 500;
  font-size: 16px;
}

/* Sections */
.section-dark {
  background-color: #18212d;
  color: #FFFFFF;
}

.section-warm {
  background-color: #FBF5EB;
  color: #18212d;
}
```

## When to Use Each Color

**Primary (#9b420f):**
- Main call-to-action buttons
- Important notifications or alerts
- Key metrics or numbers that need emphasis
- Links or interactive elements that drive conversions

**Secondary (#18212d):**
- Secondary navigation elements
- Alternative actions (e.g., "Cancel", "Back", "More Info")
- Complementary UI elements
- Headers or section dividers
- Dark background sections

**Light Beige (#F7F5F2):**
- Primary page backgrounds
- Alternating sections for visual variety
- Navbar backgrounds
- Creates a professional, clean feel

**Warm Beige (#FBF5EB):**
- Alternating sections (pair with #F7F5F2)
- Card or panel backgrounds
- Adds warmth and visual rhythm

**Dark Slate (#18212d):**
- Hero sections for impact
- Feature callout sections
- Footer backgrounds
- Sections needing dramatic contrast
- Creates visual breaks between light sections

**Dark Slate Text (#18212d):**
- Primary body text on light backgrounds
- Headings on light backgrounds
- Labels and form text

**Soft Grey Text (#1F1F1F):**
- Secondary text on light backgrounds
- Captions and less prominent copy
- Softer alternative to dark slate

## Important Notes

- **Always use white text** (`#FFFFFF`) on dark backgrounds (#18212d) and colored buttons (#9b420f)
- **Create rhythm** by alternating between #F7F5F2, #FBF5EB, and #18212d backgrounds
- **Dark sections** (#18212d) work great for hero areas, features, and footers
- **Maintain the warm feel** - the beige backgrounds are core to Meroka's identity
- When in doubt, **Primary for action, Secondary for navigation/support**
