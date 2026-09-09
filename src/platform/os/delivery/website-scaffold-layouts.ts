/**
 * Distinct React/Next page layouts for non–html-static stacks.
 * Layout is chosen per route (or fill keywords) so multi-route previews
 * are not three copies of the same scaffold.
 */

import type { WebProjectFill } from "./website-project-templates";

export const WEB_LAYOUT_IDS = [
  "bold-hero",
  "editorial",
  "product-grid",
  "bento",
] as const;

export type WebLayoutId = (typeof WEB_LAYOUT_IDS)[number];

function jsString(s: string): string {
  return JSON.stringify(s ?? "");
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "site";
}

function stockImageUrl(seed: string, width = 1200, height = 800): string {
  const safe =
    slugify(seed).replace(/[^a-z0-9-]/g, "").slice(0, 48) || "website";
  return `https://picsum.photos/seed/${encodeURIComponent(safe)}/${width}/${height}`;
}

function resolveHeroImageSrc(fill: WebProjectFill): string {
  if (fill.heroImageDataUrl?.trim()) return fill.heroImageDataUrl.trim();
  return stockImageUrl(`${fill.brandName}-${fill.tagline}`, 1400, 900);
}

export function resolveWebLayout(
  fill: Pick<
    WebProjectFill,
    "title" | "summary" | "tagline" | "brandName" | "layout"
  >,
  routeIndex = 0
): WebLayoutId {
  const explicit = fill.layout?.trim().toLowerCase();
  if (explicit && (WEB_LAYOUT_IDS as readonly string[]).includes(explicit)) {
    return explicit as WebLayoutId;
  }
  const hay = `${fill.title} ${fill.summary} ${fill.tagline}`.toLowerCase();
  if (/editorial|minimal|magazine|quiet/.test(hay)) return "editorial";
  if (/product|feature|catalog|shop|commerce/.test(hay)) return "product-grid";
  if (/bento|mosaic|tile/.test(hay)) return "bento";
  if (/bold|impact|hero-led|hero led/.test(hay)) return "bold-hero";
  return WEB_LAYOUT_IDS[Math.abs(routeIndex) % 3]!;
}

function sectionsPayload(fill: WebProjectFill): string {
  return fill.sections
    .map(
      (s, i) =>
        `    { heading: ${jsString(s.heading)}, body: ${jsString(s.body)}, image: ${jsString(stockImageUrl(`${fill.brandName}-${s.heading}-${i}`, 800, 520))} }`
    )
    .join(",\n");
}

/** Shared CSS variables + motion; layout-specific rules appended. */
export function buildLayoutCss(fill: WebProjectFill, layout: WebLayoutId): string {
  const { primary, background, text, accent } = fill.colors;
  const base = `:root {
  --bg: ${background};
  --text: ${text};
  --primary: ${primary};
  --accent: ${accent};
  --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --font-body: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font-body);
  background:
    radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 55%),
    var(--bg);
  color: var(--text);
}
@keyframes rise-in {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fade-scale {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
.reveal { animation: rise-in 0.75s cubic-bezier(0.22, 1, 0.36, 1) both; }
.page { min-height: 100vh; }
img { max-width: 100%; display: block; }
.cta {
  display: inline-block;
  margin-top: 1.25rem;
  padding: 0.75rem 1.25rem;
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  border-radius: 2px;
  transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease;
}
.cta:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--accent) 35%, transparent);
}
.eyebrow { letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.72rem; opacity: 0.72; font-family: var(--font-body); }
h1, h2 { font-family: var(--font-display); font-weight: 600; }
`;

  if (layout === "editorial") {
    return (
      base +
      `
.nav, footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1.25rem 8vw; border-bottom: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
}
footer { border-bottom: 0; border-top: 1px solid color-mix(in srgb, var(--text) 14%, transparent); }
.hero-editorial {
  display: grid; gap: 2.5rem; padding: 4rem 8vw 3rem;
  max-width: 1200px; margin: 0 auto;
}
@media (min-width: 900px) {
  .hero-editorial { grid-template-columns: 0.9fr 1.1fr; align-items: end; }
}
.hero-editorial h1 {
  font-size: clamp(2.6rem, 6vw, 4.2rem); line-height: 1.02; margin: 0.5rem 0 1rem;
  max-width: 12ch;
}
.lede { font-size: 1.15rem; line-height: 1.65; max-width: 34rem; opacity: 0.92; }
.hero-media { border-radius: 4px; overflow: hidden; min-height: 320px; }
.hero-media img { width: 100%; height: 100%; object-fit: cover; min-height: 360px; animation: fade-scale 1s ease both; }
.rail {
  display: grid; gap: 2.5rem; padding: 2rem 8vw 4rem; max-width: 720px; margin: 0 auto;
}
.rail article { border-top: 1px solid color-mix(in srgb, var(--text) 12%, transparent); padding-top: 1.5rem; }
.rail img { width: 100%; height: 200px; object-fit: cover; margin-bottom: 1rem; border-radius: 2px; }
.cta-band {
  margin: 0 8vw 3rem; padding: 2.5rem; text-align: left;
  background: linear-gradient(120deg, color-mix(in srgb, var(--primary) 12%, var(--bg)), color-mix(in srgb, var(--accent) 10%, var(--bg)));
}
`
    );
  }

  if (layout === "product-grid") {
    return (
      base +
      `
.nav, footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1rem 1.5rem; backdrop-filter: blur(8px);
  border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
}
footer { border-bottom: 0; border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent); }
.hero-product {
  padding: 3.5rem 1.5rem 2rem; max-width: 1100px; margin: 0 auto; text-align: center;
}
.hero-product h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); line-height: 1.08; margin: 0.4rem auto 1rem; max-width: 18ch; }
.lede { font-size: 1.12rem; line-height: 1.55; max-width: 40rem; margin: 0 auto; }
.hero-strip {
  margin: 2rem auto 0; max-width: 1100px; padding: 0 1.5rem;
  border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px color-mix(in srgb, var(--text) 16%, transparent);
}
.hero-strip img { width: 100%; height: min(42vw, 420px); object-fit: cover; }
.product-grid {
  display: grid; gap: 1.25rem; padding: 2.5rem 1.5rem 3rem;
  max-width: 1100px; margin: 0 auto;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}
.product-grid article {
  padding: 0 0 1.25rem; border-radius: 12px; overflow: hidden;
  background: color-mix(in srgb, var(--primary) 6%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.product-grid article:hover { transform: translateY(-4px); box-shadow: 0 16px 40px color-mix(in srgb, var(--text) 12%, transparent); }
.product-grid img { width: 100%; height: 180px; object-fit: cover; }
.product-grid h2, .product-grid p { padding: 0 1rem; }
.cta-band {
  margin: 0 1.5rem 3rem; padding: 2.5rem; text-align: center; border-radius: 16px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--bg)), color-mix(in srgb, var(--primary) 10%, var(--bg)));
}
`
    );
  }

  if (layout === "bento") {
    return (
      base +
      `
.nav, footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1rem 1.5rem;
}
.hero-bento {
  padding: 3rem 1.5rem 1.5rem; max-width: 1100px; margin: 0 auto;
}
.hero-bento h1 { font-size: clamp(2.3rem, 5vw, 3.6rem); line-height: 1.05; margin: 0.35rem 0 0.85rem; max-width: 16ch; }
.lede { font-size: 1.1rem; line-height: 1.55; max-width: 36rem; }
.bento {
  display: grid; gap: 1rem; padding: 1rem 1.5rem 3rem;
  max-width: 1100px; margin: 0 auto;
  grid-template-columns: repeat(6, 1fr);
}
.bento .tile {
  border-radius: 18px; overflow: hidden; padding: 1.25rem;
  background: color-mix(in srgb, var(--primary) 7%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--text) 9%, transparent);
  min-height: 180px;
}
.bento .tile.wide { grid-column: span 4; }
.bento .tile.tall { grid-column: span 2; grid-row: span 2; padding: 0; }
.bento .tile.mid { grid-column: span 2; }
@media (max-width: 800px) {
  .bento { grid-template-columns: 1fr; }
  .bento .tile.wide, .bento .tile.tall, .bento .tile.mid { grid-column: span 1; grid-row: auto; }
}
.bento img { width: 100%; height: 100%; object-fit: cover; min-height: 220px; }
.cta-band {
  margin: 0 1.5rem 3rem; padding: 2rem 1.5rem; border-radius: 18px; text-align: center;
  background: color-mix(in srgb, var(--accent) 14%, var(--bg));
}
`
    );
  }

  // bold-hero (default)
  return (
    base +
    `
.nav, footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  backdrop-filter: blur(8px);
}
footer { border-bottom: 0; border-top: 1px solid color-mix(in srgb, var(--text) 12%, transparent); }
.hero {
  display: grid; gap: 2rem; padding: 4rem 1.5rem 3rem;
  max-width: 1100px; margin: 0 auto; align-items: center;
}
@media (min-width: 860px) { .hero { grid-template-columns: 1.05fr 0.95fr; } }
.hero-copy { max-width: 640px; }
.hero-media {
  border-radius: 12px; overflow: hidden; min-height: 240px;
  box-shadow: 0 24px 60px color-mix(in srgb, var(--text) 18%, transparent);
}
.hero-media img { width: 100%; height: 100%; object-fit: cover; min-height: 280px; }
h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); line-height: 1.1; margin: 0.4rem 0 1rem; }
.lede { font-size: 1.15rem; line-height: 1.55; max-width: 36rem; }
.card-media {
  display: block; width: 100%; height: 160px; object-fit: cover;
  border-radius: 8px; margin-bottom: 0.85rem;
}
.grid {
  display: grid; gap: 1.25rem; padding: 0 1.5rem 3rem;
  max-width: 1100px; margin: 0 auto;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}
.grid article {
  padding: 1.1rem; border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 6%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--text) 9%, transparent);
}
.cta-band {
  margin: 0 1.5rem 3rem; padding: 2.5rem 1.5rem; border-radius: 12px; text-align: center;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--bg)), color-mix(in srgb, var(--primary) 10%, var(--bg)));
}
`
  );
}

export function buildLayoutReactApp(
  fill: WebProjectFill,
  layout: WebLayoutId
): string {
  const heroSrc = resolveHeroImageSrc(fill);
  const sectionsJs = sectionsPayload(fill);
  const head = `export default function App() {
  const brand = ${jsString(fill.brandName)};
  const tagline = ${jsString(fill.tagline)};
  const heroBody = ${jsString(fill.heroBody)};
  const cta = ${jsString(fill.ctaLabel)};
  const heroImage = ${jsString(heroSrc)};
  const sections = [
${sectionsJs}
  ];
`;

  if (layout === "editorial") {
    return (
      head +
      `  return (
    <div className="page">
      <header className="nav">
        <strong>{brand}</strong>
        <a className="cta" href="#cta">{cta}</a>
      </header>
      <main>
        <section className="hero-editorial">
          <div className="reveal">
            <p className="eyebrow">{brand}</p>
            <h1>{tagline}</h1>
            <p className="lede">{heroBody}</p>
            <a className="cta" href="#cta">{cta}</a>
          </div>
          <div className="hero-media reveal">
            <img src={heroImage} alt="" loading="lazy" />
          </div>
        </section>
        <section className="rail">
          {sections.map((s, i) => (
            <article key={s.heading} className="reveal" style={{ animationDelay: \`\${0.1 + i * 0.08}s\` }}>
              <img src={s.image} alt="" loading="lazy" />
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </article>
          ))}
        </section>
        <section id="cta" className="cta-band reveal">
          <h2>{cta}</h2>
          <p>{brand} — crafted for the brief.</p>
        </section>
      </main>
      <footer><span>© {new Date().getFullYear()} {brand}</span></footer>
    </div>
  );
}
`
    );
  }

  if (layout === "product-grid") {
    return (
      head +
      `  return (
    <div className="page">
      <header className="nav">
        <strong>{brand}</strong>
        <a className="cta" href="#cta">{cta}</a>
      </header>
      <main>
        <section className="hero-product reveal">
          <p className="eyebrow">{brand}</p>
          <h1>{tagline}</h1>
          <p className="lede">{heroBody}</p>
          <a className="cta" href="#cta">{cta}</a>
        </section>
        <div className="hero-strip reveal">
          <img src={heroImage} alt="" loading="lazy" />
        </div>
        <section className="product-grid">
          {sections.map((s, i) => (
            <article key={s.heading} className="reveal" style={{ animationDelay: \`\${0.1 + i * 0.08}s\` }}>
              <img src={s.image} alt="" loading="lazy" />
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </article>
          ))}
        </section>
        <section id="cta" className="cta-band reveal">
          <h2>{cta}</h2>
          <p>Start with {brand} today.</p>
        </section>
      </main>
      <footer><span>© {new Date().getFullYear()} {brand}</span></footer>
    </div>
  );
}
`
    );
  }

  if (layout === "bento") {
    return (
      head +
      `  return (
    <div className="page">
      <header className="nav">
        <strong>{brand}</strong>
        <a className="cta" href="#cta">{cta}</a>
      </header>
      <main>
        <section className="hero-bento reveal">
          <p className="eyebrow">{brand}</p>
          <h1>{tagline}</h1>
          <p className="lede">{heroBody}</p>
          <a className="cta" href="#cta">{cta}</a>
        </section>
        <section className="bento">
          <div className="tile tall reveal">
            <img src={heroImage} alt="" loading="lazy" />
          </div>
          {sections.map((s, i) => (
            <article key={s.heading} className={\`tile reveal \${i === 0 ? "wide" : "mid"}\`} style={{ animationDelay: \`\${0.12 + i * 0.08}s\` }}>
              <img src={s.image} alt="" loading="lazy" style={{ height: 120, width: "100%", objectFit: "cover", borderRadius: 12, marginBottom: 12 }} />
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </article>
          ))}
        </section>
        <section id="cta" className="cta-band reveal">
          <h2>{cta}</h2>
          <p>{brand}</p>
        </section>
      </main>
      <footer><span>© {new Date().getFullYear()} {brand}</span></footer>
    </div>
  );
}
`
    );
  }

  return (
    head +
    `  return (
    <div className="page">
      <header className="nav">
        <strong>{brand}</strong>
        <a className="cta" href="#cta">{cta}</a>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy reveal">
            <p className="eyebrow">{brand}</p>
            <h1>{tagline}</h1>
            <p className="lede">{heroBody}</p>
            <a className="cta" href="#cta">{cta}</a>
          </div>
          <div className="hero-media reveal">
            <img src={heroImage} alt="" loading="lazy" />
          </div>
        </section>
        <section className="grid">
          {sections.map((s, i) => (
            <article key={s.heading} className="reveal" style={{ animationDelay: \`\${0.12 + i * 0.08}s\` }}>
              <img className="card-media" src={s.image} alt="" loading="lazy" />
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </article>
          ))}
        </section>
        <section id="cta" className="cta-band reveal">
          <h2>{cta}</h2>
          <p>Ready when you are — {brand}.</p>
        </section>
      </main>
      <footer>
        <span>© {new Date().getFullYear()} {brand}</span>
      </footer>
    </div>
  );
}
`
  );
}

export function buildLayoutNextPage(
  fill: WebProjectFill,
  layout: WebLayoutId
): string {
  const heroSrc = resolveHeroImageSrc(fill);
  const sectionsWithImages = fill.sections.map((s, i) => ({
    ...s,
    image: stockImageUrl(`${fill.brandName}-${s.heading}-${i}`, 800, 520),
  }));
  const sectionsJson = JSON.stringify(sectionsWithImages, null, 2);
  const colors = fill.colors;

  if (layout === "editorial") {
    return `export default function Page() {
  const brand = ${jsString(fill.brandName)};
  const tagline = ${jsString(fill.tagline)};
  const heroBody = ${jsString(fill.heroBody)};
  const cta = ${jsString(fill.ctaLabel)};
  const heroImage = ${jsString(heroSrc)};
  const sections = ${sectionsJson};
  return (
    <main style={{ fontFamily: "Georgia, serif", background: ${jsString(colors.background)}, color: ${jsString(colors.text)}, minHeight: "100vh" }}>
      <header style={{ padding: "1.25rem 8vw", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
        <strong>{brand}</strong>
        <a href="#cta" style={{ background: ${jsString(colors.accent)}, color: "#fff", padding: "0.6rem 1rem", textDecoration: "none" }}>{cta}</a>
      </header>
      <section style={{ display: "grid", gap: 28, padding: "4rem 8vw", maxWidth: 1200, margin: "0 auto", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", alignItems: "end" }}>
        <div>
          <p style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 12, opacity: 0.7 }}>{brand}</p>
          <h1 style={{ fontSize: "clamp(2.6rem,6vw,4rem)", lineHeight: 1.02, maxWidth: "12ch" }}>{tagline}</h1>
          <p style={{ fontSize: "1.15rem", lineHeight: 1.65, maxWidth: 520 }}>{heroBody}</p>
          <a href="#cta" style={{ display: "inline-block", marginTop: 20, background: ${jsString(colors.accent)}, color: "#fff", padding: "0.7rem 1.1rem", textDecoration: "none" }}>{cta}</a>
        </div>
        <img src={heroImage} alt="" width={1400} height={900} style={{ width: "100%", borderRadius: 4, objectFit: "cover" }} />
      </section>
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "1rem 8vw 3rem", display: "grid", gap: 28 }}>
        {sections.map((s) => (
          <article key={s.heading} style={{ borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: 20 }}>
            <img src={s.image} alt="" width={800} height={400} style={{ width: "100%", height: 200, objectFit: "cover", marginBottom: 12 }} />
            <h2>{s.heading}</h2>
            <p>{s.body}</p>
          </article>
        ))}
      </section>
      <section id="cta" style={{ margin: "0 8vw 3rem", padding: "2.5rem", background: ${jsString(colors.primary)} + "14" }}>
        <h2>{cta}</h2>
        <p>{brand}</p>
      </section>
    </main>
  );
}
`;
  }

  if (layout === "product-grid" || layout === "bento") {
    return `export default function Page() {
  const brand = ${jsString(fill.brandName)};
  const tagline = ${jsString(fill.tagline)};
  const heroBody = ${jsString(fill.heroBody)};
  const cta = ${jsString(fill.ctaLabel)};
  const heroImage = ${jsString(heroSrc)};
  const sections = ${sectionsJson};
  return (
    <main style={{ fontFamily: "Avenir Next, Segoe UI, sans-serif", background: ${jsString(colors.background)}, color: ${jsString(colors.text)}, minHeight: "100vh" }}>
      <header style={{ padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between" }}>
        <strong>{brand}</strong>
        <a href="#cta" style={{ background: ${jsString(colors.accent)}, color: "#fff", padding: "0.6rem 1rem", textDecoration: "none" }}>{cta}</a>
      </header>
      <section style={{ padding: "3.5rem 1.5rem 1.5rem", maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <p style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 12, opacity: 0.7 }}>{brand}</p>
        <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.4rem)", lineHeight: 1.08 }}>{tagline}</h1>
        <p style={{ fontSize: "1.12rem", lineHeight: 1.55, maxWidth: 640, margin: "0 auto" }}>{heroBody}</p>
        <a href="#cta" style={{ display: "inline-block", marginTop: 20, background: ${jsString(colors.accent)}, color: "#fff", padding: "0.7rem 1.1rem", textDecoration: "none" }}>{cta}</a>
      </section>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem" }}>
        <img src={heroImage} alt="" width={1400} height={700} style={{ width: "100%", borderRadius: 16, objectFit: "cover", maxHeight: 420 }} />
      </div>
      <section style={{ display: "grid", gap: 16, padding: "2rem 1.5rem 3rem", maxWidth: 1100, margin: "0 auto", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {sections.map((s) => (
          <article key={s.heading} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.35)" }}>
            <img src={s.image} alt="" width={800} height={520} style={{ width: "100%", height: 160, objectFit: "cover" }} />
            <div style={{ padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>{s.heading}</h2>
              <p>{s.body}</p>
            </div>
          </article>
        ))}
      </section>
      <section id="cta" style={{ margin: "0 1.5rem 3rem", padding: "2.5rem", textAlign: "center", borderRadius: 16, background: ${jsString(colors.accent)} + "22" }}>
        <h2>{cta}</h2>
        <p>{brand}</p>
      </section>
    </main>
  );
}
`;
  }

  return `export default function Page() {
  const brand = ${jsString(fill.brandName)};
  const tagline = ${jsString(fill.tagline)};
  const heroBody = ${jsString(fill.heroBody)};
  const cta = ${jsString(fill.ctaLabel)};
  const heroImage = ${jsString(heroSrc)};
  const sections = ${sectionsJson};
  return (
    <main style={{ fontFamily: "Georgia, serif", background: ${jsString(colors.background)}, color: ${jsString(colors.text)}, minHeight: "100vh" }}>
      <header style={{ padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between" }}>
        <strong>{brand}</strong>
        <a href="#cta" style={{ background: ${jsString(colors.accent)}, color: "#fff", padding: "0.6rem 1rem", textDecoration: "none" }}>{cta}</a>
      </header>
      <section style={{ padding: "4rem 1.5rem", maxWidth: 1100, display: "grid", gap: 24, alignItems: "center", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <div>
          <p style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12, opacity: 0.7 }}>{brand}</p>
          <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.2rem)", lineHeight: 1.1 }}>{tagline}</h1>
          <p style={{ fontSize: "1.15rem", lineHeight: 1.55 }}>{heroBody}</p>
          <a id="cta" href="#cta" style={{ display: "inline-block", marginTop: 20, background: ${jsString(colors.accent)}, color: "#fff", padding: "0.7rem 1.1rem", textDecoration: "none" }}>{cta}</a>
        </div>
        <img src={heroImage} alt="" width={1400} height={900} style={{ width: "100%", height: "auto", borderRadius: 12, objectFit: "cover" }} />
      </section>
      <section style={{ display: "grid", gap: 16, padding: "0 1.5rem 3rem", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {sections.map((s) => (
          <article key={s.heading} style={{ padding: 20, border: "1px solid rgba(0,0,0,0.08)" }}>
            <img src={s.image} alt="" width={800} height={520} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 8, marginBottom: 12 }} />
            <h2 style={{ marginTop: 0 }}>{s.heading}</h2>
            <p>{s.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
`;
}
