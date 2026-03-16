import { useEffect, useRef } from 'react';
import { animate } from 'motion';

interface GaugeRingProps {
  value: number; // 0–100
  size?: number;
  strokeWidth?: number;
  label?: string;
}

function colorForValue(v: number) {
  if (v >= 75) return '#FF0033';
  if (v >= 50) return '#FF3366';
  if (v >= 25) return '#FF9933';
  return '#00FF88';
}

export function GaugeRing({ value, size = 96, strokeWidth = 6, label }: GaugeRingProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const color = colorForValue(value);

  useEffect(() => {
    const circle = circleRef.current;
    const text = textRef.current;
    if (!circle || !text) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      circle.style.strokeDashoffset = String(circumference * (1 - value / 100));
      text.textContent = `${Math.round(value)}`;
      return;
    }

    const controls = animate(0, value, {
      duration: 1,
      ease: [0.4, 0, 0.2, 1],
      onUpdate(v) {
        circle.style.strokeDashoffset = String(circumference * (1 - v / 100));
        text.textContent = `${Math.round(v)}`;
      },
    });
    return () => controls.stop();
  }, [value, circumference]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? 'Score'}: ${Math.round(value)} out of 100`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke 0.3s' }}
        />
        <text
          ref={textRef}
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="#fff"
          fontSize={size * 0.28}
          fontWeight={700}
          fontFamily="Lexend, sans-serif"
        >
          0
        </text>
      </svg>
      {label && (
        <span style={{ fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      )}
    </div>
  );
}
