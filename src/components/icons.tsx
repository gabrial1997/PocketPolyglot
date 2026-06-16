// SVG icon set (react-native-svg). Dependency-light, crisp at any size, themed via `color`.
// Used by the home screen (play, chevron, sun/moon) and the tab bar (Today/Listen/Progress).
import React from 'react';
import Svg, { Path, Circle, Line, Polygon } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

export function PlayIcon({ size = 14, color }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="7,4 20,12 7,20" fill={color} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 18, color, strokeWidth = 2 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SunIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={strokeWidth} />
      {rays.map((deg) => {
        const r = (deg * Math.PI) / 180;
        return (
          <Line
            key={deg}
            x1={12 + Math.cos(r) * 7}
            y1={12 + Math.sin(r) * 7}
            x2={12 + Math.cos(r) * 9.4}
            y2={12 + Math.sin(r) * 9.4}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}

export function MoonIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CalendarIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Line x1={5} y1={9.5} x2={19} y2={9.5} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={8.5} y1={3.5} x2={8.5} y2={6.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={15.5} y1={3.5} x2={15.5} y2={6.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function SoundIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  const bars: [number, number, number][] = [
    [5, 10, 14],
    [9, 6, 18],
    [13, 9, 15],
    [17, 4, 20],
    [21, 10, 14],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {bars.map(([x, y1, y2]) => (
        <Line key={x} x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

export function BarsIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={6} y1={20} x2={6} y2={13} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={12} y1={20} x2={12} y2={8} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={18} y1={20} x2={18} y2={4} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
