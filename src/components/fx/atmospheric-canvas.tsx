"use client";

import { useEffect, useRef } from "react";
import { useFXStore } from "@/lib/fx-store";
import { cyberAudio } from "@/lib/cyber-audio";

interface GlassDrop {
  x: number;
  y: number;
  r: number;
  mass: number;
  speed: number;
  trail: { x: number; y: number; r: number; alpha: number }[];
  isSliding: boolean;
  slideProgress: number;
  slideTarget: number;
}

interface WindRainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
}

interface LightningBolt {
  segments: { x1: number; y1: number; x2: number; y2: number }[];
  alpha: number;
  decay: number;
}

export function AtmosphericCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    matrixRainEnabled,
    stormWindEnabled,
    waterDropletsEnabled,
    lightningEnabled,
    mouseTrailEnabled,
    soundEnabled,
    soundVolume,
    keyClicksEnabled,
    thunderSoundEnabled,
    ambientRainAudioEnabled,
    dropletCount,
    matrixSpeed,
    panelOpacity,
  } = useFXStore();

  // Sync panel opacity CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty("--panel-alpha", String(panelOpacity));
  }, [panelOpacity]);

  // Key press mechanical sound listener
  useEffect(() => {
    if (!soundEnabled || !keyClicksEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      cyberAudio.playKeyClick(soundVolume);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [soundEnabled, keyClicksEnabled, soundVolume]);

  // Ambient rain audio control
  useEffect(() => {
    if (soundEnabled && ambientRainAudioEnabled) {
      cyberAudio.startAmbientRain(soundVolume);
    } else {
      cyberAudio.stopAmbientRain();
    }
    return () => {
      cyberAudio.stopAmbientRain();
    };
  }, [soundEnabled, ambientRainAudioEnabled, soundVolume]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let isVisible = true;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    resize();
    window.addEventListener("resize", resize);

    const onVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // ───────────────── Layer 1: Matrix Digital Rain ─────────────────
    const glyphChars = "0123456789ABCDEFｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ<>{}[]/*+#%".split("");
    const fontSize = 16;
    const matrixCols = Math.floor(width / fontSize) + 1;
    const matrixDrops: number[] = Array.from({ length: matrixCols }, () => Math.floor(Math.random() * -50));

    // ───────────────── Layer 2: Storm Wind & Rain Streaks ─────────────────
    const stormStreaks: WindRainDrop[] = Array.from({ length: 140 }, () => ({
      x: Math.random() * (width + 200) - 100,
      y: Math.random() * height,
      length: Math.random() * 26 + 16,
      speed: Math.random() * 16 + 18,
      opacity: Math.random() * 0.45 + 0.25,
    }));
    let windTime = 0;

    // ───────────────── Layer 3: Glass Water Droplets & Trickles ─────────────────
    const glassDrops: GlassDrop[] = Array.from({ length: dropletCount }, () => {
      const isBig = Math.random() > 0.72;
      const r = isBig ? Math.random() * 3.5 + 3.0 : Math.random() * 2.2 + 1.2;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r,
        mass: r * 1.5,
        speed: 0,
        trail: [],
        isSliding: isBig && Math.random() > 0.5,
        slideProgress: 0,
        slideTarget: Math.random() * 180 + 60,
      };
    });

    const ripples: Ripple[] = [];

    // Interactive mouse cursor wake
    let lastMouseX = -100;
    let lastMouseY = -100;

    const onMouseMove = (e: MouseEvent) => {
      if (!mouseTrailEnabled) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      const dist = Math.hypot(dx, dy);

      if (dist > 30) {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        ripples.push({
          x: e.clientX,
          y: e.clientY,
          r: 3,
          maxR: Math.random() * 22 + 16,
          alpha: 0.75,
        });

        // Distort nearby glass droplets
        for (const drop of glassDrops) {
          if (Math.hypot(drop.x - e.clientX, drop.y - e.clientY) < 45) {
            drop.isSliding = true;
            drop.speed += 1.5;
          }
        }
      }
    };

    window.addEventListener("mousemove", onMouseMove);

    // ───────────────── Layer 4: Lightning Simulator ─────────────────
    let currentBolt: LightningBolt | null = null;
    let flashAlpha = 0;
    let nextLightningTime = Date.now() + Math.random() * 6000 + 3000;

    const createLightningBranch = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      depth: number,
      segments: { x1: number; y1: number; x2: number; y2: number }[]
    ) => {
      if (depth === 0) return;

      const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * 45;
      const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * 20;

      segments.push({ x1, y1, x2: midX, y2: midY });
      segments.push({ x1: midX, y1: midY, x2, y2 });

      if (Math.random() > 0.65 && depth > 1) {
        const branchX = midX + (Math.random() - 0.5) * 80;
        const branchY = midY + Math.random() * 60 + 20;
        createLightningBranch(midX, midY, branchX, branchY, depth - 1, segments);
      }

      createLightningBranch(x1, y1, midX, midY, depth - 1, segments);
      createLightningBranch(midX, midY, x2, y2, depth - 1, segments);
    };

    const triggerLightning = () => {
      const startX = Math.random() * width;
      const startY = 0;
      const endX = startX + (Math.random() - 0.5) * (width * 0.4);
      const endY = height * (0.6 + Math.random() * 0.4);

      const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
      createLightningBranch(startX, startY, endX, endY, 4, segments);

      currentBolt = {
        segments,
        alpha: 1.0,
        decay: 0.08 + Math.random() * 0.05,
      };

      flashAlpha = 0.22 + Math.random() * 0.15;
      nextLightningTime = Date.now() + Math.random() * 9000 + 4000;

      if (soundEnabled && thunderSoundEnabled) {
        cyberAudio.playThunder(soundVolume);
      }
    };

    // ───────────────── Main Render Loop ─────────────────
    let lastDraw = 0;
    const fpsInterval = 1000 / 28;

    const render = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(render);
      if (!isVisible) return;

      const anyEffectActive = matrixRainEnabled || stormWindEnabled || waterDropletsEnabled || lightningEnabled || ripples.length > 0;
      if (!anyEffectActive && flashAlpha <= 0 && !currentBolt) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      const elapsed = currentTime - lastDraw;
      if (elapsed < fpsInterval) return;
      lastDraw = currentTime - (elapsed % fpsInterval);

      // Base canvas clearing
      ctx.fillStyle = matrixRainEnabled ? "rgba(5, 8, 6, 0.14)" : "rgba(5, 8, 6, 0.45)";
      ctx.fillRect(0, 0, width, height);

      // 1. Lightning Horizon Flash
      if (lightningEnabled) {
        if (Date.now() > nextLightningTime) {
          triggerLightning();
        }

        if (flashAlpha > 0.01) {
          ctx.fillStyle = `rgba(0, 255, 102, ${flashAlpha * 0.45})`;
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = `rgba(180, 255, 220, ${flashAlpha * 0.25})`;
          ctx.fillRect(0, 0, width, height);
          flashAlpha *= 0.72;
        }

        if (currentBolt) {
          ctx.save();
          ctx.strokeStyle = `rgba(255, 255, 255, ${currentBolt.alpha})`;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = "#00ff66";
          ctx.shadowBlur = 16;

          ctx.beginPath();
          for (const seg of currentBolt.segments) {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
          }
          ctx.stroke();
          ctx.restore();

          currentBolt.alpha -= currentBolt.decay;
          if (currentBolt.alpha <= 0) currentBolt = null;
        }
      }

      // 2. Matrix Digital Rain Layer
      if (matrixRainEnabled) {
        ctx.font = `bold ${fontSize}px monospace`;

        for (let i = 0; i < matrixDrops.length; i++) {
          const text = glyphChars[Math.floor(Math.random() * glyphChars.length)];
          const x = i * fontSize;
          const y = matrixDrops[i] * fontSize;

          const rand = Math.random();
          if (rand > 0.982) {
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "#00ff66";
            ctx.shadowBlur = 8;
          } else if (rand > 0.91) {
            ctx.fillStyle = "#86efac";
            ctx.shadowColor = "#00ff66";
            ctx.shadowBlur = 4;
          } else {
            ctx.fillStyle = "#00ff66";
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
          }

          ctx.fillText(text, x, y);

          if (y > height && Math.random() > 0.975) {
            matrixDrops[i] = 0;
          }
          matrixDrops[i] += Math.max(1, Math.floor(matrixSpeed / 2));
        }
      }

      // 3. Storm Wind & Rain Streaks Layer
      if (stormWindEnabled) {
        windTime += 0.025;
        const windX = Math.sin(windTime) * 4.5 - 4.0; // Angled storm wind

        ctx.save();
        ctx.lineWidth = 1.3;

        for (const drop of stormStreaks) {
          ctx.strokeStyle = `rgba(134, 239, 172, ${drop.opacity * 0.7})`;
          ctx.beginPath();
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + windX * (drop.length / 8), drop.y + drop.length);
          ctx.stroke();

          drop.x += windX;
          drop.y += drop.speed;

          if (drop.y > height) {
            drop.y = -drop.length;
            drop.x = Math.random() * (width + 150) - 50;
          }
        }
        ctx.restore();
      }

      // 4. Interactive Ripple Rings
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rip = ripples[i];
        ctx.save();
        ctx.strokeStyle = `rgba(0, 255, 102, ${rip.alpha * 0.45})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        rip.r += 1.4;
        rip.alpha *= 0.88;
        if (rip.r >= rip.maxR || rip.alpha < 0.02) {
          ripples.splice(i, 1);
        }
      }

      // 5. Physical Glass Water Droplets & Trickles Layer
      if (waterDropletsEnabled) {
        if (Math.random() > 0.72) {
          ripples.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: 1,
            maxR: Math.random() * 18 + 10,
            alpha: 0.65,
          });
        }

        for (const drop of glassDrops) {
          // Trail
          if (drop.trail.length > 0) {
            for (let t = 0; t < drop.trail.length; t++) {
              const tr = drop.trail[t];
              ctx.fillStyle = `rgba(134, 239, 172, ${tr.alpha * 0.25})`;
              ctx.beginPath();
              ctx.arc(tr.x, tr.y, tr.r * 0.65, 0, Math.PI * 2);
              ctx.fill();
              tr.alpha *= 0.94;
            }
            drop.trail = drop.trail.filter((t) => t.alpha > 0.02);
          }

          // Main drop with specular glint
          ctx.save();
          ctx.fillStyle = "rgba(0, 255, 102, 0.22)";
          ctx.shadowColor = "rgba(0, 255, 102, 0.4)";
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "rgba(220, 255, 235, 0.65)";
          ctx.beginPath();
          ctx.arc(drop.x - drop.r * 0.25, drop.y - drop.r * 0.25, drop.r * 0.45, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(drop.x - drop.r * 0.35, drop.y - drop.r * 0.35, drop.r * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Droplet sliding physics
          if (drop.isSliding) {
            drop.speed += 0.4;
            drop.y += drop.speed;
            drop.slideProgress += drop.speed;

            if (Math.random() > 0.35) {
              drop.trail.push({ x: drop.x, y: drop.y, r: drop.r, alpha: 0.6 });
            }

            if (drop.slideProgress >= drop.slideTarget) {
              drop.isSliding = false;
              drop.speed = 0;
              drop.slideProgress = 0;
              drop.slideTarget = Math.random() * 220 + 80;
            }

            if (drop.y > height + 20) {
              drop.y = -10;
              drop.x = Math.random() * width;
              drop.isSliding = Math.random() > 0.6;
              drop.speed = 0;
            }
          } else {
            if (Math.random() > 0.992) {
              drop.r = Math.min(drop.r + 0.15, 6.5);
              if (drop.r > 3.8 && Math.random() > 0.7) {
                drop.isSliding = true;
              }
            }
          }
        }
      }
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    matrixRainEnabled,
    stormWindEnabled,
    waterDropletsEnabled,
    lightningEnabled,
    mouseTrailEnabled,
    soundEnabled,
    thunderSoundEnabled,
    soundVolume,
    dropletCount,
    matrixSpeed,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 select-none"
    />
  );
}
