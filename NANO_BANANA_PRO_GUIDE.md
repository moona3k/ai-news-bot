# Nano Banana Pro (Gemini 3 Pro Image) - Prompting Guide

> Model ID: `gemini-3-pro-image-preview`
> AKA: Nano Banana Pro, Nano Banana 2

## What It Excels At

### 1. Text Rendering (Best-in-Class)
- Legible text directly in images - fonts, calligraphy, multiple languages
- Infographics, posters, diagrams, menus, marketing assets
- Specify exact text: `Write "HELLO WORLD" in bold red serif font on the sign`

### 2. Technical Diagrams & Infographics
- Compress complex info into visual aids
- Architecture diagrams, flowcharts, exploded views
- Can use Google Search to ground in real facts

### 3. Photorealistic Scenes with Precise Control
- Camera specs: "85mm lens, f/1.4, three-point lighting"
- Film aesthetics: "Kodak Portra 400", "1990s flash photography"
- Maintains identity/face consistency across edits

### 4. Multi-Element Compositions
- Up to 14 reference images as input
- Complex arrangements with multiple objects
- Use variables: OBJECT_A, TEXTURE_B, LIGHTING_C

### 5. High-Resolution Output
- Supports 1K, 2K, 4K output
- Request explicitly: "4K resolution, highly detailed"

---

## Golden Rules

### 1. Natural Language > Tag Soup
```
❌ BAD:  "dog, park, 4k, realistic, trending on artstation"
✅ GOOD: "A golden retriever playing fetch in Central Park during golden hour,
         shot on 35mm film with shallow depth of field"
```

### 2. Be a Creative Director
Provide: subject, composition, action, location, style, lighting, mood

### 3. Edit Conversationally
Don't regenerate from scratch. If 80% correct, just ask:
- "Change the lighting to sunset"
- "Make the text neon blue"
- "Add a coffee cup on the table"

### 4. Provide Context/Purpose
```
"Create an infographic about neural networks FOR a high-end tech magazine"
"Design a poster FOR a Brazilian gourmet cookbook"
```
The model infers appropriate styling from context.

### 5. Be Explicit with Text
```
❌ "Add some text about AI"
✅ "Write the text 'THE FUTURE OF AI' in a minimalist sans-serif font,
   white letters on dark background, centered at top"
```

---

## Prompt Templates

### Infographic
```
Create an infographic that explains [TOPIC].
Include: [KEY POINTS as bullet list]
Style: polished editorial / technical diagram / hand-drawn whiteboard
Text should be clear and legible.
Output: 4K resolution
```

### Technical Diagram
```
Create a technical architecture diagram showing [SYSTEM/CONCEPT].
Components: [LIST COMPONENTS]
Show connections and data flow between components.
Style: clean, minimal, professional
Include labels for each component.
```

### Concept Visualization
```
A photorealistic scene representing [ABSTRACT CONCEPT].
Setting: [ENVIRONMENT]
Mood: [EMOTION/ATMOSPHERE]
Lighting: [SPECIFIC LIGHTING]
Camera: [LENS/ANGLE if relevant]
Style: cinematic / editorial / documentary
```

### Magazine Cover / Hero Image
```
Create a magazine-style hero image for an article about [TOPIC].
The image should convey [KEY THEME/EMOTION].
Style: high-end editorial photography
Composition: [SPECIFIC LAYOUT]
Include headline text: "[HEADLINE]"
4K resolution, professional lighting
```

---

## Advanced Techniques

### Use Variables for Complex Scenes
```
Generate a product lineup with:
- PRODUCT_A: red sneaker, positioned left
- PRODUCT_B: blue sneaker, positioned center
- PRODUCT_C: white sneaker, positioned right
All on a clean white background with soft shadows.
```

### Structural Control
Upload a sketch/wireframe to control layout, then describe the visual upgrade.

### Real-Time Data
```
"Create an infographic showing today's weather forecast for San Francisco"
```
Model will search and incorporate real data.

### Dimensional Translation
Convert 2D → 3D:
```
"Transform this floor plan into a photorealistic 3D interior rendering"
```

---

## Sources

- [Simon Willison's Review](https://simonwillison.net/2025/Nov/20/nano-banana-pro/)
- [Google Blog: Nano Banana Pro](https://blog.google/technology/ai/nano-banana-pro/)
- [Awesome Nano Banana Pro (GitHub)](https://github.com/ZeroLu/awesome-nanobanana-pro)
- [DEV.to Prompting Guide](https://dev.to/googleai/nano-banana-pro-prompting-guide-strategies-1h9n)
- [Fotor Prompts Collection](https://www.fotor.com/blog/nano-banana-model-prompts/)
