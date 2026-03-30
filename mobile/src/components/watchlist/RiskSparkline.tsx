import React from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { tokens } from '../../theme/tokens';

interface RiskSparklineProps {
  dataPoints: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function RiskSparkline({
  dataPoints,
  width = 60,
  height = 24,
  color,
}: RiskSparklineProps) {
  if (!dataPoints.length || dataPoints.length < 2) return null;

  const min = Math.min(...dataPoints);
  const max = Math.max(...dataPoints);
  const range = max - min || 1;
  const padding = 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  // Determine color from trend if not provided
  const trend = dataPoints[dataPoints.length - 1] - dataPoints[0];
  const lineColor = color ?? (trend > 10 ? tokens.risk.critical : trend < -10 ? tokens.success : tokens.textTertiary);

  const points = dataPoints.map((val, i) => {
    const x = padding + (i / (dataPoints.length - 1)) * innerW;
    const y = padding + innerH - ((val - min) / range) * innerH;
    return `${x},${y}`;
  }).join(' ');

  // Last point for the dot
  const lastX = padding + ((dataPoints.length - 1) / (dataPoints.length - 1)) * innerW;
  const lastY = padding + innerH - ((dataPoints[dataPoints.length - 1] - min) / range) * innerH;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={lastX} cy={lastY} r={2} fill={lineColor} />
      </Svg>
    </View>
  );
}
