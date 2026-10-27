// React Three Fiber on top of expo-gl (native). FiberCanvas.web.tsx is the DOM
// one. Hooks come from the same package as the Canvas, or they'd talk to a
// different renderer.
export { Canvas as FiberCanvas, useFrame } from "@react-three/fiber/native";
