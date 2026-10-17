import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { ArrowDownRight, Volume2 } from "lucide-react";
import { memo, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Link } from "wouter";
import MusicPlayer, { type PlayerTrack } from "@/components/MusicPlayer";
import SiteFooter from "@/components/SiteFooter";
import TopDock from "@/components/TopDock";
import { RELEASES_URL, REPOSITORY_URL } from "@/lib/site";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const MATRIX_COLUMNS = 60;
const MATRIX_ROWS = 42;
const MATRIX_CELLS = Array.from({ length: MATRIX_COLUMNS * MATRIX_ROWS }, (_, id) => ({
  column: id % MATRIX_COLUMNS,
  row: Math.floor(id / MATRIX_COLUMNS),
  id,
}));
type MatrixCell = (typeof MATRIX_CELLS)[number];

/** Number of bars in the player's spectrum scope. */
const SPECTRUM_BARS = 28;
/** Seconds of overlap when one track hands over to the next. */
const CROSSFADE_SECONDS = 3;
/** Seconds used to ramp the master gain when the volume slider moves. */
const VOLUME_RAMP_SECONDS = 0.4;
/** Below this overall energy the matrix is treated as silent. */
const SILENCE_THRESHOLD = 0.025;

const tracks: PlayerTrack[] = [
  { title: "House (1)", artist: "Glyphix", source: "/audio/glyphix.m4a", cover: "" },
  { title: "House (2)", artist: "Glyphix", source: "/audio/track-01.m4a", cover: "" },
  { title: "House (3)", artist: "Glyphix", source: "/audio/track-03.m4a", cover: "" },
];

const supportedDevices = [
  "Nothing Phone (1)",
  "Nothing Phone (2), (2a), (2a) Plus",
  "Nothing Phone (3), (3a), (3a) Pro",
  "Nothing Phone (4a), (4b), (4a) Pro",
];

const zones: [id: string, label: string, range: string][] = [
  ["01", "Bass", "28–72 Hz"],
  ["02", "Kick", "72–120 Hz"],
  ["03", "Low", "120–360 Hz"],
  ["04", "Mid", "360–2k Hz"],
  ["05", "High", "2–7k Hz"],
  ["06", "Air", "7–16k Hz"],
];

type Levels = { bass: number; low: number; mid: number; high: number; overall: number };
type DeckId = "a" | "b";

const SILENT_LEVELS: Levels = { bass: 0, low: 0, mid: 0, high: 0, overall: 0 };
const otherDeck = (deck: DeckId): DeckId => (deck === "a" ? "b" : "a");

/* ------------------------------------------------------------------ */
/* LED matrix                                                          */
/* ------------------------------------------------------------------ */

/**
 * Decides how brightly one matrix cell is lit for the current audio levels.
 * The field draws a wandering mid-range ribbon, four bass-to-treble columns along
 * the bottom, and an expanding ring in the upper right that follows the bass.
 */
function cellIntensity(cell: MatrixCell, levels: Levels): { intensity: number; lime: boolean } {
  if (levels.overall < SILENCE_THRESHOLD) return { intensity: 0, lime: false };

  let intensity = 0;

  // Ribbon
  const ribbonRow =
    22 +
    Math.sin(cell.column * 0.22 + levels.high * 14) * (2 + levels.mid * 9) +
    (levels.low - 0.5) * 6;
  const ribbonDistance = Math.abs(cell.row - ribbonRow);
  if (ribbonDistance < 0.55 && levels.mid > 0.06) intensity = 3;
  else if (ribbonDistance < 1.3 && levels.mid > 0.035) intensity = 2;
  else if (ribbonDistance < 2.05 && levels.overall > 0.05) intensity = 1;

  // Equaliser columns
  const columnCentres = [11, 25, 39, 53];
  const columnLevels = [levels.bass, levels.low, levels.mid, levels.high];
  columnCentres.forEach((centre, index) => {
    const height = Math.round(columnLevels[index] * 18);
    const horizontal = Math.abs(cell.column - centre);
    const vertical = Math.abs(cell.row - 37);
    if (horizontal < 1.25 && vertical < height) {
      intensity = Math.max(intensity, vertical < height * 0.3 ? 3 : vertical < height * 0.67 ? 2 : 1);
    }
  });

  // Bass ring
  const ringDistance = Math.abs(Math.hypot(cell.column - 47, cell.row - 15) - (3 + levels.bass * 15));
  if (ringDistance < 0.5 && levels.bass > 0.07) intensity = Math.max(intensity, 3);
  else if (ringDistance < 1.15 && levels.bass > 0.04) intensity = Math.max(intensity, 1);

  const lime = intensity === 3 && (levels.bass > 0.24 || (levels.high > 0.35 && cell.column % 3 === 0));
  return { intensity, lime };
}

const MatrixField = memo(function MatrixField({
  fieldRef,
  gridRef,
}: {
  fieldRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="matrix-field" ref={fieldRef} aria-hidden="true">
      <div className="matrix-grid" ref={gridRef}>
        {MATRIX_CELLS.map((cell) => (
          <i className="matrix-cell" key={cell.id} />
        ))}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.72);
  const [levels, setLevels] = useState<Levels>(SILENT_LEVELS);
  const [zonesVisible, setZonesVisible] = useState(false);
  const [docked, setDocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // DOM
  const mainRef = useRef<HTMLElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const matrixFieldRef = useRef<HTMLDivElement>(null);
  const matrixGridRef = useRef<HTMLDivElement>(null);
  const spectrumRef = useRef<HTMLDivElement>(null);
  const finaleRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const zoneCardRef = useRef<HTMLDivElement>(null);
  const deckARef = useRef<HTMLAudioElement>(null);
  const deckBRef = useRef<HTMLAudioElement>(null);

  // Web Audio graph
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Playback bookkeeping that must not trigger renders
  const activeDeckRef = useRef<DeckId>("a");
  const crossfadingRef = useRef(false);
  const frameRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const lastStateTimeRef = useRef(0);
  const finaleSpinRef = useRef(0);
  const levelsRef = useRef<Levels>(SILENT_LEVELS);
  const cellCacheRef = useRef<Int8Array | null>(null);
  const autoplayTriedRef = useRef(false);

  const deckElement = (deck: DeckId) => (deck === "a" ? deckARef.current : deckBRef.current);
  const deckGain = (deck: DeckId) => (deck === "a" ? gainARef.current : gainBRef.current);

  /** Lights the matrix cells for the given levels, touching the DOM only where a cell changed. */
  const paintMatrix = (current: Levels, active: boolean) => {
    const grid = matrixGridRef.current;
    const field = matrixFieldRef.current;
    if (!grid || !field) return;

    const cache = cellCacheRef.current ?? new Int8Array(MATRIX_CELLS.length);
    cellCacheRef.current = cache;
    field.classList.toggle("music-playing", active && current.overall >= SILENCE_THRESHOLD);

    for (const cell of MATRIX_CELLS) {
      const element = grid.children[cell.id] as HTMLElement | undefined;
      if (!element) continue;
      const { intensity, lime } = active ? cellIntensity(cell, current) : { intensity: 0, lime: false };
      const signature = intensity + (lime ? 4 : 0);
      if (cache[cell.id] === signature) continue;
      cache[cell.id] = signature;
      element.classList.toggle("music-lit", intensity > 0);
      element.classList.toggle("music-lime", lime);
      if (intensity > 0) element.dataset.intensity = String(intensity);
      else delete element.dataset.intensity;
    }
  };

  /** Drives the player scope bars and the finale rings straight from CSS variables. */
  const paintScopeAndFinale = (frequency: Uint8Array | null, current: Levels, active: boolean) => {
    const scope = spectrumRef.current;
    if (scope) {
      const bars = scope.children;
      for (let index = 0; index < bars.length; index += 1) {
        let level = 0;
        if (active && frequency) {
          const start = Math.floor(1 + Math.pow(index / SPECTRUM_BARS, 1.7) * 108);
          const end = Math.max(start + 1, Math.floor(1 + Math.pow((index + 1) / SPECTRUM_BARS, 1.7) * 108));
          let sum = 0;
          for (let bin = start; bin < end; bin += 1) sum += frequency[bin] || 0;
          level = Math.min(1, (sum / (end - start) / 255) * 1.5);
        }
        (bars[index] as HTMLElement).style.setProperty("--level", level.toFixed(3));
      }
    }

    const finale = finaleRef.current;
    if (finale) {
      finaleSpinRef.current = (finaleSpinRef.current + (active ? 0.12 + current.overall * 0.9 : 0.03)) % 360;
      finale.style.setProperty("--finale-spin", finaleSpinRef.current.toFixed(2));
      finale.style.setProperty("--finale-pulse", (active ? current.bass : 0).toFixed(3));
      finale.style.setProperty("--finale-energy", (active ? current.overall : 0).toFixed(3));
    }
  };

  /** Builds the two-deck crossfading graph once, on the first user-driven play. */
  const ensureAudioGraph = (): boolean => {
    if (analyserRef.current) return true;
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return false;

    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.68;

      const master = context.createGain();
      master.gain.value = volume;
      const gainA = context.createGain();
      const gainB = context.createGain();
      gainA.gain.value = 1;
      gainB.gain.value = 0;
      deckA.volume = 1;
      deckB.volume = 1;

      context.createMediaElementSource(deckA).connect(gainA);
      context.createMediaElementSource(deckB).connect(gainB);
      gainA.connect(master);
      gainB.connect(master);
      master.connect(analyser);
      analyser.connect(context.destination);

      audioContextRef.current = context;
      analyserRef.current = analyser;
      masterGainRef.current = master;
      gainARef.current = gainA;
      gainBRef.current = gainB;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      return true;
    } catch {
      return false;
    }
  };

  const stopVisuals = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    levelsRef.current = SILENT_LEVELS;
    paintMatrix(SILENT_LEVELS, false);
    paintScopeAndFinale(null, SILENT_LEVELS, false);
    setLevels(SILENT_LEVELS);
  };

  /** Analysis loop: samples about 25 times a second and smooths against the previous frame. */
  const startVisuals = () => {
    const analyser = analyserRef.current;
    const frequency = frequencyDataRef.current;
    if (!analyser || !frequency || frameRef.current) return;

    const average = (from: number, to: number) => {
      let sum = 0;
      for (let bin = from; bin < to; bin += 1) sum += frequency[bin] || 0;
      return sum / Math.max(1, to - from) / 255;
    };
    const blend = (previous: number, next: number) => previous * 0.48 + next * 0.52;

    const tick = (now: number) => {
      if (now - lastFrameTimeRef.current > 40) {
        lastFrameTimeRef.current = now;
        analyser.getByteFrequencyData(frequency);

        const previous = levelsRef.current;
        const raw = {
          bass: average(1, 7),
          low: average(7, 19),
          mid: average(19, 54),
          high: average(54, 108),
          overall: average(1, 108),
        };
        const next: Levels = {
          bass: blend(previous.bass, raw.bass),
          low: blend(previous.low, raw.low),
          mid: blend(previous.mid, raw.mid),
          high: blend(previous.high, raw.high),
          overall: blend(previous.overall, raw.overall),
        };
        levelsRef.current = next;
        paintMatrix(next, true);
        paintScopeAndFinale(frequency, next, true);

        // React only needs coarse, infrequent updates (CSS variables on the response graphic).
        const delta = Math.max(
          Math.abs(next.bass - previous.bass),
          Math.abs(next.low - previous.low),
          Math.abs(next.mid - previous.mid),
          Math.abs(next.high - previous.high),
          Math.abs(next.overall - previous.overall),
        );
        if (now - lastStateTimeRef.current > 96 && delta >= 0.012) {
          lastStateTimeRef.current = now;
          setLevels(next);
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    tick(performance.now());
  };

  const beginPlayback = () => {
    setError(null);
    setIsPlaying(true);
    if (ensureAudioGraph()) {
      audioContextRef.current?.resume().catch(() => {});
      startVisuals();
    }
  };

  /** Starts the idle deck on the chosen track and fades the active deck out underneath it. */
  const crossfadeTo = (index: number) => {
    if (crossfadingRef.current || !ensureAudioGraph()) return;
    const context = audioContextRef.current;
    const outgoingId = activeDeckRef.current;
    const incomingId = otherDeck(outgoingId);
    const outgoingGain = deckGain(outgoingId);
    const incomingGain = deckGain(incomingId);
    const incoming = deckElement(incomingId);
    const outgoing = deckElement(outgoingId);
    if (!context || !outgoingGain || !incomingGain || !incoming || !outgoing) return;

    crossfadingRef.current = true;
    context.resume().catch(() => {});
    incoming.src = tracks[index].source;
    incoming.currentTime = 0;
    incoming.load();

    const now = context.currentTime;
    outgoingGain.gain.cancelScheduledValues(now);
    incomingGain.gain.cancelScheduledValues(now);
    outgoingGain.gain.setValueAtTime(outgoingGain.gain.value, now);
    incomingGain.gain.setValueAtTime(0, now);
    outgoingGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SECONDS);
    incomingGain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SECONDS);

    activeDeckRef.current = incomingId;
    setTrackIndex(index);
    setCurrentTime(0);
    setDuration(0);

    incoming
      .play()
      .then(() => beginPlayback())
      .catch(() => {
        // Roll back so the previous track keeps playing at full level.
        crossfadingRef.current = false;
        activeDeckRef.current = outgoingId;
        outgoingGain.gain.cancelScheduledValues(context.currentTime);
        outgoingGain.gain.setValueAtTime(1, context.currentTime);
        incomingGain.gain.setValueAtTime(0, context.currentTime);
        setIsPlaying(false);
      });

    window.setTimeout(() => {
      if (activeDeckRef.current !== outgoingId) outgoing.pause();
      crossfadingRef.current = false;
    }, CROSSFADE_SECONDS * 1000);
  };

  const stepTrack = (delta: number) => crossfadeTo((trackIndex + delta + tracks.length) % tracks.length);

  const handleAudioError = () => {
    setError("Audio failed to load. Check your connection, or try again later.");
    setIsPlaying(false);
    stopVisuals();
  };

  const togglePlayback = () => {
    const deck = deckElement(activeDeckRef.current);
    if (!deck) return;
    if (isPlaying) {
      deck.pause();
      setIsPlaying(false);
      stopVisuals();
    } else {
      deck
        .play()
        .then(() => beginPlayback())
        .catch(() => setIsPlaying(false));
    }
  };

  const seek = (seconds: number) => {
    const deck = deckElement(activeDeckRef.current);
    if (!deck || !Number.isFinite(seconds)) return;
    deck.currentTime = seconds;
    setCurrentTime(seconds);
  };

  /** Updates the progress readout and starts the next track as the crossfade window opens. */
  const handleTimeUpdate = (deckId: DeckId) => (event: React.SyntheticEvent<HTMLAudioElement>) => {
    if (activeDeckRef.current !== deckId) return;
    const element = event.currentTarget;
    setCurrentTime(element.currentTime);
    if (
      !crossfadingRef.current &&
      Number.isFinite(element.duration) &&
      element.duration > 0 &&
      element.duration - element.currentTime <= CROSSFADE_SECONDS
    ) {
      crossfadeTo((trackIndex + 1) % tracks.length);
    }
  };

  // Volume: ramp the master gain once the graph exists, otherwise set the element volume.
  useEffect(() => {
    const master = masterGainRef.current;
    const context = audioContextRef.current;
    if (master && context) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(Math.max(1e-4, volume), now + VOLUME_RAMP_SECONDS);
      return;
    }
    const deck = deckElement(activeDeckRef.current);
    if (deck) deck.volume = volume;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume]);

  // Try to autoplay once; browsers usually refuse until the first gesture (handled below).
  useEffect(() => {
    if (autoplayTriedRef.current) return;
    autoplayTriedRef.current = true;
    deckARef.current
      ?.play()
      .then(() => beginPlayback())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First user gesture starts playback if autoplay was blocked.
  useEffect(() => {
    if (isPlaying) return;
    const start = () => {
      deckElement(activeDeckRef.current)
        ?.play()
        .then(() => beginPlayback())
        .catch(() => {});
    };
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    paintMatrix(levelsRef.current, isPlaying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Tear down the analysis loop and the audio context on unmount.
  useEffect(
    () => () => {
      stopVisuals();
      audioContextRef.current?.close().catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Smooth scrolling and scroll-linked scenes. Skipped entirely for reduced-motion users.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setZonesVisible(true);
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.82, autoRaf: false });
    const onTick = (time: number) => lenis.raf(time * 1000);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    const context = gsap.context(() => {
      if (cameraRef.current) {
        gsap.fromTo(
          cameraRef.current,
          { xPercent: -50, yPercent: -50, x: -120, y: 80, scale: 1.04, rotation: -5 },
          {
            x: 130,
            y: -100,
            scale: 1.28,
            rotation: 5,
            ease: "none",
            scrollTrigger: { trigger: mainRef.current, start: "top top", end: "bottom bottom", scrub: 1.15 },
          },
        );
      }

      gsap.utils.toArray<HTMLElement>(".gsap-reveal").forEach((element) =>
        gsap.fromTo(
          element,
          { autoAlpha: 0, y: 34 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 86%", once: true },
          },
        ),
      );

      gsap.utils.toArray<HTMLElement>(".matrix-scene").forEach((scene) =>
        ScrollTrigger.create({
          trigger: scene,
          start: "top 88%",
          end: "bottom 12%",
          toggleClass: { targets: scene, className: "is-motion-active" },
        }),
      );

      if (zoneCardRef.current) {
        ScrollTrigger.create({
          trigger: zoneCardRef.current,
          start: "top 78%",
          once: true,
          onEnter: () => setZonesVisible(true),
        });
      }

      // Once the hero scrolls away, the player becomes the docked corner island.
      if (heroRef.current) {
        ScrollTrigger.create({
          trigger: heroRef.current,
          start: "bottom 64%",
          onEnter: () => setDocked(true),
          onEnterBack: () => setDocked(false),
          onLeaveBack: () => setDocked(false),
        });
      }
    }, mainRef);

    return () => {
      context.revert();
      lenis.destroy();
      gsap.ticker.remove(onTick);
    };
  }, []);

  const responseActive = isPlaying && volume > 0.01;
  const responseStyle = {
    "--bass": levels.bass.toFixed(3),
    "--pulse-duration": `${Math.max(0.52, 1.7 - levels.bass * 1.2).toFixed(2)}s`,
  } as CSSProperties;

  return <div className="matrix-site">
    <TopDock repositoryUrl={REPOSITORY_URL} />
    <main id="top" ref={mainRef}><div className="matrix-viewport"><div className="matrix-camera" ref={cameraRef}><MatrixField fieldRef={matrixFieldRef} gridRef={matrixGridRef} /></div></div>
      <section className="matrix-scene hero-scene" ref={heroRef} aria-labelledby="hero-title">
        <div className="status-banner" aria-label="Keep Android Open">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5Zm-8 8 8 4 8-4v7l-8 4-8-4v-7Z" fill="currentColor" />
          </svg>
          <p>
            <strong>KEEP ANDROID OPEN</strong> — Android should stay open, flexible, and user-controlled.
          </p>
          <span className="status-banner-cta">android freedom</span>
        </div>

        <div className="hero-content gsap-reveal">
          <h1 id="hero-title">music in<br /><strong>motion.</strong></h1>
          <p>Glyphix turns your Nothing Glyph Interface into a responsive light show for the music you already love—tuned for clarity, rhythm, and a more personal device experience.</p>
          <div className="hero-actions">
            <a className="action-button action-primary" href={REPOSITORY_URL} target="_blank" rel="noreferrer">Open GitHub <ArrowDownRight size={17} /></a>
            <a className="action-button action-quiet" href="#mapping">See the mapping <span aria-hidden="true" /></a>
          </div>
        </div>
        <MusicPlayer
          track={tracks[trackIndex]}
          isPlaying={isPlaying}
          volume={volume}
          docked={docked}
          currentTime={currentTime}
          duration={duration}
          error={error}
          spectrumRef={spectrumRef}
          spectrumBars={SPECTRUM_BARS}
          onPrevious={() => stepTrack(-1)}
          onToggle={togglePlayback}
          onNext={() => stepTrack(1)}
          onVolume={setVolume}
          onSeek={seek}
        />
      </section>
      <section className="matrix-scene mapping-scene" id="mapping" aria-labelledby="mapping-title"><div className="mapping-copy gsap-reveal"><h2 id="mapping-title">Each <em>light</em>,<br />gets its own <em>voice.</em></h2><p>Glyphix analyzes the shape of your audio and converts it into the Glyph display design language—tight and readable, not just decorative.</p></div><div className={`zone-card gsap-reveal ${zonesVisible ? "is-visible" : ""}`} ref={zoneCardRef}><div className="zone-card-head"><span>Glyph bands</span><b>live</b></div>{zones.map(([id, label, range], index) => <div key={id} className="zone-line" style={{ "--delay": `${index * 90}ms`, "--meter": `${30 + index * 11}%` } as CSSProperties}><span>{id}</span><strong>{label}</strong><i><b /></i><em>{range}</em></div>)}</div></section>
      <section className="matrix-scene brightness-scene" id="brightness" aria-labelledby="brightness-title"><div className="brightness-copy gsap-reveal"><h2 id="brightness-title">More than<br />just a <em>screen</em>.</h2><p>Glyphix keeps the lights responsive in real time, using subtle brightness changes to preserve the feel of the song instead of turning it into a noisy effect.</p><a className="action-button action-primary" href={REPOSITORY_URL} target="_blank" rel="noreferrer">Explore the repo <ArrowDownRight size={17} /></a></div><div className="brightness-minimal gsap-reveal"><div className="brightness-minimal-value"><span>response</span><strong>1.8k<span>Hz</span></strong></div><div className="brightness-minimal-bar"><i /></div><div className="brightness-minimal-facts"><span>gain <b>92<span>%</span></b></span><span>latency <b>12<span>ms</span></b></span></div></div></section>
      <section className="matrix-scene response-scene" id="response" aria-labelledby="response-title"><div className={`response-graphic gsap-reveal ${responseActive ? "is-audio-active" : "is-audio-idle"}`} style={responseStyle}><span className="response-ring ring-a" /><span className="response-ring ring-b" /><span className="response-ring ring-c" /><span className="response-core"><Volume2 size={26} /></span></div><div className="response-copy gsap-reveal"><h2 id="response-title">Listen to the <em>pulse.</em></h2><p>When a track plays, Glyphix reacts in sync with the beat, creating a visible, physical rhythm without overpowering the device UI.</p><div className="response-notes"><span><i />bass</span><span><i />low-mid</span><span><i />air</span></div></div></section>
      <section className="matrix-scene devices-scene" id="devices" aria-labelledby="devices-title"><div className="devices-title gsap-reveal"><h2 id="devices-title">Supported<br /><em>phones.</em></h2><p>Glyphix is tuned for the Nothing phone family and keeps compatibility clear for the devices it supports best.</p></div><div className="device-groups gsap-reveal"><div className="device-list"><div className="device-list-head"><span>Supported</span><b>devices</b></div>{supportedDevices.map((device, index) => <div key={device} className="device-line"><span>{String(index + 1).padStart(2, "0")}</span><strong>{device}</strong><i /></div>)}</div></div></section>
      <section className="matrix-scene finale-scene" aria-labelledby="finale-title">
        <div className="finale-matrix" ref={finaleRef} aria-hidden="true">
          <i className="finale-ring finale-ring-1" />
          <i className="finale-ring finale-ring-2" />
          <i className="finale-ring finale-ring-3" />
          <i className="finale-ring finale-ring-4" />
          <i className="finale-orbit finale-orbit-a"><b /></i>
          <i className="finale-orbit finale-orbit-b"><b /></i>
        </div>
        <div className="finale-content gsap-reveal"><h2 id="finale-title">Play a track.<br /><em>Watch the lights.</em></h2><p>Download Glyphix and try it with your own music.</p><div className="finale-actions"><a className="action-button action-primary" href={RELEASES_URL} target="_blank" rel="noreferrer">Download Glyphix <ArrowDownRight size={17} /></a><Link className="action-button action-quiet" href="/support">Need help? <span aria-hidden="true" /></Link></div></div>
      </section>
      <audio ref={deckARef} src={tracks[0].source} preload="auto" onPlay={beginPlayback} onError={handleAudioError} onTimeUpdate={handleTimeUpdate("a")} onLoadedMetadata={(event) => { if (activeDeckRef.current === "a") setDuration(event.currentTarget.duration || 0); }} />
      <audio ref={deckBRef} preload="auto" onPlay={beginPlayback} onError={handleAudioError} onTimeUpdate={handleTimeUpdate("b")} onLoadedMetadata={(event) => { if (activeDeckRef.current === "b") setDuration(event.currentTarget.duration || 0); }} />
    </main>
    <SiteFooter />
  </div>;
}