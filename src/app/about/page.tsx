import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./about.module.css";

const github = "https://github.com/elsigh/boat-sim";

export const metadata: Metadata = {
  title: "boat-sim — The last 50 feet are all yours",
  description:
    "Take the helm in the San Juan Islands. Practice twin-screw docking, explore seven boat profiles, and help a boater-built simulator find its sea legs. Free to play in your browser.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "The last 50 feet. All yours. | boat-sim",
    description:
      "Independent throttles. Pacific Northwest harbors. A whole lot of just-one-more-try. Come take the helm.",
    url: "/about",
    images: [
      {
        url: "/media/social-card.jpg",
        width: 1200,
        height: 630,
        alt: "boat-sim — Take the helm in the San Juan Islands",
      },
    ],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/media/social-card.jpg"] },
};

const features = [
  {
    n: "01",
    title: "Two screws. A thousand little decisions.",
    text: "Port ahead. Starboard astern. A touch of bow thruster. Feel prop walk, leftover momentum, and the difference a small correction makes.",
    tag: "INDEPENDENT THROTTLES",
  },
  {
    n: "02",
    title: "Know the water before the approach.",
    text: "Read depth contours, watch traffic on the plotter, and follow a route through the fairway. Switch from calm water to local wind and current.",
    tag: "CHARTS + CONDITIONS",
  },
  {
    n: "03",
    title: "Same harbor. Different handful.",
    text: "Trade the Grand Banks for a Nordhavn, a Chris-Craft, or a little Cranchi. Each profile brings its own dimensions, response, and helm styling.",
    tag: "SEVEN BOAT PROFILES",
  },
];

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Link
          href="/about"
          aria-label="boat-sim about"
          className={styles.wordmark}
        >
          boat<span>sim</span>
          <i aria-hidden="true">↗</i>
        </Link>
        <nav aria-label="About navigation" className={styles.nav}>
          <a href="#watch">Watch it</a>
          <a href="#experience">The experience</a>
          <a href="#contribute">Come aboard</a>
        </nav>
        <Link href="/" prefetch={false} className={styles.launch}>
          Take the helm <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <Image
            src="/media/hero.jpg"
            alt="Forward camera view from Bonum Vitae inside Roche Harbor marina in the simulator"
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            className={styles.heroImage}
          />
          <div className={styles.heroShade} />
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.signal} /> MADE FOR PEOPLE WHO LOVE BOATS
            </p>
            <h1 id="hero-title">
              The last
              <br />
              <em>50 feet.</em>
              <br />
              All yours.
            </h1>
            <p className={styles.heroDescription}>
              The engines rumble. The fairway narrows.
              <br />
              One more chance to make that approach feel right.
            </p>
            <div className={styles.actions}>
              <Link href="/" prefetch={false} className={styles.primary}>
                Let’s go boating <span aria-hidden="true">↗</span>
              </Link>
              <a href="#watch" className={styles.watchLink}>
                <span aria-hidden="true">▶</span> Watch the 40-second tour
              </a>
            </div>
            <p className={styles.heroNote}>
              Free in your browser · Keyboard or USB helm · No sign-up to play
            </p>
          </div>
          <div className={styles.coordinates}>
            <span>48°36.6′ N / 123°09.0′ W</span>
            <span>ROCHE HARBOR · IN-SIM CAPTURE</span>
          </div>
        </section>

        <div className={styles.ribbon} role="group" aria-label="At a glance">
          <span>
            <strong>7</strong> boats to get to know
          </span>
          <span>
            <strong>2</strong> levers. Your call.
          </span>
          <span>
            <strong>∞</strong> fresh attempts
          </span>
          <span className={styles.ribbonEnd}>
            PACIFIC NORTHWEST STATE OF MIND <span aria-hidden="true">↗</span>
          </span>
        </div>

        <section
          id="watch"
          className={styles.section}
          aria-labelledby="watch-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>CAST OFF / THE FILMS</p>
              <h2 id="watch-title">
                A little helm time.
                <br />A lot to play with.
              </h2>
            </div>
            <p>
              Real simulator footage, from the first turn of the screws to the
              next “let me try that again.”
            </p>
          </div>
          <div className={styles.films}>
            <figure id="feature-film" className={styles.featureFilm}>
              <video
                controls
                playsInline
                preload="none"
                poster="/media/feature-poster.jpg"
                width="1920"
                height="1080"
                aria-label="boat-sim 40-second feature tour"
                aria-describedby="film-transcript"
              >
                <source
                  src="/media/boat-sim-feature-40s.mp4"
                  type="video/mp4"
                />
                <track
                  kind="captions"
                  src="/media/feature-en.vtt"
                  srcLang="en"
                  label="English"
                />
                <a href="/media/boat-sim-feature-40s.mp4">
                  Download the feature film.
                </a>
              </video>
              <figcaption>
                <span>
                  <strong>The full tour</strong>{" "}
                  <span>40 seconds · Landscape</span>
                </span>
                <a href="/media/boat-sim-feature-40s.mp4" download>
                  Download MP4 <span aria-hidden="true">↓</span>
                </a>
              </figcaption>
            </figure>
            <figure id="short-film" className={styles.shortFilm}>
              <video
                controls
                playsInline
                preload="none"
                poster="/media/short-poster.jpg"
                width="1080"
                height="1920"
                aria-label="boat-sim 15-second vertical highlights"
                aria-describedby="film-transcript"
              >
                <source src="/media/boat-sim-short-15s.mp4" type="video/mp4" />
                <track
                  kind="captions"
                  src="/media/short-en.vtt"
                  srcLang="en"
                  label="English"
                />
                <a href="/media/boat-sim-short-15s.mp4">
                  Download the short film.
                </a>
              </video>
              <figcaption>
                <span>
                  <strong>The quick dip</strong>{" "}
                  <span>15 seconds · Vertical</span>
                </span>
                <a
                  href="/media/boat-sim-short-15s.mp4"
                  download
                  aria-label="Download the 15-second MP4"
                >
                  MP4 ↓
                </a>
              </figcaption>
            </figure>
          </div>
          <details className={styles.transcript} id="film-transcript">
            <summary>Read the films’ captions and visual description</summary>
            <p>
              The 40-second tour shows forward views of Roche Harbor,
              independent engine handling, the chart plotter, different boats,
              wakes, and a return to the marina. On-screen captions introduce
              each feature, then invite you to play and contribute at
              boat-sim.vercel.app. The 15-second film takes highlights from the
              same footage. Both use an original instrumental soundtrack, with
              no spoken dialogue.
            </p>
          </details>
        </section>

        <section
          id="experience"
          className={`${styles.section} ${styles.experience}`}
          aria-labelledby="experience-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>MORE THAN POINTING THE BOW</p>
              <h2 id="experience-title">You know the feeling.</h2>
            </div>
            <p>
              That moment when neutral doesn’t mean stopped. When the wind gets
              a vote. When a clean arrival feels very, very good.
            </p>
          </div>
          <div className={styles.features}>
            {features.map((feature) => (
              <article key={feature.n}>
                <div className={styles.featureNumber}>
                  {feature.n}
                  <span aria-hidden="true">↗</span>
                </div>
                <p className={styles.featureTag}>{feature.tag}</p>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
          <div className={styles.chartStory}>
            <Image
              src="/media/chart.jpg"
              alt="Roche Harbor plotter with depth contours, marina docks, and the boat’s position"
              width={1200}
              height={760}
              sizes="(max-width: 760px) 100vw, 55vw"
            />
            <div>
              <p className={styles.eyebrow}>A PLACE WORTH COMING BACK TO</p>
              <h3>
                Find your way
                <br />
                into the islands.
              </h3>
              <p>
                Practice Roche Harbor arrivals, leave Squalicum, or head for a
                sheltered island anchorage. The scenery starts with NOAA survey
                data and OpenStreetMap docks.
              </p>
              <p className={styles.small}>
                Some itinerary locations use nearby stand-in scenes. This is a
                simplified maneuvering simulator; use official charts and
                on-water instruction for real trips.
              </p>
              <Link href="/boats" className={styles.textLink}>
                Meet the whole fleet <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
          <p className={styles.playful}>
            And when curiosity gets the better of you? There’s turbo, breakable
            docks, hull damage, and a very forgiving restart button.
          </p>
        </section>

        <section
          className={`${styles.section} ${styles.start}`}
          aria-labelledby="start-title"
        >
          <p className={styles.eyebrow}>YOUR FIRST FIVE MINUTES</p>
          <h2 id="start-title">No marina reservation required.</h2>
          <div className={styles.steps}>
            <article>
              <span>01 / GET COMFORTABLE</span>
              <h3>Start at Roche.</h3>
              <p>
                Launch the sim, choose <strong>Calm</strong>, and press{" "}
                <strong>Start engines</strong>. Try <strong>FWD</strong> for the
                view from behind the boat.
              </p>
            </article>
            <article>
              <span>02 / FEEL THE RESPONSE</span>
              <h3>Work the levers.</h3>
              <p>
                <kbd>W</kbd>/<kbd>S</kbd> control port. <kbd>I</kbd>/
                <kbd>K</kbd> control starboard. Hold to move a lever; release to
                keep its setting. <kbd>Space</kbd> returns both to neutral.
              </p>
            </article>
            <article>
              <span>03 / MAKE IT YOURS</span>
              <h3>Try that again.</h3>
              <p>
                Use <kbd>A</kbd>/<kbd>D</kbd> for bow thrust. Add wind and
                current. Change boats. Or plug in a Thrustmaster TCA quadrant
                for two physical levers.
              </p>
            </article>
          </div>
          <p className={styles.small}>
            A desktop browser and keyboard are the easiest way aboard. Use
            Chrome for USB throttle-quadrant support.
          </p>
          <Link href="/" prefetch={false} className={styles.primary}>
            Start your first approach <span aria-hidden="true">↗</span>
          </Link>
        </section>

        <section
          id="contribute"
          className={styles.crew}
          aria-labelledby="crew-title"
        >
          <div>
            <p className={styles.eyebrow}>
              BUILT BY A BOATER. BETTER WITH A CREW.
            </p>
            <h2 id="crew-title">
              Your local knowledge
              <br />
              belongs aboard.
            </h2>
            <p>
              This started with a Grand Banks charter in the San Juans and a
              wish for more practice before the dock lines came off. Now it’s an
              invitation to fellow boat people: try it, tell us what feels
              right, and help make the next approach better.
            </p>
            <a className={styles.primary} href={github}>
              Come aboard on GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className={styles.crewList}>
            <a href={`${github}/issues/new`}>
              <span>CAPTAINS + LOCAL CRUISERS</span>
              <strong>Tell us how your boat handles.</strong>
              <p>
                Prop walk, a tricky fairway, a berth that needs work. Specific
                observations make a difference.
              </p>
              <i aria-hidden="true">↗</i>
            </a>
            <a href={`${github}/blob/main/CONTRIBUTING.md`}>
              <span>BUILDERS + TINKERERS</span>
              <strong>Bring your kind of boat nerd.</strong>
              <p>
                Improve a hull, tune a helm, add an exercise, or help with
                charts, sound, and documentation.
              </p>
              <i aria-hidden="true">↗</i>
            </a>
            <a href="#watch">
              <span>FRIENDS AT THE DOCK</span>
              <strong>Pass the film around.</strong>
              <p>
                Send it to your cruising group or the friend who always wants
                one more go at the helm.
              </p>
              <i aria-hidden="true">↗</i>
            </a>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/about" className={styles.wordmark}>
          boat<span>sim</span>
          <i aria-hidden="true">↗</i>
        </Link>
        <p>See you in the fairway.</p>
        <div>
          <Link href="/" prefetch={false}>
            Simulator
          </Link>
          <Link href="/boats">Fleet</Link>
          <a href={github}>GitHub</a>
        </div>
      </footer>
    </div>
  );
}
