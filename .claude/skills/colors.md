# Color Palette Skill

Use this color palette when styling components in this project.

## Brand Colors

### Primary (Browns)
- **Dark Brown**: `#69311E` - Primary accent, headers
- **Burnt Orange**: `#9A4616` - CTAs, highlights, links

### Secondary (Blues)
- **Near Black**: `#0E1219` - Text, dark backgrounds
- **Dark Navy**: `#1C222D` - Secondary dark backgrounds
- **Slate Blue**: `#3C5676` - Secondary buttons, borders
- **Light Blue-Gray**: `#A9BCD0` - Muted text, icons

### Neutrals
- **Off-White**: `#F8F6F3` - Primary background
- **Light Beige**: `#E8E2DC` - Secondary background, cards
- **Ice Blue**: `#D4E4F4` - Accent background, highlights

## Usage Guidelines

When applying colors:

1. **Backgrounds**: Use `#F8F6F3` (off-white) as primary background, `#E8E2DC` (beige) for cards/sections
2. **Text**: Use `#0E1219` (near black) for body text, `#3C5676` (slate) for muted text
3. **Accents**: Use `#9A4616` (burnt orange) for CTAs and interactive elements
4. **Dark Mode**: Use `#1C222D` as background, `#F8F6F3` for text

## Tailwind Config

```js
colors: {
  brand: {
    brown: {
      dark: '#69311E',
      DEFAULT: '#9A4616',
    },
    navy: {
      900: '#0E1219',
      800: '#1C222D',
      600: '#3C5676',
      300: '#A9BCD0',
    },
    neutral: {
      50: '#F8F6F3',
      100: '#E8E2DC',
    },
    ice: '#D4E4F4',
  }
}
```

## CSS Variables

```css
:root {
  --color-brown-dark: #69311E;
  --color-brown: #9A4616;
  --color-navy-900: #0E1219;
  --color-navy-800: #1C222D;
  --color-navy-600: #3C5676;
  --color-navy-300: #A9BCD0;
  --color-neutral-50: #F8F6F3;
  --color-neutral-100: #E8E2DC;
  --color-ice: #D4E4F4;
}
```
