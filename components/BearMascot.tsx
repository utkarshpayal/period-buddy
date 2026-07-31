import React from "react";
import Svg, { Circle, Ellipse } from "react-native-svg";

interface BearMascotProps {
  faceColor: string;
  featureColor: string;
  noseColor: string;
  size?: number;
}

export function BearMascot({ faceColor, featureColor, noseColor, size = 64 }: BearMascotProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={22} cy={22} r={14} fill={faceColor} />
      <Circle cx={78} cy={22} r={14} fill={faceColor} />
      <Circle cx={50} cy={54} r={38} fill={faceColor} />
      <Circle cx={36} cy={50} r={4.2} fill={featureColor} />
      <Circle cx={64} cy={50} r={4.2} fill={featureColor} />
      <Ellipse cx={50} cy={64} rx={7} ry={5} fill={noseColor} />
    </Svg>
  );
}
