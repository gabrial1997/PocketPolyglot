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

export function SettingsIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M12 3.5l1.4 2.2 2.6-.5.9 2.5 2.4 1.1-.5 2.6 1.7 2-1.7 2 .5 2.6-2.4 1.1-.9 2.5-2.6-.5L12 20.5l-1.4-2.2-2.6.5-.9-2.5-2.4-1.1.5-2.6L3 12l1.7-2-.5-2.6 2.4-1.1.9-2.5 2.6.5z"
        stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 18, color, strokeWidth = 2 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BellIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function SparkleIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

export function HelpIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M9.3 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.5 2-2.5 3.7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={17} r={0.6} fill={color} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function InfoIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={12} y1={11} x2={12} y2={16.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={7.8} r={0.6} fill={color} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function LogoutIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 15l3-3-3-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={10} y1={12} x2={20} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function PersonIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.6} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function MailIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M4.5 7.5l7.5 5 7.5-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function GlobeIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function ShieldIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l7 2.5v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9v-6z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

export function CameraIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9a1 1 0 0 1 1-1h2l1.2-2h5.6L15 8h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={3} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function AutoThemeIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  // Half-filled circle = "system / auto".
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 4a8 8 0 0 0 0 16z" fill={color} />
    </Svg>
  );
}

export function CheckIcon({ size = 19, color, strokeWidth = 2.4 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BugIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  // Beta bug-report glyph (BugReportLayer FAB) — stroke style matches the rest of the set.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* body */}
      <Path d="M8 10.5a4 4 0 0 1 8 0v3.5a4 4 0 0 1-8 0z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      {/* antennae */}
      <Path d="M9.6 7.2L7.8 4.8M14.4 7.2l1.8-2.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* legs */}
      <Path d="M8 11.5H4.8M8 14.5l-2.6 1.6M16 11.5h3.2M16 14.5l2.6 1.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* wing seam */}
      <Line x1={12} y1={9} x2={12} y2={16.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function TrashIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
