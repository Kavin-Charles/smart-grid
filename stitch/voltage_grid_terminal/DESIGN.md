# Design System Specification: Industrial Intelligence

## 1. Overview & Creative North Star: "The Kinetic Pulse"

The Creative North Star for this design system is **"The Kinetic Pulse."** 

In the high-stakes environment of electricity grid monitoring, the UI must feel alive, yet controlled. We are moving away from static, "spreadsheet-style" enterprise software toward a high-fidelity digital twin. The aesthetic is inspired by advanced avionics and command-center consoles—where data density meets extreme legibility.

By utilizing intentional asymmetry—placing heavy data visualizations against expansive, breathable glass surfaces—we create a "Signature Editorial" feel. We break the grid by allowing certain hero metrics to overlap container boundaries, suggesting that the data is too powerful to be contained by a simple box. This system isn't just a dashboard; it is a high-performance instrument.

---

## 2. Colors & Atmospheric Depth

Our color strategy moves beyond mere categorization. It defines the "atmosphere" of the grid.

### The Palette (Material Design Mapping)
*   **Background (`surface-dim`):** `#060a14` — The deep-space void that ensures all glowing elements pop.
*   **Primary (`primary-container`):** `#00d4ff` — Electric Blue. Used for active currents and flow.
*   **Tertiary (`tertiary`):** `#00ff88` — Neon Green. Reserved for "Nominal" system health.
*   **Secondary (`secondary-container`):** `#a855f7` — AI Purple. Used for predictive analytics and machine-learning insights.
*   **Alerts:** Warning `#f59e0b` (Amber), Critical `#ff3b5c` (Red).

### The "No-Line" Rule
Standard enterprise UI relies on borders to separate sections. We prohibit this. Boundaries must be defined through **Background Color Shifts**. Use `surface-container-low` for large section backgrounds and `surface-container-high` for nested modules. If a separator is needed, use a 32px vertical gap rather than a line.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of frosted material. 
1.  **Base Layer (`surface`):** The deep `#060a14` canvas.
2.  **Middle Layer (`surface-container-low`):** Large regions (Sidebar, Main Content Area).
3.  **Top Layer (`surface-container-highest`):** Interactive cards using `rgba(15, 23, 42, 0.65)` with a **16px backdrop-blur**.

### The "Glass & Gradient" Rule
To add visual "soul," components should never be flat. Apply a subtle radial gradient (Primary to Primary-Container at 15% opacity) to the background of main CTAs. This mimics the glow of a physical LED indicator.

---

## 3. Typography: The Precision Scale

We use **Inter** exclusively to leverage its neutral, technical DNA.

*   **Display (L/M/S):** 600 Weight. Used for top-level grid capacity (e.g., "750 kV"). Negative letter-spacing of -0.02em for a tighter, more authoritative feel.
*   **Headline & Title:** 600 Weight. Used for module titles. These should always be paired with a `label-sm` prefix (e.g., "SECTION 01 // SUBSTATION DELTA").
*   **Body:** 400 Weight. For descriptive text. Maximize readability with a 1.6 line-height.
*   **Data Labels (Label-MD):** 500 Weight. All-caps for metadata. This is the "workhorse" of the system, providing the precise, "instrument-panel" look.

---

## 4. Elevation & Depth: Tonal Layering

We ignore traditional shadows. In a dark, high-tech interface, shadows are often invisible. Instead, we use **light** to define depth.

*   **The Layering Principle:** Achieve lift by "stacking." A `surface-container-highest` card sitting on a `surface-container-low` section creates a natural optical lift.
*   **Ambient Glows:** Instead of a black drop-shadow, use a **Secondary-Fixed-Dim** (`#ddb7ff`) glow at 4% opacity with a 40px blur for AI-driven insights to make them feel "energized."
*   **The "Ghost Border" Fallback:** Where containment is critical for accessibility, use the `outline-variant` token at **10% opacity**. It should feel like a suggestion of a border, not a hard constraint.
*   **Backdrop Blur:** Every card must use a `16px blur`. This allows the "pulse" of background map elements or grid lines to bleed through, maintaining a sense of spatial awareness.

---

## 5. Components: The Industrial Toolkit

### Buttons
*   **Primary:** Background of `primary-container`, 12px radius. Add a subtle `0 0 15px rgba(0, 212, 255, 0.3)` glow on hover.
*   **Tertiary (Ghost):** No background, `outline-variant` ghost border. Only visible on hover.

### Data Cards
*   **Layout:** Forbid divider lines. Use `body-sm` text for labels and `headline-lg` for the data point. 
*   **Edge Detail:** Use a 1px top-stroke (Linear Gradient: `rgba(255,255,255,0.1)` to `transparent`) to simulate a light-catch on a glass edge.

### Status Chips
*   **Signature Style:** Small, semi-transparent pills with a 4px solid dot of the status color (Success, Warning, Critical). The background should be a 10% opacity version of the status color.

### Input Fields
*   **State:** Default state is `surface-container-highest`. On focus, the ghost border transitions to `primary` (Electric Blue) with a 2px "inner glow" effect.

### Special Component: The "AI Insight Container"
*   A specialized card using a `secondary-container` (Purple) gradient border. Use this for predictive grid failure alerts. It should "pulse" slightly (opacity animation 0.8 to 1.0) to draw immediate operator attention.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical layouts (e.g., a 3nd/23rd split) to create a sophisticated, custom feel.
*   **Do** use monospaced numerals for data that changes rapidly to prevent "layout jump."
*   **Do** lean into the glassmorphism. It is the key to maintaining a high-end feel in a data-dense environment.

### Don't:
*   **Don't** use pure white (#FFFFFF) for text. Use `on-surface-variant` (`#bbc9cf`) to reduce eye strain in dark environments.
*   **Don't** use 100% opaque borders. They clutter the UI and break the "glass" illusion.
*   **Don't** use standard "Material" shadows. They look muddy on a `#060a14` background. Use tonal shifts and glows instead.