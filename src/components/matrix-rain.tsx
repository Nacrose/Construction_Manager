"use client";

import { useEffect, useRef } from "react";

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let isVisible = true;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const onVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Characters: numbers, hex, technical symbols, matrix glyphs
    const chars = "0123456789ABCDEFｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ<>{}[]/*+#%".split("");
    const fontSize = 16;
    const columns = Math.floor(window.innerWidth / fontSize) + 1;
    const drops: number[] = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));

    let lastDraw = 0;
    const fpsInterval = 1000 / 26;

    const draw = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(draw);
      if (!isVisible) return;

      const elapsed = currentTime - lastDraw;
      if (elapsed < fpsInterval) return;
      lastDraw = currentTime - (elapsed % fpsInterval);

      // Fade canvas slowly to create visible glowing trails
      ctx.fillStyle = "rgba(5, 8, 6, 0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `bold ${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        const rand = Math.random();
        if (rand > 0.985) {
          // Bright leading head
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "#00ff66";
          ctx.shadowBlur = 8;
        } else if (rand > 0.92) {
          ctx.fillStyle = "#86efac";
          ctx.shadowColor = "#00ff66";
          ctx.shadowBlur = 4;
        } else {
          ctx.fillStyle = "#00ff66";
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }

        ctx.fillText(text, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-40 select-none"
    />
  );
}
