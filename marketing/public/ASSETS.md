# Required Assets

To complete the marketing website, create the following image assets:

## Favicon Files

Create a simple robot icon based on Tonny's design:
- Colors: Cream (#F7F3ED) body, Copper (#D87665) accents, Cyan (#00FFFF) eyes
- Style: Retro-futuristic robot head

### Files needed in `/public`:
1. **favicon.ico** (32x32, 16x16 multi-size .ico file)
2. **favicon-16x16.png** (16x16 PNG)
3. **apple-touch-icon.png** (180x180 PNG for iOS)

## Open Graph Image

Create a social sharing image (1200x630px):

### Design:
- Background: Cream (#F7F3ED)
- Large Tonny robot emoji or illustration (center-left)
- Text (right side):
  - "Tonsurance" (Space Grotesk Bold, 72px, Copper #D87665)
  - "Parametric Risk Coverage on TON" (Inter Medium, 36px, #2C2C2C)
  - "⚡ Payouts in 5-10 Minutes" (Inter Regular, 28px, #666666)
- TON logo or accent (bottom right corner)

### File needed in `/public`:
- **og-image.png** (1200x630 PNG)

## Quick Creation Options

### Option 1: Use Figma/Canva
1. Create designs in Figma or Canva
2. Export as PNG
3. Convert favicon.png to .ico using online tool (favicon.io)

### Option 2: Use AI Generation
```bash
# Use DALL-E or Midjourney with this prompt:
"Cute retro-futuristic robot mascot icon, simple geometric shapes, cream and copper color scheme, minimalist design, pixel-perfect, 180x180px"
```

### Option 3: Placeholder (Temporary)
For now, the site will use emoji placeholders (🤖) which will work but aren't optimized for all platforms.

## Installation

Once assets are created, place them in `/public`:
```
/public
├── favicon.ico
├── favicon-16x16.png
├── apple-touch-icon.png
└── og-image.png
```

The site will automatically detect and use them!
