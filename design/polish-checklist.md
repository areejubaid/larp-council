# Polish pass checklist

From a design talk at a previous hackathon. Run this before every release of the UI.

## A product is ready to ship when it feels
* Intentional, consistent, accessible, trustworthy, human and purposeful.

## Accessibility
* Error states for every failure (mic denied, Brain offline, empty pitch)
* Text contrast passes WCAG AA, no light grey body text
* Font sizes: 16px for body text and inputs, nothing readable under 14px
* Screen reader labels, with live regions for the debate and the verdict
* Visible focus states on every button and input
* Alt text, or aria-hidden on decorative images
* Every icon and form control has a label
* Touch targets at least 44 by 44 px

## Visual design consistency
* Consistent spacing and alignment
* Clear typography hierarchy
* Balanced use of colour and contrast
* Consistent icons, borders and shadows
* Consistent images and brand language

## Design system accuracy
* Reusable components throughout
* Consistent buttons, forms and cards
* Strokes or drop shadows, not a mix

## User experience
* Empty, loading and error states
* Helpful microcopy and labels
* Smooth interactions and feedback

## Common AI design tells to fix
* Tiny uppercase eyebrow labels above titles
* Light weight, all caps fonts
* Light grey used as a font colour
* Inconsistent imagery or icon styles
* Widows: one word alone on the last line of a heading
