import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { tokens } from '../../theme/tokens';

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showGradientFill?: boolean;
  strokeWidth?: number;
}

/**
 * Minimal sparkline chart using react-native-svg.
 * Renders inline in token cards for price/volume trend visualization.
 */
export function SparklineChart({
  data,
  width = 64,
  height = 28,
  color,
  showGradientFill = true,
  strokeWidth = 1.5,
}: SparklineChartProps) {
  const { pathD, fillD, trendColor } = useMemo(() => {
    if (!data || data.length < 2) {
      return { pathD: '', fillD: '', trendColor: tokens.white35 };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;
    const w = width - padding * 2;
    const h = height - padding * 2;

    // Determine trend color from data direction
    const trend = data[data.length - 1] >= data[0];
    const tc = color ?? (trend ? tokens.success : tokens.risk.critical);

    // Build smooth curve points
    const points = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * w,
      y: padding + h - ((v - min) / range) * h,
    }));

    // Catmull-Rom to cubic bezier for smooth curves
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    // Fill path (closed polygon under the curve)
    const fd = `${d} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { pathD: d, fillD: fd, trendColor: tc };
  }, [data, width, height, color]);

  if (!data || data.length < 2) {
    return <View style={{ width, height }} />;
  }

  const gradientId = `sparkGrad_${trendColor.replace('#', '')}`;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={trendColor} stopOpacity={0.25} />
            <Stop offset="1" stopColor={trendColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {showGradientFill && (
          <Path d={fillD} fill={`url(#${gradientId})`} />
        )}
        <Path
          d={pathD}
          fill="none"
          stroke={trendColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
